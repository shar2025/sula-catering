/**
 * /api/neela/invoice/sample, public PDF preview using mock data.
 * No DB read, no Resend, no env vars required. Generates the same Sula-branded
 * PDF the real endpoint produces, with a "SAMPLE" gold watermark on every
 * page so it's never confused for a real order.
 *
 *   GET /api/neela/invoice/sample                  → all 3 pages (diagnostic)
 *   GET /api/neela/invoice/sample?audience=customer → page 1 only
 *   GET /api/neela/invoice/sample?audience=internal → pages 1 + 2 (events-team)
 *   GET /api/neela/invoice/sample?audience=kitchen  → page 3 only
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildInvoicePdf, type Audience, type InvoiceOrder } from '../../../src/lib/pdf/InvoicePdf.js';
import { loadLogo, loadCormorant } from '../../../src/lib/pdf/styles.js';
import { calculatePortions } from '../../../src/lib/portioning.js';

export const config = { maxDuration: 60 };

const SAMPLE_ORDER: InvoiceOrder = {
	reference: 'SC-SAMPLE',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'wedding',
	eventDate: '2026-04-22',
	guestCount: 15,
	serviceType: 'drop-off',
	deliveryAddress: '4567 Commercial Drive, Vancouver, BC V5N 4G7',
	deliveryTime: '5:45 PM',
	timeWindow: '5:45 PM',
	deliveryKm: 13.5,
	spiceLevel: 'Medium',
	paymentMethod: 'Cash',
	dietary: {
		vegetarianPct: 100,
		hasGlutenFree: true,
		notes: 'Two guests gluten-free; one tree-nut allergy at table 3.'
	},
	menuTier: 'Vegetarian/Vegan ($22.95 + tax per guest)',
	addOns: ['Onion Bhajia appetizer (+$5/guest)'],
	additionalMenuItems: 'Onion Bhajia (Dairy & Gluten free)',
	menuItems: [
		{ kind: 'veg', name: 'Paneer Butter Masala', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Dal Makhani' },
		{ kind: 'appetizer', name: 'Onion Bhajia', diet: 'Dairy & Gluten Free' }
	],
	setupStyle: 'Aluminium Trays (Free)',
	setupType: 'aluminium_trays',
	platesAndCutlery: 'required',
	servingSpoons: 'required',
	dinnerwarePerGuest: 6.9,
	contact: {
		name: 'Shar Vittal',
		email: 'shar@example.com',
		phone: '604-555-0100'
	},
	notes: '',
	quote: {
		line_items: [
			{ label: 'Vegetarian/Vegan ($22.95 + tax per guest)', qty: 15, unit_price: 22.95, amount: 344.25 },
			{ label: 'Add Onion Bhajia (Dairy & Gluten free)', qty: 15, unit_price: 5.00, amount: 75.00 },
			{ label: 'Dinnerware ($6.90/Person)', qty: 15, unit_price: 6.90, amount: 103.50 },
			{ label: 'Aluminium Trays (Free)', qty: 1, unit_price: 0, amount: 0 },
			{ label: 'Delivery Fee (13.5 KM)', qty: 1, unit_price: 5.00, amount: 5.00 }
		],
		subtotal: 527.75,
		tax_label: 'GST 5%',
		tax_amount: 26.39,
		total: 554.14,
		currency: 'CAD',
		disclaimer: 'Preliminary estimate. Final quote will come from the events team in writing.'
	}
};

function parseAudience(raw: string | string[] | undefined): Audience {
	const v = Array.isArray(raw) ? raw[0] : raw || '';
	const s = String(v).toLowerCase();
	if (s === 'customer') return 'customer';
	if (s === 'kitchen') return 'kitchen';
	if (s === 'internal') return 'internal';
	return 'all';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const audience = parseAudience(req.query?.audience);
	console.log('[neela-invoice-sample] hit', { audience });

	const sheet = calculatePortions({
		guestCount: SAMPLE_ORDER.guestCount as number,
		appetizers: [{ name: 'Onion Bhajia', isNonVeg: false }],
		curries: [
			{ name: 'Paneer Butter Masala', isNonVeg: false },
			{ name: 'Dal Makhani', isNonVeg: false }
		]
	});

	try {
		const [logoBuffer, cormorantBuffer] = await Promise.all([loadLogo(), loadCormorant()]);
		const doc = buildInvoicePdf({
			order: SAMPLE_ORDER,
			sheet,
			audience,
			watermark: 'SAMPLE',
			logoBuffer,
			cormorantRegistered: !!cormorantBuffer
		});
		const buffer = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);

		const filename = audience === 'kitchen'
			? 'SC-SAMPLE-kitchen.pdf'
			: audience === 'customer'
				? 'Sula-Catering-SAMPLE.pdf'
				: 'SC-SAMPLE-full.pdf';
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
		res.setHeader('Cache-Control', 'public, max-age=300');
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
