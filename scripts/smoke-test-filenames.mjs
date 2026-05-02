// scripts/smoke-test-filenames.mjs
//
// Pinpoint smoke test for the buildPdfFilename helper and the new
// month-name date format in PDF bodies. No DB, no Resend, no API hit:
// imports the helpers directly and asserts on their pure outputs.
//
// Run: node scripts/smoke-test-filenames.mjs

import { buildPdfFilename } from '../src/lib/pdf/filename.ts';

let pass = true;
function eq(actual, expected, label) {
	const ok = actual === expected;
	console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}\n         got:  ${actual}\n         want: ${expected}`);
	if (!ok) pass = false;
}

console.log('[smoke-filename] customer / invoice / kitchen variants for "Shar Vittal" + "May 22 2026"');
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: 'May 22 2026' }),
	'Sula-Catering-Shar-Vittal-22-May-2026.pdf',
	'customer'
);
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: 'May 22 2026', suffix: 'invoice' }),
	'Sula-Catering-Shar-Vittal-22-May-2026-invoice.pdf',
	'team invoice'
);
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: 'May 22 2026', suffix: 'kitchen' }),
	'Sula-Catering-Shar-Vittal-22-May-2026-kitchen.pdf',
	'kitchen sheet'
);

console.log('[smoke-filename] alternate eventDate formats all collapse to DD-MMM-YYYY');
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: '2026-05-22' }),
	'Sula-Catering-Shar-Vittal-22-May-2026.pdf',
	'ISO 2026-05-22'
);
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: '22/05/2026' }),
	'Sula-Catering-Shar-Vittal-22-May-2026.pdf',
	'DD/MM/YYYY 22/05/2026'
);
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: '22-05-2026' }),
	'Sula-Catering-Shar-Vittal-22-May-2026.pdf',
	'DD-MM-YYYY 22-05-2026'
);

console.log('[smoke-filename] customer name sanitization');
eq(
	buildPdfFilename({ customerName: "John O'Brien", eventDate: '2026-05-22' }),
	'Sula-Catering-John-O-Brien-22-May-2026.pdf',
	"apostrophe -> hyphen, John O'Brien"
);
eq(
	buildPdfFilename({ customerName: 'Marcus & Sarah', eventDate: '2026-05-22' }),
	'Sula-Catering-Marcus-Sarah-22-May-2026.pdf',
	'ampersand + spaces collapse, Marcus & Sarah'
);
eq(
	buildPdfFilename({ customerName: '   ', eventDate: '2026-05-22' }),
	'Sula-Catering-Customer-22-May-2026.pdf',
	'whitespace-only name -> Customer fallback'
);
eq(
	buildPdfFilename({ customerName: undefined, eventDate: '2026-05-22' }),
	'Sula-Catering-Customer-22-May-2026.pdf',
	'undefined name -> Customer fallback'
);
eq(
	buildPdfFilename({ customerName: 'A'.repeat(50), eventDate: '2026-05-22' }),
	`Sula-Catering-${'A'.repeat(30)}-22-May-2026.pdf`,
	'name capped at 30 chars'
);

console.log('[smoke-filename] missing date -> date segment dropped entirely');
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: undefined }),
	'Sula-Catering-Shar-Vittal.pdf',
	'undefined eventDate'
);
eq(
	buildPdfFilename({ customerName: 'Shar Vittal', eventDate: '' }),
	'Sula-Catering-Shar-Vittal.pdf',
	'empty-string eventDate'
);

console.log('[smoke-filename] PDF body date format (Page 1 + Kitchen sheet)');
const { renderPage1 } = await import('../src/lib/pdf/Page1Details.ts');
// Cheap structural test: render Page 1 with our test order and walk the
// element tree for a Text node containing "22 May 2026". renderPage1
// returns a React element tree; we don't render to PDF here, just inspect
// the values that flow into the Event Date row.
import React from 'react';

const sampleOrder = {
	reference: 'SC-SMOKE',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'wedding',
	eventDate: 'May 22 2026',
	guestCount: 15,
	contact: { name: 'Shar Vittal', email: 'shar@example.com' }
};

function collectStrings(node, out) {
	if (node === null || node === undefined) return;
	if (typeof node === 'string') { out.push(node); return; }
	if (typeof node !== 'object') return;
	if (Array.isArray(node)) { for (const c of node) collectStrings(c, out); return; }
	const children = node.props?.children;
	if (children !== undefined) collectStrings(children, out);
}

const page1Tree = renderPage1(sampleOrder, { forCustomer: true });
const allStrings = [];
collectStrings(page1Tree, allStrings);
const joined = allStrings.join('\n');
const hasNewFormat = joined.includes('22 May 2026');
const hasOldFormat = /22\/05\/2026/.test(joined);
console.log(`  ${hasNewFormat ? 'OK  ' : 'FAIL'} Page 1 renders Event Date as "22 May 2026"`);
console.log(`  ${!hasOldFormat ? 'OK  ' : 'FAIL'} Page 1 does NOT render the old "22/05/2026" format`);
if (!hasNewFormat || hasOldFormat) pass = false;

if (!pass) {
	console.error('\n[smoke-filename] FAIL');
	process.exitCode = 1;
} else {
	console.log('\n[smoke-filename] all assertions passed');
}
