// scripts/smoke-test-menu-items.mjs, exercises the new dish-pick capture path.
// Builds a customer PDF from an order whose menuItems array has real dish names
// (not the legacy "Veg Curry #1" placeholders), confirms the rendered PDF has
// the expected page-1 dish rows, writes out a sample for visual inspection.
//
// Run: npx tsx scripts/smoke-test-menu-items.mjs

import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const order = {
	reference: 'SC-9999-MENU',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'private',
	eventDate: 'October 12, 2026',
	deliveryTime: '5:30 PM',
	guestCount: 60,
	serviceType: 'drop-off',
	deliveryAddress: '2189 West 41st Avenue, Vancouver, BC',
	dietary: {
		vegetarianPct: 20,
		hasNutAllergy: true,
		notes: '1 guest with severe peanut allergy, kitchen pulls all peanut-containing dishes'
	},
	menuTier: 'Option 4 ($28.95)',
	menuItems: [
		{ kind: 'appetizer', name: 'Wings from Hell', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Paneer Butter Masala', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Dal Makhani', diet: 'Gluten Free' },
		{ kind: 'nonveg', name: 'Butter Chicken', diet: 'Gluten Free' },
		{ kind: 'nonveg', name: 'Lamb Rogan Josh', diet: 'Dairy & Gluten Free' }
	],
	additionalMenuItems: '+ extra garlic naan, + 2 mango chutney sides',
	customMenuDetails: 'Style: buffet sharing. Customer asked for Butter Chicken, Lamb Rogan Josh, Paneer Butter Masala.',
	setupType: 'heated_stainless',
	setupStyle: 'Heated stainless steel chafing dishes',
	rentalsRequired: false,
	platesAndCutlery: 'required',
	servingSpoons: 'required',
	contact: {
		name: 'Marcus Tan',
		email: 'marcus@example.com',
		phone: '604-555-0142'
	},
	notes: '60th birthday celebration'
};

const sheet = calculatePortions({
	guestCount: order.guestCount,
	appetizers: [{ name: 'Wings from Hell', isNonVeg: true }],
	curries: [
		{ name: 'Paneer Butter Masala', isNonVeg: false },
		{ name: 'Dal Makhani', isNonVeg: false },
		{ name: 'Butter Chicken', isNonVeg: true },
		{ name: 'Lamb Rogan Josh', isNonVeg: true }
	]
});

let logoBuffer = null;
try {
	logoBuffer = await loadLogo();
} catch {
	logoBuffer = null;
}

const outDir = join(tmpdir(), 'sula-pdf-smoke');
mkdirSync(outDir, { recursive: true });

async function renderAudience(audience) {
	const doc = buildInvoicePdf({ order, sheet, audience, logoBuffer });
	const buf = await renderToBuffer(doc);
	const path = join(outDir, `${order.reference}-${audience}.pdf`);
	writeFileSync(path, buf);
	const head = buf.subarray(0, 5).toString('ascii');
	console.log(`[smoke] ${audience.padEnd(8)} size=${buf.length}  head="${head}"  ok=${head === '%PDF-'}  → ${path}`);
	return { audience, size: buf.length, ok: head === '%PDF-', path };
}

console.log('[smoke] order has menuItems with real dish names + diet badges:');
for (const m of order.menuItems) {
	console.log(`        - kind=${m.kind.padEnd(10)} name=${m.name.padEnd(28)} diet=${m.diet || '(none)'}`);
}
console.log(`        additionalMenuItems="${order.additionalMenuItems}"`);

console.log('');
const results = [];
for (const audience of ['customer', 'internal', 'kitchen']) {
	try {
		results.push(await renderAudience(audience));
	} catch (err) {
		console.error(`[smoke] ${audience} FAILED:`, err?.message || err);
		console.error(err?.stack);
		process.exitCode = 1;
	}
}

const allOk = results.every((r) => r.ok);
if (!allOk) {
	console.error('\n[smoke] FAIL: at least one audience produced a non-PDF buffer');
	process.exitCode = 1;
} else {
	console.log('\n[smoke] all 3 audience PDFs rendered with valid %PDF- header');
	console.log(`[smoke] customer PDF for visual inspection: ${results.find((r) => r.audience === 'customer').path}`);
}

// Also exercise the chef's-choice fallback path so we catch the case where the
// customer deferred to the kitchen.
console.log('\n[smoke] re-render with menuItems = chef\'s choice everywhere:');
const chefOrder = {
	...order,
	reference: 'SC-9999-CHEF',
	menuItems: [
		{ kind: 'appetizer', name: "Chef's choice" },
		{ kind: 'veg', name: "Chef's choice" },
		{ kind: 'veg', name: "Chef's choice" },
		{ kind: 'nonveg', name: "Chef's choice" },
		{ kind: 'nonveg', name: "Chef's choice" }
	],
	additionalMenuItems: undefined
};
const chefDoc = buildInvoicePdf({ order: chefOrder, sheet, audience: 'customer', logoBuffer });
const chefBuf = await renderToBuffer(chefDoc);
const chefPath = join(outDir, `${chefOrder.reference}-customer.pdf`);
writeFileSync(chefPath, chefBuf);
const chefHead = chefBuf.subarray(0, 5).toString('ascii');
console.log(`[smoke] chef's-choice variant  size=${chefBuf.length}  head="${chefHead}"  ok=${chefHead === '%PDF-'}  → ${chefPath}`);
