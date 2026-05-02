/**
 * /api/neela-lead — captures a lead (name + email) from inside the Neela chat.
 *
 * For now, logs to Vercel function logs and returns 200. Later, wire to
 * the events team's email or CRM (Resend, Zapier, HubSpot, etc.) by adding
 * a transport block below. Env vars for that transport go in NEELA-SETUP.md.
 */

interface LeadRequest {
	name: string;
	email: string;
	sessionId?: string;
	conversation?: { role: string; content: string }[];
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req: Request): Promise<Response> {
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let body: LeadRequest;
	try {
		body = (await req.json()) as LeadRequest;
	} catch {
		return new Response(JSON.stringify({ error: 'invalid json' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const name = (body.name || '').toString().trim().slice(0, 200);
	const email = (body.email || '').toString().trim().slice(0, 200);
	if (!name || !email || !isValidEmail(email)) {
		return new Response(JSON.stringify({ error: 'name and valid email required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const transcript = Array.isArray(body.conversation)
		? body.conversation.map((m) => `[${m.role}] ${m.content}`).join('\n').slice(0, 8000)
		: '';

	console.log('[neela-lead]', JSON.stringify({
		name,
		email,
		sessionId: body.sessionId,
		transcript,
		at: new Date().toISOString()
	}));

	// TODO: wire transport (Resend / Zapier / HubSpot) once Shar provides the destination.

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}
