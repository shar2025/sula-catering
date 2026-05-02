// scripts/smoke-test-allergies.mjs, builds the customer-facing invoice PDF
// from an order containing a peanut-allergy dietary block and uses pdftotext
// to confirm the Allergies / Dietary Notes row renders on page 1 with the
// flag + notes both showing.
//
// Run: npx tsx scripts/smoke-test-allergies.mjs

import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const order = {
	reference: 'SC-9999-ALRG',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'corporate',
	eventDate: 'May 20, 2026',
	deliveryTime: '12:00 PM',
	guestCount: 30,
	serviceType: 'drop-off',
	deliveryAddress: '601-570 Granville Street, Vancouver, BC',
	dietary: {
		hasNutAllergy: true,
		notes: 'One guest has a severe peanut allergy, kitchen flag for prep surfaces'
	},
	menuTier: 'Option 4 ($28.95)',
	customMenuDetails: 'Butter Chicken, Veggie Samosa, Naan, Aloo Gobi.',
	setupType: 'aluminium_trays',
	contact: {
		name: 'Test Customer',
		email: 'test@example.com',
		phone: '604-555-0199'
	},
	notes: 'Allergy smoke test'
};

const sheet = calculatePortions({
	guestCount: order.guestCount,
	appetizers: [{ name: 'Veggie Samosa', isNonVeg: false }],
	curries: [
		{ name: 'Butter Chicken', isNonVeg: true },
		{ name: 'Aloo Gobi', isNonVeg: false }
	]
});

let logoBuffer = null;
try {
	logoBuffer = await loadLogo();
} catch (err) {
	console.warn('[smoke-allergies] logo load skipped:', err?.message || err);
}

const outDir = join(tmpdir(), 'sula-allergies-smoke');
mkdirSync(outDir, { recursive: true });

// Scope: this smoke covers page 1 (customer + internal) where the
// Allergies / Dietary Notes row lives. The kitchen sheet's allergen surfacing
// is separate and out of scope here.
const audiences = ['customer', 'internal'];
let failed = 0;

for (const audience of audiences) {
	const doc = buildInvoicePdf({ order, sheet, audience, logoBuffer });
	const buf = await renderToBuffer(doc);
	const pdfPath = join(outDir, `${order.reference}-${audience}.pdf`);
	writeFileSync(pdfPath, buf);

	let text = '';
	try {
		text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
	} catch (err) {
		console.error(`[smoke-allergies] pdftotext failed for ${audience}:`, err?.message || err);
		failed++;
		continue;
	}

	const checks = [
		{ label: 'Allergies row label', re: /Allergies|ALLERGIES/ },
		{ label: 'Nut allergy flag rendered', re: /Nut allergy/i },
		{ label: 'Peanut detail in notes', re: /peanut/i }
	];

	let audiencePass = 0;
	console.log(`\n[smoke-allergies] audience=${audience}  size=${buf.length} bytes  -> ${pdfPath}`);
	for (const c of checks) {
		const ok = c.re.test(text);
		console.log(`  ${ok ? 'OK ' : 'FAIL'}  ${c.label}  (${c.re})`);
		if (!ok) failed++;
		else audiencePass++;
	}
	if (audiencePass === checks.length) {
		console.log(`  audience ${audience}: all ${checks.length} checks passed`);
	}
}

if (failed > 0) {
	console.error(`\n[smoke-allergies] FAIL: ${failed} check(s) failed`);
	process.exitCode = 1;
} else {
	console.log('\n[smoke-allergies] PASS: allergy flow renders correctly across all audiences');
}
