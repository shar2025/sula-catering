/**
 * /api/neela/invoice/[reference], generates the Sula PDF invoice on demand.
 *
 * Reads the order from neela_orders by reference, runs the portioning
 * calculator, builds the Sula-branded PDF via @react-pdf/renderer, and
 * streams it back as application/pdf.
 *
 * Query params:
 *   ?audience=customer  → page 1 ONLY (catering details, no pricing).
 *                         The customer never sees Neela's preliminary line-items;
 *                         events team controls when the official quote goes out.
 *   ?audience=internal  → pages 1 + 2 (catering details + formal invoice).
 *                         The events-team copy. Kitchen sheet is intentionally
 *                         excluded; back-office discussions don't need it.
 *   ?audience=kitchen   → page 3 only (kitchen sheet, prep workflow).
 *   default             → all 3 pages (diagnostic / legacy alias 'all').
 *
 * Required env:
 *   POSTGRES_URL , Vercel Postgres / Neon (where neela_orders lives)
 *
 * 404 if the reference isn't found. 503 if Postgres isn't configured.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildInvoicePdf, type Audience, type InvoiceOrder } from '../../../src/lib/pdf/InvoicePdf.js';
import { loadLogo, loadCormorant } from '../../../src/lib/pdf/styles.js';
import { calculatePortions, type MenuItem } from '../../../src/lib/portioning.js';

export const config = { maxDuration: 60 };

interface OrderRow {
	reference: string;
	created_at: string | Date;
	mode: string;
	order_json: Record<string, unknown> | string;
}

function parseAudience(raw: string | string[] | undefined): Audience {
	const v = Array.isArray(raw) ? raw[0] : raw || '';
	const s = String(v).toLowerCase();
	// 'customer' = page 1 ONLY (catering details, no pricing). The customer
	// never sees Neela's preliminary line-items, events team controls when
	// the official quote goes out.
	if (s === 'customer') return 'customer';
	if (s === 'kitchen') return 'kitchen';
	if (s === 'internal') return 'internal';
	// Default = all 3 pages (events-team copy)
	return 'all';
}

// Heuristic: try to split menu items into appetizers/curries based on the
// stored order's free-text fields. Real orders may not have structured menu
// arrays yet (Neela's JSON shape leaves them ad hoc), so we infer from
// menuTier + addOns + notes.
function inferMenu(orderJson: Record<string, unknown>): { appetizers: MenuItem[]; curries: MenuItem[] } {
	const appetizers: MenuItem[] = [];
	const curries: MenuItem[] = [];

	const addOns = Array.isArray(orderJson.addOns) ? (orderJson.addOns as string[]) : [];
	for (const a of addOns) {
		const lower = a.toLowerCase();
		if (lower.includes('appetizer')) {
			appetizers.push({ name: a, isNonVeg: /chicken|wings|tandoori wing|kebab/i.test(a) });
		} else if (lower.includes('curry') || lower.includes('chicken') || lower.includes('lamb') || lower.includes('paneer') || lower.includes('dal') || lower.includes('saag')) {
			curries.push({ name: a, isNonVeg: /chicken|lamb|wings|kebab/i.test(a) });
		}
	}

	const tier = String(orderJson.menuTier || '').toLowerCase();
	// Default fallback by tier when nothing was extracted from add-ons. Matches
	// the kitchen-sheet reference test (Veg/Vegan tier → 1 app + 2 veg curries).
	if (curries.length === 0) {
		if (tier.includes('vegetarian') || tier.includes('vegan')) {
			curries.push({ name: 'Paneer Butter Masala', isNonVeg: false });
			curries.push({ name: 'Dal Makhani', isNonVeg: false });
		} else if (tier.includes('meat lovers')) {
			curries.push({ name: 'Butter Chicken', isNonVeg: true });
			curries.push({ name: 'Chicken Saagwala', isNonVeg: true });
			curries.push({ name: 'Lamb Rogan Josh', isNonVeg: true });
			curries.push({ name: 'Lamb Pasanda', isNonVeg: true });
		} else if (tier.includes('option 1')) {
			curries.push({ name: 'Veg Curry #1', isNonVeg: false });
			curries.push({ name: 'Veg Curry #2', isNonVeg: false });
			curries.push({ name: 'Non-Veg Curry', isNonVeg: true });
		} else if (tier.includes('option 2')) {
			curries.push({ name: 'Veg Curry #1', isNonVeg: false });
			curries.push({ name: 'Veg Curry #2', isNonVeg: false });
			curries.push({ name: 'Non-Veg Curry #1', isNonVeg: true });
			curries.push({ name: 'Non-Veg Curry #2', isNonVeg: true });
		} else if (tier.includes('option 3') || tier.includes('option 4')) {
			curries.push({ name: 'Veg Curry #1', isNonVeg: false });
			curries.push({ name: 'Veg Curry #2', isNonVeg: false });
			curries.push({ name: 'Non-Veg Curry #1', isNonVeg: true });
			curries.push({ name: 'Non-Veg Curry #2', isNonVeg: true });
		} else if (tier.includes('appetizer') || tier.includes('street food')) {
			// Appetizer-heavy tier, represented mostly by the appetizer block
		}
	}
	if (appetizers.length === 0) {
		if (tier.includes('option 3') || tier.includes('appetizer')) {
			appetizers.push({ name: 'Veg Appetizer', isNonVeg: false });
		} else if (tier.includes('option 4')) {
			appetizers.push({ name: 'Non-Veg Appetizer', isNonVeg: true });
		} else if (tier.includes('vegetarian') || tier.includes('vegan')) {
			// Reference test: 1 appetizer (Onion Bhajia) for the 15-guest case
			appetizers.push({ name: 'Onion Bhajia', isNonVeg: false });
		}
	}

	return { appetizers, curries };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-invoice] hit', req.method, req.url);
	const reference = (req.query?.reference as string | string[] | undefined);
	const refStr = (Array.isArray(reference) ? reference[0] : reference || '').trim();
	if (!refStr) {
		return res.status(400).json({ error: 'reference required in path' });
	}

	const audience = parseAudience(req.query?.audience);

	const url = process.env.POSTGRES_URL;
	if (!url) {
		console.warn('[neela-invoice] no POSTGRES_URL');
		return res.status(503).json({ error: 'invoice storage not configured' });
	}

	let row: OrderRow | undefined;
	try {
		const sql = neon(url);
		const rows = (await sql`
			SELECT reference, created_at, mode, order_json
			FROM neela_orders
			WHERE reference = ${refStr}
			LIMIT 1
		`) as OrderRow[];
		row = rows[0];
	} catch (err) {
		console.error('[neela-invoice] db error', err);
		return res.status(500).json({ error: 'db error' });
	}
	if (!row) {
		return res.status(404).json({ error: 'reference not found' });
	}

	const orderJson = (typeof row.order_json === 'string' ? JSON.parse(row.order_json) : row.order_json) as Record<string, unknown>;
	const order: InvoiceOrder = {
		reference: row.reference,
		createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
		mode: row.mode || 'full',
		eventType: orderJson.eventType as string | undefined,
		eventDate: orderJson.eventDate as string | undefined,
		guestCount: orderJson.guestCount as number | string | undefined,
		serviceType: orderJson.serviceType as string | undefined,
		location: orderJson.location as InvoiceOrder['location'],
		timeWindow: orderJson.timeWindow as string | undefined,
		dietary: orderJson.dietary as InvoiceOrder['dietary'],
		menuTier: orderJson.menuTier as string | undefined,
		addOns: Array.isArray(orderJson.addOns) ? (orderJson.addOns as string[]) : undefined,
		setupStyle: orderJson.setupStyle as string | undefined,
		contact: (orderJson.contact as InvoiceOrder['contact']) || { name: '', email: '' },
		notes: orderJson.notes as string | undefined,
		quote: orderJson.quote as InvoiceOrder['quote']
	};

	const { appetizers, curries } = inferMenu(orderJson);
	const guestCount = typeof order.guestCount === 'number' ? order.guestCount : parseInt(String(order.guestCount || '0'), 10) || 0;
	const sheet = calculatePortions({
		guestCount,
		appetizers,
		curries
	});

	try {
		const [logoBuffer, cormorantBuffer] = await Promise.all([loadLogo(), loadCormorant()]);
		const pdfDoc = buildInvoicePdf({ order, sheet, audience, logoBuffer, cormorantRegistered: !!cormorantBuffer });
		// renderToBuffer wants ReactElement<DocumentProps>; the typed createElement
		// chain produces a structural match but TypeScript can't narrow without help.
		const buffer = await renderToBuffer(pdfDoc as unknown as Parameters<typeof renderToBuffer>[0]);
		const filename = audience === 'kitchen'
			? `${order.reference}-kitchen.pdf`
			: audience === 'customer'
				? `Sula-Catering-${order.reference}.pdf`
				: `${order.reference}-full.pdf`;
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
		res.setHeader('Cache-Control', 'private, no-cache');
		console.log('[neela-invoice] rendered', { reference: order.reference, audience, bytes: buffer.length, hasLogo: !!logoBuffer });
		return res.status(200).send(buffer);
	} catch (err) {
		const e = err as { message?: string; stack?: string; name?: string };
		console.error('[neela-invoice] render failed', {
			reference: refStr,
			audience,
			err: e?.message,
			name: e?.name,
			stack: e?.stack
		});
		return res.status(500).json({
			error: 'pdf render failed',
			detail: e?.message || String(err),
			name: e?.name
		});
	}
}
