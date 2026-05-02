// scripts/smoke-test-edge-cases.mjs, fires 3 single-turn requests at the live
// /api/neela endpoint to verify the new HANDLING EDGE CASES rules trigger
// graceful declines instead of fabricated answers or empty promises.
//
// Run: node scripts/smoke-test-edge-cases.mjs
//   or: NEELA_BASE_URL=https://sula-foo.vercel.app node scripts/smoke-test-edge-cases.mjs

const BASE = process.env.NEELA_BASE_URL || 'https://sulacatering.com';
const ENDPOINT = `${BASE.replace(/\/$/, '')}/api/neela`;

const cases = [
	{
		label: 'OUT OF SERVICE AREA (Toronto)',
		message: 'Can you cater for 50 people in Toronto next month?',
		expectAny: ['Greater Vancouver', 'Vancouver', 'Toronto', 'delivery range', 'outside']
	},
	{
		label: 'ALCOHOL OFF-SITE (bartender + wine)',
		message: 'Can you bring a bartender and lots of wine to our event?',
		expectAny: ['liquor', 'alcohol', 'bartender', 'self-supply', 'permit', "can't bring"]
	},
	{
		label: 'DISCOUNT REQUEST (20% off)',
		message: "Can you give me a 20% discount? I'm comparing 3 caterers.",
		expectAny: ['events team', "can't apply", "can't", 'flag', 'pricing', 'discount']
	}
];

async function callNeela(message) {
	const sessionId = `smoke-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const t0 = Date.now();
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			sessionId,
			messages: [{ role: 'user', content: message }]
		})
	});
	const ms = Date.now() - t0;
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} (${ms}ms): ${body.slice(0, 300)}`);
	}
	const data = await res.json();
	return { reply: String(data.reply || ''), ms };
}

console.log(`[smoke-edge] target: ${ENDPOINT}\n`);

let allPassed = true;
const summaries = [];
for (const tc of cases) {
	console.log(`--- ${tc.label} ---`);
	console.log(`USER: ${tc.message}`);
	let result;
	try {
		result = await callNeela(tc.message);
	} catch (err) {
		console.error(`HTTP failure: ${err.message}\n`);
		allPassed = false;
		summaries.push({ label: tc.label, passed: false, reply: `(error: ${err.message})` });
		continue;
	}
	console.log(`NEELA (${result.ms}ms): ${result.reply}\n`);

	const lower = result.reply.toLowerCase();
	const hits = tc.expectAny.filter((kw) => lower.includes(kw.toLowerCase()));
	const passed = hits.length > 0;
	if (!passed) allPassed = false;
	summaries.push({ label: tc.label, passed, hits, reply: result.reply });
	console.log(`expected ANY of: [${tc.expectAny.join(', ')}]`);
	console.log(`hit:             [${hits.join(', ')}]`);
	console.log(passed ? 'PASS\n' : 'FAIL\n');
}

console.log('=== SUMMARY ===');
for (const s of summaries) {
	console.log(`${s.passed ? 'PASS' : 'FAIL'}  ${s.label}`);
}
process.exit(allPassed ? 0 : 1);
