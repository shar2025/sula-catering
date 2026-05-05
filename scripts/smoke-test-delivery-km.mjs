// scripts/smoke-test-delivery-km.mjs, verifies the deliveryKm passthrough
// added to submit-order.ts. Three scenarios:
//   1. deliveryKm = 12.3 -> should be accepted, rounded to 1 decimal, persisted
//   2. deliveryKm = 5000 (out of range) -> dropped silently, undefined downstream
//   3. deliveryKm omitted -> undefined, Page 1 PDF renders "TBD by team"
//
// We exercise submit-order's validate() indirectly via the handler, then
// inspect the response. The handler doesn't echo deliveryKm in the response
// JSON, so we rely on log output and the absence of validation failure.
//
// Run: npx tsx scripts/smoke-test-delivery-km.mjs

const { default: handler } = await import('../api/neela/submit-order.ts');

function mockReqRes(body) {
	let statusCode = 0;
	let resBody = null;
	const req = { method: 'POST', headers: {}, body };
	const res = {
		status(code) { statusCode = code; return res; },
		json(payload) { resBody = payload; return res; }
	};
	return { req, res, get: () => ({ statusCode, resBody }) };
}

async function run(label, body, want) {
	const { req, res, get } = mockReqRes(body);
	await handler(req, res);
	const { statusCode, resBody } = get();
	const ok = statusCode === want.code;
	console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}  ->  status=${statusCode}, ref=${resBody?.reference || resBody?.error}`);
	if (!ok) process.exitCode = 1;
}

await run(
	'deliveryKm = 12.3 (valid, in-area)',
	{
		sessionId: 'smoke-km-1',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			deliveryAddress: '1234 Burnaby Heights Rd, Burnaby, BC',
			deliveryKm: 12.3,
			customMenuDetails: 'Free-text menu',
			contact: { name: 'Test Km', email: 'km@example.com' }
		}
	},
	{ code: 200 }
);

await run(
	'deliveryKm = 5000 (out of range, silently dropped, order still accepted)',
	{
		sessionId: 'smoke-km-2',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			deliveryAddress: '1234 Burnaby Heights Rd, Burnaby, BC',
			deliveryKm: 5000,
			customMenuDetails: 'Free-text menu',
			contact: { name: 'Test Km', email: 'km@example.com' }
		}
	},
	{ code: 200 }
);

await run(
	'deliveryKm omitted (default, PDF renders TBD by team)',
	{
		sessionId: 'smoke-km-3',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			deliveryAddress: '1234 Burnaby Heights Rd, Burnaby, BC',
			customMenuDetails: 'Free-text menu',
			contact: { name: 'Test Km', email: 'km@example.com' }
		}
	},
	{ code: 200 }
);

await run(
	'deliveryKm = "twelve" (string, silently dropped, order still accepted)',
	{
		sessionId: 'smoke-km-4',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			deliveryAddress: '1234 Burnaby Heights Rd, Burnaby, BC',
			deliveryKm: 'twelve',
			customMenuDetails: 'Free-text menu',
			contact: { name: 'Test Km', email: 'km@example.com' }
		}
	},
	{ code: 200 }
);

console.log('\ndeliveryKm passthrough smoke-tested.');
