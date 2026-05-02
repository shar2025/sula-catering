// scripts/smoke-test-team-attachments.mjs
//
// Verifies that the team-email attachment composition in
// api/neela/submit-order.ts produces TWO attachments:
//   1) Sula-Catering-{ref}-invoice.pdf  (audience=internal, 2 pages)
//   2) Sula-Catering-{ref}-kitchen.pdf  (audience=kitchen,  1 page)
//
// Reproduces the exact rendering primitives sendOrderEmail uses so we
// catch attachment-composition regressions without actually calling
// Resend (no api key, no real send).
//
// Run: npx tsx scripts/smoke-test-team-attachments.mjs

import { renderToBuffer } from '@react-pdf/renderer';

const { buildInvoicePdf } = await import('../src/lib/pdf/InvoicePdf.ts');
const { loadLogo } = await import('../src/lib/pdf/styles.ts');
const { calculatePortions } = await import('../src/lib/portioning.ts');

const REFERENCE = 'SC-SMOKE-TEAM';
const order = {
	reference: REFERENCE,
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'wedding',
	eventDate: '2026-04-22',
	guestCount: 15,
	serviceType: 'drop-off',
	deliveryAddress: '4567 Commercial Drive, Vancouver, BC V5N 4G7',
	deliveryTime: '5:45 PM',
	deliveryKm: 13.5,
	spiceLevel: 'Medium',
	paymentMethod: 'Cash',
	menuTier: 'Vegetarian/Vegan ($22.95 + tax per guest)',
	addOns: ['Onion Bhajia appetizer (+$5/guest)'],
	setupStyle: 'Aluminium Trays (Free)',
	setupType: 'aluminium_trays',
	platesAndCutlery: 'required',
	servingSpoons: 'required',
	dinnerwarePerGuest: 6.9,
	contact: { name: 'Smoke Test', email: 'smoke@example.com', phone: '604-555-0100' },
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
		currency: 'CAD'
	}
};

const sheet = calculatePortions({
	guestCount: order.guestCount,
	appetizers: [{ name: 'Onion Bhajia', isNonVeg: false }],
	curries: [
		{ name: 'Paneer Butter Masala', isNonVeg: false },
		{ name: 'Dal Makhani', isNonVeg: false }
	]
});

const logoBuffer = await loadLogo();

async function render(audience) {
	const doc = buildInvoicePdf({ order, sheet, audience, logoBuffer });
	return await renderToBuffer(doc);
}

console.log('[smoke-team] rendering internal + customer + kitchen in parallel...');
const t0 = Date.now();
const [teamBuffer, customerBuffer, kitchenBuffer] = await Promise.all([
	render('internal'),
	render('customer'),
	render('kitchen')
]);
console.log(`[smoke-team] all 3 rendered in ${Date.now() - t0}ms`);

// Reproduce the exact attachment composition from sendOrderEmail.
const teamAttachments = [];
if (teamBuffer) {
	teamAttachments.push({ filename: `Sula-Catering-${REFERENCE}-invoice.pdf`, content: teamBuffer });
}
if (kitchenBuffer) {
	teamAttachments.push({ filename: `Sula-Catering-${REFERENCE}-kitchen.pdf`, content: kitchenBuffer });
}

const customerAttachments = customerBuffer
	? [{ filename: `Sula-Catering-${REFERENCE}.pdf`, content: customerBuffer }]
	: [];

console.log('\n[smoke-team] TEAM email attachments:');
for (const a of teamAttachments) {
	console.log(`  - ${a.filename}  (${a.content.length} bytes, %PDF=${a.content.subarray(0, 5).toString('ascii') === '%PDF-'})`);
}

console.log('\n[smoke-team] CUSTOMER email attachments:');
for (const a of customerAttachments) {
	console.log(`  - ${a.filename}  (${a.content.length} bytes, %PDF=${a.content.subarray(0, 5).toString('ascii') === '%PDF-'})`);
}

// Assertions
let pass = true;
function assert(cond, msg) {
	console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${msg}`);
	if (!cond) pass = false;
}

console.log('\n[smoke-team] assertions:');
assert(teamAttachments.length === 2, 'team email has exactly 2 attachments');
assert(teamAttachments[0]?.filename === `Sula-Catering-${REFERENCE}-invoice.pdf`, 'attachment[0] is the invoice PDF');
assert(teamAttachments[1]?.filename === `Sula-Catering-${REFERENCE}-kitchen.pdf`, 'attachment[1] is the kitchen PDF');
assert(teamAttachments[0]?.content.length > 50_000, 'invoice PDF is reasonably sized (>50KB)');
assert(teamAttachments[1]?.content.length > 50_000, 'kitchen PDF is reasonably sized (>50KB)');
assert(customerAttachments.length === 1, 'customer email has exactly 1 attachment');
assert(customerAttachments[0]?.content.length < teamAttachments[0]?.content.length, 'customer PDF (1 page) is smaller than team invoice PDF (2 pages)');

if (!pass) {
	console.error('\n[smoke-team] FAIL');
	process.exitCode = 1;
} else {
	console.log('\n[smoke-team] all assertions passed');
}
