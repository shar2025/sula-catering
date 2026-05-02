/**
 * /api/neela/invoice/sample — public PDF preview using mock data.
 * No DB read, no Resend, no env vars required. Generates the same Sula-branded
 * PDF the real endpoint produces, with a "SAMPLE" gold watermark on pages 1+2
 * so it's never confused for a real order.
 *
 *   GET /api/neela/invoice/sample                 → all 3 pages
 *   GET /api/neela/invoice/sample?audience=customer → pages 1+2 (what customer sees)
 *   GET /api/neela/invoice/sample?audience=kitchen  → page 3 (what kitchen sees)
 *
 * Useful for showing the brand to stakeholders without spinning up a real order.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildInvoicePdf, type Audience, type InvoiceOrder } from '../../../src/lib/pdf/InvoicePdf.js';
import { loadLogo } from '../../../src/lib/pdf/styles.js';
import { calculatePortions } from '../../../src/lib/portioning.js';

export const config = { maxDuration: 60 };

const SAMPLE_ORDER: InvoiceOrder = {
	reference: 'SC-SAMPLE',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'wedding',
	eventDate: 'August 15, 2026',
	guestCount: 80,
	serviceType: 'drop-off',
	location: { city: 'Surrey', venueOrAddress: 'Grand Taj Banquet Hall' },
	timeWindow: '6:00 PM service',
	dietary: {
		vegetarianPct: 60,
		hasJain: false,
		hasGlutenFree: true,
		hasNutAllergy: true,
		notes: '60% vegetarian; one guest with a tree-nut allergy at table 3'
	},
	menuTier: 'Vegetarian/Vegan ($24.95 + tax per guest)',
	addOns: ['Onion Bhajia appetizer (+$5/guest)'],
	setupStyle: 'Heated stainless steel',
	contact: {
		name: 'Sample Customer',
		email: 'customer@example.com',
		phone: '604-555-0100'
	},
	notes: 'Sangeet ceremony, please coordinate delivery with venue 6pm sharp. Sample reference, not a real order.',
	quote: {
		line_items: [
			{ label: 'Vegetarian/Vegan menu × 80 guests @ $24.95', amount: 1996.00 },
			{ label: 'Onion Bhajia appetizer × 80 @ $5.00', amount: 400.00 },
			{ label: 'Heated stainless steel setup', amount: 325.00 },
			{ label: 'Delivery (10 to 15 km zone)', amount: 5.00 }
		],
		subtotal: 2726.00,
		tax_label: 'GST 5%',
		tax_amount: 136.30,
		total: 2862.30,
		currency: 'CAD',
		disclaimer: 'Preliminary estimate. Final quote in writing from the events team.'
	}
};

function parseAudience(raw: string | string[] | undefined): Audience {
	const v = Array.isArray(raw) ? raw[0] : raw || '';
	const s = String(v).toLowerCase();
	if (s === 'customer') return 'customer';
	if (s === 'kitchen') return 'kitchen';
	return 'all';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const audience = parseAudience(req.query?.audience);
	console.log('[neela-invoice-sample] hit', { audience });

	// Match the menu the kitchen sheet would render for the sample's tier.
	// Reference test: 15 guests Veg/Vegan = Onion Bhajia + Paneer Butter + Dal Makhani.
	// For 80 guests at the same tier, identical menu shape, just bigger portions.
	const sheet = calculatePortions({
		guestCount: SAMPLE_ORDER.guestCount as number,
		appetizers: [{ name: 'Onion Bhajia', isNonVeg: false }],
		curries: [
			{ name: 'Paneer Butter Masala', isNonVeg: false },
			{ name: 'Dal Makhani', isNonVeg: false }
		]
	});

	try {
		const logoBuffer = await loadLogo();
		const doc = buildInvoicePdf({
			order: SAMPLE_ORDER,
			sheet,
			audience,
			watermark: 'SAMPLE',
			logoBuffer
		});
		const buffer = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);

		const filename = audience === 'kitchen'
			? 'SC-SAMPLE-kitchen.pdf'
			: audience === 'customer'
				? 'Sula-Catering-SAMPLE.pdf'
				: 'SC-SAMPLE-full.pdf';
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
		res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache; sample is static
		console.log('[neela-invoice-sample] rendered', { audience, bytes: buffer.length, hasLogo: !!logoBuffer });
		return res.status(200).send(buffer);
	} catch (err) {
		const e = err as { message?: string; stack?: string; name?: string };
		console.error('[neela-invoice-sample] render failed', {
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
