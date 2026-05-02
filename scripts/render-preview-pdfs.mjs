// scripts/render-preview-pdfs.mjs
// Renders the 3 audience PDFs (customer, internal, kitchen) using the same
// SAMPLE_ORDER that powers /api/neela/invoice/sample, and writes them to
// outputs/ at the repo root with a PREVIEW prefix so they're clearly drafts.
//
// Run: npx tsx scripts/render-preview-pdfs.mjs

import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const SAMPLE_ORDER = {
	reference: 'SC-PREVIEW',
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

const sheet = calculatePortions({
	guestCount: SAMPLE_ORDER.guestCount,
	appetizers: [{ name: 'Onion Bhajia', isNonVeg: false }],
	curries: [
		{ name: 'Paneer Butter Masala', isNonVeg: false },
		{ name: 'Dal Makhani', isNonVeg: false }
	]
});

let logoBuffer = null;
try {
	logoBuffer = await loadLogo();
	console.log('[preview] logo loaded:', logoBuffer ? `${logoBuffer.length} bytes` : 'null');
} catch (err) {
	console.warn('[preview] logo load failed (rendering without logo):', err?.message || err);
}

const outDir = resolve('outputs');
mkdirSync(outDir, { recursive: true });

async function renderAudience(audience, filename) {
	const t0 = Date.now();
	const doc = buildInvoicePdf({ order: SAMPLE_ORDER, sheet, audience, logoBuffer });
	const buf = await renderToBuffer(doc);
	const t1 = Date.now();
	const path = join(outDir, filename);
	writeFileSync(path, buf);

	const head = buf.subarray(0, 5).toString('ascii');
	const ok = head === '%PDF-';
	console.log(
		`[preview] audience=${audience}  size=${buf.length} bytes  head="${head}"  ${ok ? 'OK' : 'BAD HEAD'}  ${t1 - t0}ms`
	);
	console.log(`           → ${path}`);
	if (!ok) process.exitCode = 1;
	return { audience, size: buf.length, ok, path };
}

// Bump the version suffix when iterating so prior previews are not clobbered.
// v1 = first luxury redesign (rendered ◆ as garbage on Helvetica)
// v2 = ornament-free, minimal customer page, gold-eyebrow internal headers
// v3 = audience=internal now pages 1+2 only (no kitchen); page 2 minimal redesign
//      (no alt-row tints, no chip, no plum total stripe, no watermark)
const VERSION = process.env.PREVIEW_VERSION || 'v3';

const results = [];
results.push(await renderAudience('customer', `Sula-PREVIEW-customer-${VERSION}.pdf`));
results.push(await renderAudience('internal', `Sula-PREVIEW-internal-${VERSION}.pdf`));
results.push(await renderAudience('kitchen', `Sula-PREVIEW-kitchen-${VERSION}.pdf`));

console.log('\n[preview] sanity checks:');
const sizeOf = (a) => results.find((r) => r.audience === a)?.size || 0;
const customer = sizeOf('customer');
const internal = sizeOf('internal');
const kitchen = sizeOf('kitchen');
console.log(`  customer (${customer}) < internal (${internal}): ${customer < internal ? 'OK' : 'FAIL'}`);
console.log(`  kitchen  (${kitchen})  > 0:                       ${kitchen > 0 ? 'OK' : 'FAIL'}`);

if (customer >= internal || kitchen <= 0) {
	console.error('[preview] sanity check FAILED');
	process.exitCode = 1;
} else {
	console.log('\n[preview] all sanity checks passed');
	console.log('[preview] PDFs written:');
	for (const r of results) console.log('  ' + r.path);
}
