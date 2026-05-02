/**
 * /api/neela-lead — captures a lead (name + email) from inside the Neela chat.
 *
 * For now, logs to Vercel function logs and returns 200. Later, wire to
 * the events team's email or CRM (Resend, Zapier, HubSpot, etc.) by adding
 * a transport block below. Env vars for that transport go in NEELA-SETUP.md.
 *
 * Vercel Node runtime, Express-style (req, res) handler.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

interface LeadRequest {
	name?: string;
	email?: string;
	sessionId?: string;
	conversation?: { role: string; content: string }[];
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-lead] hit', req.method);

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const body = (req.body || {}) as LeadRequest;
	const name = (body.name || '').toString().trim().slice(0, 200);
	const email = (body.email || '').toString().trim().slice(0, 200);
	if (!name || !email || !isValidEmail(email)) {
		return res.status(400).json({ error: 'name and valid email required' });
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

	// TODO: wire transport (Resend / Zapier / HubSpot) once a destination is provided.

	return res.status(200).json({ ok: true });
}
