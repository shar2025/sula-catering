// scripts/smoke-test-three-paths.mjs, exercises the /api/neela/submit-order
// validator against the three new paths (full / custom / consultation) by
// calling the handler in-process with a mocked VercelRequest. Verifies each
// path's required-field validation and lands on a 200 + reference for happy
// paths or a 400 with a clear error for the missing-field cases.
//
// Skips the actual DB persist + email send by relying on the optional env
// vars (POSTGRES_URL, RESEND_API_KEY) being unset; the handler logs and
// continues. Reference is generated client-side so we can match it.
//
// Run: npx tsx scripts/smoke-test-three-paths.mjs

const { default: handler } = await import('../api/neela/submit-order.ts');

function mockReqRes(body) {
	let statusCode = 0;
	let resBody = null;
	const req = {
		method: 'POST',
		headers: {},
		body
	};
	const res = {
		status(code) {
			statusCode = code;
			return res;
		},
		json(payload) {
			resBody = payload;
			return res;
		}
	};
	return { req, res, get: () => ({ statusCode, resBody }) };
}

async function expect(label, body, want) {
	const { req, res, get } = mockReqRes(body);
	await handler(req, res);
	const { statusCode, resBody } = get();
	const okCode = statusCode === want.code;
	const okBody = want.errorMatch ? (resBody?.error || '').includes(want.errorMatch) : (want.referencePresent ? !!resBody?.reference : true);
	const ok = okCode && okBody;
	console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}  ->  status=${statusCode}, body=${JSON.stringify(resBody).slice(0, 200)}`);
	if (!ok) {
		console.log('       expected:', JSON.stringify(want));
		process.exitCode = 1;
	}
}

console.log('--- FULL QUOTE PATH (mode "full") ---');
await expect(
	'full mode happy path',
	{
		sessionId: 'smoke-full-1',
		order: {
			mode: 'full',
			eventType: 'corporate',
			eventDate: 'June 18, 2026',
			deliveryTime: '12:00 PM',
			guestCount: 45,
			serviceType: 'drop-off',
			deliveryAddress: '1500 West 8th Avenue, Vancouver, BC',
			menuTier: 'Option 4 ($28.95)',
			setupType: 'aluminium_trays',
			contact: { name: 'Test Full', email: 'full@example.com', phone: '604-555-0001' },
			notes: 'smoke test full'
		}
	},
	{ code: 200, referencePresent: true }
);

await expect(
	'full mode missing eventType -> 400',
	{
		sessionId: 'smoke-full-2',
		order: {
			mode: 'full',
			eventDate: 'June 18, 2026',
			guestCount: 45,
			contact: { name: 'Test Full', email: 'full@example.com' }
		}
	},
	{ code: 400, errorMatch: 'eventType' }
);

console.log('\n--- CUSTOM ORDER PATH (mode "custom") ---');
await expect(
	'custom mode happy path',
	{
		sessionId: 'smoke-custom-1',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			deliveryTime: '6:00 PM',
			guestCount: 35,
			deliveryAddress: '4567 West 10th Avenue, Vancouver, BC',
			customMenuDetails: 'Mostly veg, some chicken, definitely Butter Chicken, plenty of naan, buffet style.',
			contact: { name: 'Test Custom', email: 'custom@example.com', phone: '604-555-0002' },
			notes: 'smoke test custom'
		}
	},
	{ code: 200, referencePresent: true }
);

await expect(
	'custom mode missing customMenuDetails -> 400',
	{
		sessionId: 'smoke-custom-2',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			deliveryAddress: '4567 West 10th Avenue, Vancouver, BC',
			contact: { name: 'Test Custom', email: 'custom@example.com' }
		}
	},
	{ code: 400, errorMatch: 'customMenuDetails' }
);

await expect(
	'custom mode missing deliveryAddress -> 400',
	{
		sessionId: 'smoke-custom-3',
		order: {
			mode: 'custom',
			eventType: 'private',
			eventDate: 'June 14, 2026',
			guestCount: 35,
			customMenuDetails: 'A free-text menu description.',
			contact: { name: 'Test Custom', email: 'custom@example.com' }
		}
	},
	{ code: 400, errorMatch: 'deliveryAddress' }
);

console.log('\n--- CONSULTATION PATH (mode "consultation") ---');
await expect(
	'consultation mode happy path (minimal contact only)',
	{
		sessionId: 'smoke-consult-1',
		order: {
			mode: 'consultation',
			contact: { name: 'Test Consult', email: 'consult@example.com', phone: '604-555-0003' },
			notes: 'Consultation booked, see Calendly. Customer wants a callback in addition to the link.'
		}
	},
	{ code: 200, referencePresent: true }
);

await expect(
	'consultation mode missing email -> 400',
	{
		sessionId: 'smoke-consult-2',
		order: {
			mode: 'consultation',
			contact: { name: 'Test Consult' }
		}
	},
	{ code: 400, errorMatch: 'email' }
);

console.log('\nAll three paths smoke-tested.');
