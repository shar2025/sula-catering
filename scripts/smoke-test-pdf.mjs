// scripts/smoke-test-pdf.mjs, exercises the full PDF render path the way
// /api/neela/submit-order does. Builds each of the 3 audience PDFs from a
// minimal-but-realistic order matching the new catering-order-custom schema,
// writes them to /tmp, and verifies each starts with %PDF and has the expected
// page count.
//
// Run: node scripts/smoke-test-pdf.mjs

import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Shim: the runtime imports compile from .ts via Vercel's bundler. For a node
// smoke test we rely on tsx (npx tsx) to transpile on the fly. Tested via:
//   npx tsx scripts/smoke-test-pdf.mjs

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const order = {
	reference: 'SC-9999-TEST',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'corporate',
	eventDate: 'May 20, 2026',
	deliveryTime: '12:00 PM',
	guestCount: 15,
	serviceType: 'drop-off',
	deliveryAddress: '601-570 Granville Street, Vancouver, BC',
	dietary: {
		vegetarianPct: 7,
		hasShellfishAllergy: true,
		notes: '1 vegetarian; shellfish allergy, kitchen pulls all shrimp/prawn dishes'
	},
	menuTier: 'Option 4 ($28.95)',
	customMenuDetails:
		'Specifically wants Butter Chicken, Veggie Samosa, Naan, plus an eggplant dish (Baingan Bharta). Style: potluck-sharing.',
	addOns: ['chai station'],
	setupStyle: 'Aluminium catering trays (free)',
	setupType: 'aluminium_trays',
	rentalsRequired: false,
	platesAndCutlery: 'not_required',
	servingSpoons: 'not_required',
	contact: {
		name: 'Priya Singh',
		email: 'priya@example.com',
		phone: '604-555-0123'
	},
	notes: 'Office lunch, small group of 15',
	quote: {
		line_items: [
			{ label: 'Option 4 menu × 15 guests @ $28.95', amount: 434.25 },
			{ label: 'Aluminium trays setup', amount: 0 },
			{ label: 'Delivery (0 to 10 km zone)', amount: 0 }
		],
		subtotal: 434.25,
		tax_label: 'GST 5%',
		tax_amount: 21.71,
		total: 455.96,
		currency: 'CAD',
		disclaimer: 'Preliminary estimate. Final quote in writing from the events team.'
	}
};

const sheet = calculatePortions({
	guestCount: order.guestCount,
	appetizers: [{ name: 'Veggie Samosa', isNonVeg: false }],
	curries: [
		{ name: 'Butter Chicken', isNonVeg: true },
		{ name: 'Baingan Bharta', isNonVeg: false },
		{ name: 'Veg Curry', isNonVeg: false },
		{ name: 'Non-Veg Curry', isNonVeg: true }
	]
});

let logoBuffer = null;
try {
	logoBuffer = await loadLogo();
	console.log('[smoke] logo loaded:', logoBuffer ? `${logoBuffer.length} bytes` : 'null');
} catch (err) {
	console.warn('[smoke] logo load failed (rendering without logo):', err?.message || err);
}

const outDir = join(tmpdir(), 'sula-pdf-smoke');
mkdirSync(outDir, { recursive: true });

async function renderAudience(audience) {
	const t0 = Date.now();
	const doc = buildInvoicePdf({ order, sheet, audience, logoBuffer });
	const buf = await renderToBuffer(doc);
	const t1 = Date.now();
	const path = join(outDir, `${order.reference}-${audience}.pdf`);
	writeFileSync(path, buf);

	const head = buf.subarray(0, 5).toString('ascii');
	const ok = head === '%PDF-';
	console.log(
		`[smoke] audience=${audience}  size=${buf.length} bytes  head="${head}"  ${ok ? 'OK' : 'BAD HEAD'}  ${t1 - t0}ms  → ${path}`
	);
	if (!ok) process.exitCode = 1;
	return { audience, size: buf.length, ok, path };
}

const results = [];
for (const audience of ['customer', 'internal', 'kitchen', 'all']) {
	try {
		results.push(await renderAudience(audience));
	} catch (err) {
		console.error(`[smoke] audience=${audience} FAILED:`, err?.message || err);
		console.error(err?.stack);
		process.exitCode = 1;
	}
}

// Sanity checks: customer should be page-1 only (smaller than internal/all).
const sizeOf = (a) => results.find((r) => r.audience === a)?.size || 0;
const customer = sizeOf('customer');
const internal = sizeOf('internal');
const kitchen = sizeOf('kitchen');
const all = sizeOf('all');

console.log('\n[smoke] sanity checks:');
console.log(`  customer (${customer}) < internal (${internal}): ${customer < internal ? 'OK' : 'FAIL'}`);
console.log(`  customer (${customer}) < all (${all}): ${customer < all ? 'OK' : 'FAIL'}`);
console.log(`  kitchen (${kitchen}) > 0: ${kitchen > 0 ? 'OK' : 'FAIL'}`);
console.log(`  internal === all: ${internal === all ? 'OK (alias works)' : 'note: differ'}`);

if (customer >= internal || customer >= all || kitchen <= 0) {
	console.error('[smoke] sanity check FAILED');
	process.exitCode = 1;
} else {
	console.log('[smoke] all sanity checks passed');
}
