/**
 * /api/neela/gmail-oauth-start, kicks off the one-time Gmail OAuth grant.
 *
 * Visit this URL while signed in as events.sula@gmail.com (the only test
 * user on the OAuth consent screen). Redirects to Google's consent page
 * with a signed CSRF state, then back to gmail-oauth-callback with a code.
 *
 * Idempotent. Safe to re-hit if the refresh token is ever lost.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildAuthUrl, signOAuthState, getOAuthClientId, getOAuthClientSecret } from '../../src/lib/neela-gmail-auth.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'method not allowed' });
	}
	try {
		// Touch the env vars early so a misconfigured deploy errors clearly.
		getOAuthClientId();
		getOAuthClientSecret();
		const state = signOAuthState({ purpose: 'gmail-bootstrap' });
		const url = buildAuthUrl(state);
		console.log('[gmail-oauth-start] redirecting to consent screen');
		res.setHeader('cache-control', 'no-store');
		res.setHeader('location', url);
		return res.status(302).end();
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown error';
		console.error('[gmail-oauth-start] failed', msg);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(500).send(`OAuth start failed: ${msg}`);
	}
}
