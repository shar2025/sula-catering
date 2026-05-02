/**
 * /api/neela/gmail-oauth-callback, the one-time bootstrap callback.
 *
 * Receives the authorization code from Google after Shar approves consent on
 * events.sula@gmail.com. Exchanges the code for a refresh token + access token,
 * displays the refresh token in plain HTML so Shar can paste it into the
 * Vercel env var GMAIL_REFRESH_TOKEN, and triggers a redeploy.
 *
 * Security: this page renders the refresh token in the response body. That's
 * intentional: the page is only ever loaded once by Shar at the end of the
 * one-time grant, in his own browser, on the redirect URI he just authorized.
 * The endpoint is not linked from anywhere; the only way to reach it with a
 * valid code is to have just completed the consent flow.
 *
 * After Shar pastes the token into Vercel, this endpoint becomes obsolete
 * until a re-grant is needed (eg. revoked token, scope change). It can be
 * safely left in place.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCodeForTokens, verifyOAuthState } from '../../src/lib/neela-gmail-auth.js';

export const config = { maxDuration: 15 };

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function pickQuery(req: VercelRequest, key: string): string | null {
	const v = req.query[key];
	if (Array.isArray(v)) return v[0] || null;
	return v ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const code = pickQuery(req, 'code');
	const state = pickQuery(req, 'state');
	const errorParam = pickQuery(req, 'error');

	res.setHeader('cache-control', 'no-store');

	if (errorParam) {
		console.warn('[gmail-oauth-callback] google returned error', errorParam);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(400).send(`Google returned error: ${errorParam}\n\nGo back to /api/neela/gmail-oauth-start and try again.`);
	}

	if (!code || !state) {
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(400).send('Missing code or state. Visit /api/neela/gmail-oauth-start to begin.');
	}

	const stateCheck = verifyOAuthState(state);
	if (!stateCheck.ok) {
		console.warn('[gmail-oauth-callback] bad state', stateCheck.reason);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(400).send(`Invalid CSRF state (${stateCheck.reason}). Restart the flow at /api/neela/gmail-oauth-start.`);
	}

	try {
		const tokens = await exchangeCodeForTokens(code);
		if (!tokens.refresh_token) {
			// Google only emits refresh_token when prompt=consent and there's no
			// existing grant. If we got here without one, force-revoke at
			// https://myaccount.google.com/permissions and retry.
			console.warn('[gmail-oauth-callback] no refresh_token returned');
			res.setHeader('content-type', 'text/html; charset=utf-8');
			return res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<title>Gmail OAuth, no refresh token returned</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5}</style>
<h1>No refresh_token in the response</h1>
<p>Google only returns a refresh token when there's no existing grant for this app on this account. To force a fresh one:</p>
<ol>
  <li>Go to <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a></li>
  <li>Find "Sula Neela" and remove access</li>
  <li>Reload <a href="/api/neela/gmail-oauth-start">/api/neela/gmail-oauth-start</a></li>
</ol>
<p>Access token (short-lived, just for verification): <code>${escapeHtml(tokens.access_token.slice(0, 12))}...</code></p>
<p>Scope: <code>${escapeHtml(tokens.scope)}</code></p>`);
		}

		console.log('[gmail-oauth-callback] success, refresh token captured');
		res.setHeader('content-type', 'text/html; charset=utf-8');
		return res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<title>Gmail OAuth, refresh token captured</title>
<style>
	body{font-family:system-ui;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.5;color:#222}
	code,pre{background:#f4f4f6;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,monospace}
	pre{padding:14px;overflow:auto;word-break:break-all;white-space:pre-wrap}
	.token{border:2px solid #c89b3c;padding:14px;border-radius:6px;background:#fff7e6}
	ol li{margin-bottom:8px}
	h1{margin-bottom:6px}
	.warn{color:#9b2c2c;font-weight:600}
</style>
<h1>Gmail OAuth, all set</h1>
<p>Capture the refresh token below and paste it into Vercel as <code>GMAIL_REFRESH_TOKEN</code>. Don't share or commit it.</p>
<div class="token">
	<strong>GMAIL_REFRESH_TOKEN</strong>
	<pre>${escapeHtml(tokens.refresh_token)}</pre>
</div>
<h2>Next steps</h2>
<ol>
	<li>Open Vercel, project <strong>sula-astro</strong> &rarr; Settings &rarr; Environment Variables.</li>
	<li>Add <code>GMAIL_REFRESH_TOKEN</code> with the value above (Production + Preview).</li>
	<li>Redeploy the latest deployment so the function picks up the new env.</li>
	<li>Manually hit <a href="/api/neela/gmail-watch-renew">/api/neela/gmail-watch-renew</a> once to start the Gmail push subscription.</li>
	<li>Send a test email to events.sula@gmail.com from another address; the inbound handler should classify and reply.</li>
</ol>
<p class="warn">After this page is closed, you cannot re-display the refresh token. If lost, revoke the grant at myaccount.google.com/permissions and re-run /api/neela/gmail-oauth-start.</p>
<p>Scope granted: <code>${escapeHtml(tokens.scope)}</code></p>`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown error';
		console.error('[gmail-oauth-callback] failed', msg);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(500).send(`OAuth code exchange failed: ${msg}`);
	}
}
