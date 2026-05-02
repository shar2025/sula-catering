// scripts/smoke-test-neela-flag.mjs, runs a multi-turn conversation against
// the live /api/neela endpoint that should culminate in Neela emitting a
// NEELA_FLAG marker. Verifies (a) the marker is in the API response, (b) the
// server returns flagged: true, and (c) the warm "6 hours" phrasing is present.
//
// HEADS UP: when the server parses the marker it WILL fire a real [FLAG]
// email to events@sulaindianrestaurant.com (or NEELA_FLAG_TO if set, or
// NEELA_TEST_EMAIL in test mode). The contact details below are intentionally
// labeled "Smoke Test" so the team can recognize and dismiss it.
//
// Run: node scripts/smoke-test-neela-flag.mjs
//   or: NEELA_BASE_URL=https://sula-foo.vercel.app node scripts/smoke-test-neela-flag.mjs

const BASE = process.env.NEELA_BASE_URL || 'https://sulacatering.com';
const ENDPOINT = `${BASE.replace(/\/$/, '')}/api/neela`;

const sessionId = `smoke-flag-${Date.now()}`;

// Multi-turn conversation: out-of-area Toronto ask, customer pushes for a
// special exception, then provides clearly-fake contact details. Expect Neela
// to emit NEELA_FLAG on the final reply.
const userTurns = [
	'Can you cater for 50 people in Toronto next month?',
	"It's actually a one-off, my company is flying execs in from Toronto and we want Sula specifically. Worth flagging?",
	'Name: Smoke Test Bot, Phone: 000-000-0000, Email: smoke-test@example.com'
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
	return { reply: String(data.reply || ''), flagged: !!data.flagged, ms };
}

console.log(`[smoke-flag] target: ${ENDPOINT}`);
console.log(`[smoke-flag] session: ${sessionId}\n`);

let lastReply = '';
let lastFlagged = false;
for (let i = 0; i < userTurns.length; i++) {
	history.push({ role: 'user', content: userTurns[i] });
	console.log(`turn ${i + 1}/${userTurns.length}  USER: ${userTurns[i]}`);
	let result;
	try {
		result = await callNeela(history);
	} catch (err) {
		console.error(`[smoke-flag] HTTP failure on turn ${i + 1}:`, err.message);
		process.exit(1);
	}
	console.log(`turn ${i + 1}/${userTurns.length}  NEELA (${result.ms}ms, flagged=${result.flagged}):`);
	console.log(result.reply);
	console.log('');
	history.push({ role: 'assistant', content: result.reply });
	lastReply = result.reply;
	lastFlagged = result.flagged;
}

console.log('=== VERIFICATION ===');
const checks = [
	{ name: 'NEELA_FLAG marker present in final reply', pass: lastReply.includes('<<<NEELA_FLAG>>>') && lastReply.includes('<<<END_NEELA_FLAG>>>') },
	{ name: 'API response.flagged === true', pass: lastFlagged === true },
	{ name: 'Reply contains "6 hours" commitment', pass: /6\s*hours/i.test(lastReply) },
	{ name: 'Reply contains "events team"', pass: /events team/i.test(lastReply) },
	{ name: 'Marker JSON includes Toronto context', pass: /toronto/i.test(lastReply) }
];
let allPassed = true;
for (const c of checks) {
	console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);
	if (!c.pass) allPassed = false;
}
process.exit(allPassed ? 0 : 1);
