// scripts/smoke-test-neela-allergies.mjs, runs a multi-turn conversation
// against the live /api/neela endpoint and verifies that the order-capture
// marker emits a dietary block with hasNutAllergy: true and notes mentioning
// peanut. Defaults to https://sulacatering.com but accepts a custom base via
// NEELA_BASE_URL (e.g. a Vercel preview URL).
//
// Run: node scripts/smoke-test-neela-allergies.mjs
//   or: NEELA_BASE_URL=https://sula-foo.vercel.app node scripts/smoke-test-neela-allergies.mjs

const BASE = process.env.NEELA_BASE_URL || 'https://sulacatering.com';
const ENDPOINT = `${BASE.replace(/\/$/, '')}/api/neela`;

const sessionId = `smoke-allergies-${Date.now()}`;

// Multi-turn walkthrough that hits each canonical step end-to-end and
// surfaces a peanut allergy near the end. Last user turn is the lock-in.
// Order mirrors the persona's canonical 7-step walkthrough so the model
// closes cleanly with the order marker.
const userTurns = [
	"I'm ready to plan, need lunch catering for our office on June 18 around noon",
	'32 people, just a regular team lunch',
	'601-570 Granville Street, Vancouver. Aluminium trays are fine.',
	'Option 4 sounds right, and one guest has a serious peanut allergy',
	'Just build something balanced around Option 4, no specific dishes',
	'Plates and cutlery yes, spoons too please.',
	'Marcus Tan, 604-555-0142, marcus@example.com. Lock it in, send the PDF.'
];

const history = [];

async function callNeela(messages) {
	const t0 = Date.now();
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionId, messages })
	});
	const ms = Date.now() - t0;
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} (${ms}ms): ${body.slice(0, 300)}`);
	}
	const data = await res.json();
	return { reply: String(data.reply || ''), ms };
}

console.log(`[smoke-neela] target: ${ENDPOINT}`);
console.log(`[smoke-neela] session: ${sessionId}\n`);

let lastReply = '';
for (let i = 0; i < userTurns.length; i++) {
	history.push({ role: 'user', content: userTurns[i] });
	console.log(`turn ${i + 1}/${userTurns.length}  USER: ${userTurns[i]}`);
	let result;
	try {
		result = await callNeela(history);
	} catch (err) {
		console.error(`[smoke-neela] HTTP failure on turn ${i + 1}:`, err.message);
		process.exit(1);
	}
	lastReply = result.reply;
	console.log(`              NEELA (${result.ms}ms): ${lastReply.slice(0, 220)}${lastReply.length > 220 ? '...' : ''}\n`);
	history.push({ role: 'assistant', content: lastReply });
}

console.log('--- FINAL REPLY ---');
console.log(lastReply);
console.log('--- END FINAL REPLY ---\n');

let failed = 0;
function check(label, cond) {
	const status = cond ? 'OK ' : 'FAIL';
	console.log(`  ${status}  ${label}`);
	if (!cond) failed++;
}

const markerRe = /<<<NEELA_ORDER_READY>>>\s*([\s\S]*?)\s*<<<END_NEELA_ORDER_READY>>>/;
const markerMatch = lastReply.match(markerRe);
check('Order-ready marker emitted on final turn', !!markerMatch);

let parsed = null;
if (markerMatch) {
	const jsonStr = markerMatch[1].trim();
	try {
		parsed = JSON.parse(jsonStr);
		check('Marker contents parse as valid JSON', true);
	} catch (err) {
		check('Marker contents parse as valid JSON', false);
		console.error('  parse error:', err.message);
		console.error('  raw json:', jsonStr.slice(0, 600));
	}
}

if (parsed) {
	check('mode === "full"', parsed.mode === 'full');
	check('contact.name = "Marcus Tan"', parsed.contact?.name === 'Marcus Tan');
	check('contact.email = "marcus@example.com"', parsed.contact?.email === 'marcus@example.com');
	check('guestCount === 32', Number(parsed.guestCount) === 32);
	check('dietary block present', !!parsed.dietary && typeof parsed.dietary === 'object');
	check('dietary.hasNutAllergy === true', parsed.dietary?.hasNutAllergy === true);
	check('dietary.notes is a non-empty string',
		typeof parsed.dietary?.notes === 'string' && parsed.dietary.notes.length > 0);
	check('dietary.notes mentions "peanut"', /peanut/i.test(parsed.dietary?.notes || ''));
	check('Uses hasShellfishAllergy NOT hasShellfish (key spelling)',
		!('hasShellfish' in (parsed.dietary || {})));
	check('No "halal" field on dietary', !('halal' in (parsed.dietary || {})));

	console.log('\n[smoke-neela] dietary block emitted by Neela:');
	console.log(JSON.stringify(parsed.dietary, null, 2));
}

if (failed > 0) {
	console.error(`\n[smoke-neela] FAIL: ${failed} check(s) failed`);
	process.exitCode = 1;
} else {
	console.log('\n[smoke-neela] PASS: persona produces correct dietary capture');
}
