// scripts/smoke-test-custom-mode.mjs, exercises the new "custom" mode PDF
// rendering path. Custom orders skip Page 2 (formal invoice) + Page 3
// (kitchen sheet); both team and customer copies use the page-1-only
// "submission record" template populated with the customer's free-text menu
// description in a "Menu Notes" row.
//
// Run: npx tsx scripts/smoke-test-custom-mode.mjs

import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const order = {
	reference: 'SC-9999-CUSTOM',
	createdAt: new Date().toISOString(),
	mode: 'custom',
	eventType: 'private',
	eventDate: 'June 14, 2026',
	deliveryTime: '6:00 PM',
	guestCount: 35,
	deliveryAddress: '4567 West 10th Avenue, Vancouver, BC',
	dietary: {
		hasNutAllergy: true,
		notes: 'One guest has a tree-nut allergy, kitchen flag for prep surfaces'
	},
	customMenuDetails:
		"Mostly veg with two chicken dishes for the meat eaters. Definitely Butter Chicken since dad loves it. Something paneer-based, maybe Shahi Paneer. Aloo Saag because it's gluten-free and one cousin needs that. Plenty of naan and rice. Buffet style, family serves themselves. One guest has a tree-nut allergy, please flag for prep.",
	contact: {
		name: 'Priya Singh',
		email: 'priya@example.com',
		phone: '604-555-0123'
	},
	notes: 'Custom order, 60th birthday for dad, family buffet style'
};

const outDir = join(tmpdir(), 'sula-pdf-smoke-custom');
mkdirSync(outDir, { recursive: true });

const logoBuffer = await loadLogo();
console.log('[smoke] logo loaded:', logoBuffer ? logoBuffer.length + ' bytes' : 'null');

// Custom orders only render audience='customer' (page-1-only). The team copy
// reuses that same buffer in the live pipeline.
const sheet = calculatePortions({ guestCount: order.guestCount, appetizers: [], curries: [] });
const t0 = Date.now();
const doc = buildInvoicePdf({ order, sheet, audience: 'customer', logoBuffer, cormorantRegistered: false });
const buf = await renderToBuffer(doc);
const ms = Date.now() - t0;
const path = join(outDir, `${order.reference}-customer.pdf`);
writeFileSync(path, buf);
const head = buf.subarray(0, 5).toString();
console.log(`[smoke] audience=customer (custom mode)  size=${buf.length} bytes  head="${head}"  ${head === '%PDF-' ? 'OK' : 'FAIL'}  ${ms}ms  → ${path}`);

if (head !== '%PDF-') {
	process.exit(1);
}
console.log('[smoke] custom-mode PDF renders cleanly');
console.log('[smoke] open the PDF and verify:');
console.log('  - Title says "CATERING SUBMISSION RECORD"');
console.log('  - "Menu Notes" row contains the verbatim free-text menu description');
console.log('  - NO "Includes" row (Naan, Rice, Chutney standard list suppressed)');
console.log('  - NO "Menu Tier" row (no tier was picked)');
console.log('  - NO curry rows (no menuItems array)');
console.log('  - "Allergies / Dietary Notes" row shows the nut allergy capture');
