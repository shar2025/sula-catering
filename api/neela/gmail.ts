/**
 * /api/neela/gmail, consolidated Gmail OAuth + Pub/Sub + watch-renew endpoint.
 *
 * Vercel Hobby caps deployments at 12 serverless functions. This file collapses
 * what used to be four separate files (gmail-oauth-start, gmail-oauth-callback,
 * gmail-push, gmail-watch-renew) into one and dispatches by ?action=.
 *
 * Routing:
 *   GET  /api/neela/gmail?action=oauth-start
 *        Kicks off the one-time OAuth grant. 302s to Google's consent screen
 *        with a signed CSRF state. Idempotent.
 *
 *   GET  /api/neela/gmail?action=oauth-callback&code=...&state=...
 *        Google's redirect target. Verifies the CSRF state, exchanges the
 *        code, prints the refresh token in HTML for Shar to paste into Vercel.
 *
 *   POST /api/neela/gmail?action=push&token=...
 *        Pub/Sub push handler. Verifies the shared-secret token, decodes the
 *        envelope, walks gmail.history.list, dispatches each new message.
 *
 *   GET  /api/neela/gmail?action=watch-renew
 *        Daily cron + manual bootstrap. Calls users.watch to keep the Pub/Sub
 *        push alive (Gmail watches expire every 7 days).
 *
 * Each branch preserves the original method requirements, OAuth CSRF
 * validation, Pub/Sub shared-secret check, dedup logic, and error handling.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import {
	buildAuthUrl,
	exchangeCodeForTokens,
	getGmailUserEmail,
	getOAuthClientId,
	getOAuthClientSecret,
	getPubSubTopic,
	getRefreshToken,
	signOAuthState,
	verifyOAuthState
} from '../../src/lib/neela-gmail-auth.js';
import { listHistory, startWatch } from '../../src/lib/neela-gmail-send.js';
import { processInboundMessage } from '../../src/lib/neela-email-action.js';

export const config = { maxDuration: 30 };

function pickQuery(req: VercelRequest, key: string): string | null {
	const v = req.query[key];
	if (Array.isArray(v)) return v[0] || null;
	return v ?? null;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/* ---------- action: oauth-start ---------- */

async function handleOAuthStart(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'method not allowed' });
	}
	try {
		// Touch the env vars early so a misconfigured deploy errors clearly.
		getOAuthClientId();
		getOAuthClientSecret();
		const state = signOAuthState({ purpose: 'gmail-bootstrap' });
		const url = buildAuthUrl(state);
		console.log('[gmail/oauth-start] redirecting to consent screen');
		res.setHeader('cache-control', 'no-store');
		res.setHeader('location', url);
		return res.status(302).end();
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown error';
		console.error('[gmail/oauth-start] failed', msg);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(500).send(`OAuth start failed: ${msg}`);
	}
}

/* ---------- action: oauth-callback ---------- */

async function handleOAuthCallback(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const code = pickQuery(req, 'code');
	const state = pickQuery(req, 'state');
	const errorParam = pickQuery(req, 'error');

	res.setHeader('cache-control', 'no-store');

	if (errorParam) {
		console.warn('[gmail/oauth-callback] google returned error', errorParam);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res
			.status(400)
			.send(`Google returned error: ${errorParam}\n\nGo back to /api/neela/gmail?action=oauth-start and try again.`);
	}

	if (!code || !state) {
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(400).send('Missing code or state. Visit /api/neela/gmail?action=oauth-start to begin.');
	}

	const stateCheck = verifyOAuthState(state);
	if (!stateCheck.ok) {
		console.warn('[gmail/oauth-callback] bad state', stateCheck.reason);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res
			.status(400)
			.send(`Invalid CSRF state (${stateCheck.reason}). Restart the flow at /api/neela/gmail?action=oauth-start.`);
	}

	try {
		const tokens = await exchangeCodeForTokens(code);
		if (!tokens.refresh_token) {
			// Google only emits refresh_token when prompt=consent and there's no
			// existing grant. If we got here without one, force-revoke at
			// https://myaccount.google.com/permissions and retry.
			console.warn('[gmail/oauth-callback] no refresh_token returned');
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
  <li>Reload <a href="/api/neela/gmail?action=oauth-start">/api/neela/gmail?action=oauth-start</a></li>
</ol>
<p>Access token (short-lived, just for verification): <code>${escapeHtml(tokens.access_token.slice(0, 12))}...</code></p>
<p>Scope: <code>${escapeHtml(tokens.scope)}</code></p>`);
		}

		console.log('[gmail/oauth-callback] success, refresh token captured');
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
	<li>Manually hit <a href="/api/neela/gmail?action=watch-renew">/api/neela/gmail?action=watch-renew</a> once to start the Gmail push subscription.</li>
	<li>Send a test email to events.sula@gmail.com from another address; the inbound handler should classify and reply.</li>
</ol>
<p class="warn">After this page is closed, you cannot re-display the refresh token. If lost, revoke the grant at myaccount.google.com/permissions and re-run /api/neela/gmail?action=oauth-start.</p>
<p>Scope granted: <code>${escapeHtml(tokens.scope)}</code></p>`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown error';
		console.error('[gmail/oauth-callback] failed', msg);
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		return res.status(500).send(`OAuth code exchange failed: ${msg}`);
	}
}

/* ---------- action: push (Pub/Sub) ---------- */

interface PubSubEnvelope {
	message?: {
		data?: string;
		messageId?: string;
		message_id?: string;
		publishTime?: string;
		publish_time?: string;
		attributes?: Record<string, string>;
	};
	subscription?: string;
}

interface GmailWatchPayload {
	emailAddress: string;
	historyId: string | number;
}

interface ThreadStateRow {
	thread_id: string;
	last_history_id: string | null;
	status: string | null;
}

function verifySharedSecret(req: VercelRequest): { ok: boolean; reason?: string } {
	const expected = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
	if (!expected) return { ok: true }; // not configured; rely on envelope shape
	const provided = pickQuery(req, 'token');
	if (!provided || provided !== expected) return { ok: false, reason: 'bad-token' };
	return { ok: true };
}

// Optional Authorization: Bearer <JWT> verification. Structural check only;
// signature verification would require Google's JWKs and OIDC audience config.
// For now the shared-secret token path is the primary guard, this just logs.
function inspectAuthHeader(req: VercelRequest): { hasJwt: boolean; iss?: string; email?: string } {
	const auth = req.headers['authorization'];
	const value = Array.isArray(auth) ? auth[0] : auth;
	if (!value || !value.startsWith('Bearer ')) return { hasJwt: false };
	const jwt = value.slice('Bearer '.length).trim();
	const parts = jwt.split('.');
	if (parts.length !== 3) return { hasJwt: false };
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
		return { hasJwt: true, iss: payload.iss, email: payload.email };
	} catch {
		return { hasJwt: true };
	}
}

let threadsTableEnsured = false;
async function ensureThreadsTable(url: string): Promise<void> {
	if (threadsTableEnsured) return;
	const sql = neon(url);
	await sql`
		CREATE TABLE IF NOT EXISTS neela_gmail_threads (
			thread_id TEXT PRIMARY KEY,
			customer_email TEXT,
			last_history_id TEXT,
			last_message_id TEXT,
			status TEXT DEFAULT 'new',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	await sql`CREATE INDEX IF NOT EXISTS neela_gmail_threads_updated_idx ON neela_gmail_threads (updated_at DESC)`;
	threadsTableEnsured = true;
}

let watchStateTableEnsured = false;
async function ensureWatchStateTable(url: string): Promise<void> {
	if (watchStateTableEnsured) return;
	const sql = neon(url);
	await sql`
		CREATE TABLE IF NOT EXISTS neela_gmail_watch_state (
			id INT PRIMARY KEY,
			email_address TEXT NOT NULL,
			last_history_id TEXT NOT NULL,
			expiration_ms BIGINT,
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	watchStateTableEnsured = true;
}

async function getStartHistoryId(url: string, fallback: string): Promise<string> {
	try {
		await ensureWatchStateTable(url);
		const sql = neon(url);
		const rows = (await sql`SELECT last_history_id FROM neela_gmail_watch_state WHERE id = 1`) as Array<{ last_history_id: string }>;
		if (rows.length > 0 && rows[0].last_history_id) return rows[0].last_history_id;
	} catch {
		/* fall through */
	}
	return fallback;
}

async function bumpStartHistoryId(url: string, emailAddress: string, historyId: string): Promise<void> {
	try {
		await ensureWatchStateTable(url);
		const sql = neon(url);
		await sql`
			INSERT INTO neela_gmail_watch_state (id, email_address, last_history_id, updated_at)
			VALUES (1, ${emailAddress}, ${historyId}, NOW())
			ON CONFLICT (id) DO UPDATE SET email_address = EXCLUDED.email_address, last_history_id = EXCLUDED.last_history_id, updated_at = NOW()
		`;
	} catch (err) {
		console.warn('[gmail/push] bumpStartHistoryId failed', err instanceof Error ? err.message : err);
	}
}

async function alreadyProcessed(url: string, threadId: string, messageId: string): Promise<boolean> {
	try {
		await ensureThreadsTable(url);
		const sql = neon(url);
		const rows = (await sql`
			SELECT thread_id FROM neela_gmail_threads
			WHERE thread_id = ${threadId} AND last_message_id = ${messageId}
			LIMIT 1
		`) as ThreadStateRow[];
		return rows.length > 0;
	} catch {
		return false;
	}
}

async function recordProcessed(
	url: string,
	threadId: string,
	messageId: string,
	historyId: string,
	customerEmail: string,
	status: string
): Promise<void> {
	try {
		await ensureThreadsTable(url);
		const sql = neon(url);
		await sql`
			INSERT INTO neela_gmail_threads (thread_id, customer_email, last_history_id, last_message_id, status, updated_at)
			VALUES (${threadId}, ${customerEmail}, ${historyId}, ${messageId}, ${status}, NOW())
			ON CONFLICT (thread_id) DO UPDATE
			SET last_history_id = EXCLUDED.last_history_id,
				last_message_id = EXCLUDED.last_message_id,
				customer_email = COALESCE(EXCLUDED.customer_email, neela_gmail_threads.customer_email),
				status = EXCLUDED.status,
				updated_at = NOW()
		`;
	} catch (err) {
		console.warn('[gmail/push] recordProcessed failed', err instanceof Error ? err.message : err);
	}
}

async function handlePush(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	console.log('[gmail/push] hit');

	const tokenCheck = verifySharedSecret(req);
	if (!tokenCheck.ok) {
		console.warn('[gmail/push] rejected (bad shared secret)');
		return res.status(401).json({ error: 'unauthorized' });
	}
	const auth = inspectAuthHeader(req);
	if (auth.hasJwt) {
		console.log('[gmail/push] auth header present', { iss: auth.iss, email: auth.email });
	}

	if (!getRefreshToken()) {
		console.warn('[gmail/push] no GMAIL_REFRESH_TOKEN; ack and skip');
		return res.status(200).json({ ok: true, skipped: 'no-refresh-token' });
	}

	const envelope = (req.body || {}) as PubSubEnvelope;
	const message = envelope.message;
	if (!message || !message.data) {
		console.warn('[gmail/push] envelope missing message.data');
		return res.status(204).end();
	}

	let payload: GmailWatchPayload;
	try {
		const decoded = Buffer.from(message.data, 'base64').toString('utf8');
		payload = JSON.parse(decoded) as GmailWatchPayload;
	} catch (err) {
		console.warn('[gmail/push] payload decode failed', err instanceof Error ? err.message : err);
		return res.status(204).end();
	}

	const expectedInbox = getGmailUserEmail();
	if (payload.emailAddress && payload.emailAddress.toLowerCase() !== expectedInbox.toLowerCase()) {
		console.warn('[gmail/push] inbox mismatch', payload.emailAddress, '!=', expectedInbox);
		return res.status(200).json({ ok: true, skipped: 'inbox-mismatch' });
	}

	const incomingHistoryId = String(payload.historyId);
	const url = process.env.POSTGRES_URL;

	if (!url) {
		console.warn('[gmail/push] no POSTGRES_URL; processing with naive single-shot');
	}

	const startHistoryId = url ? await getStartHistoryId(url, incomingHistoryId) : incomingHistoryId;

	let history;
	try {
		history = await listHistory(startHistoryId, ['messageAdded']);
	} catch (err) {
		console.warn('[gmail/push] history.list failed', err instanceof Error ? err.message : err);
		// Bump our cursor to incomingHistoryId so we don't get stuck retrying a
		// startHistoryId that may be too old (Gmail expires history beyond ~7d).
		if (url) await bumpStartHistoryId(url, expectedInbox, incomingHistoryId);
		return res.status(200).json({ ok: true, skipped: 'history-list-failed' });
	}

	const items: Array<{ messageId: string; threadId: string; historyId: string }> = [];
	for (const h of history.history ?? []) {
		const adds = h.messagesAdded || [];
		for (const ma of adds) {
			if (!ma.message?.id || !ma.message?.threadId) continue;
			items.push({ messageId: ma.message.id, threadId: ma.message.threadId, historyId: h.id });
		}
	}

	console.log('[gmail/push] history.list', {
		startHistoryId,
		incomingHistoryId,
		records: history.history?.length ?? 0,
		messagesToProcess: items.length
	});

	let processed = 0;
	for (const item of items) {
		try {
			if (url) {
				const seen = await alreadyProcessed(url, item.threadId, item.messageId);
				if (seen) {
					console.log('[gmail/push] skipping already-seen message', item.messageId);
					continue;
				}
			}
			const result = await processInboundMessage({
				threadId: item.threadId,
				historyId: item.historyId,
				messageId: item.messageId
			});
			console.log('[gmail/push] processed', { messageId: item.messageId, ...result });
			if (url) {
				await recordProcessed(url, item.threadId, item.messageId, item.historyId, '', `${result.intent}:${result.action}`);
			}
			processed += 1;
		} catch (err) {
			console.error('[gmail/push] processing failed', item.messageId, err instanceof Error ? err.message : err);
		}
	}

	if (url) await bumpStartHistoryId(url, expectedInbox, history.historyId || incomingHistoryId);

	return res.status(200).json({ ok: true, processed });
}

/* ---------- action: watch-renew ---------- */

function authorizedForWatch(req: VercelRequest): { ok: boolean; via: 'cron' | 'admin-key' | 'open' } {
	if (req.headers['x-vercel-cron']) return { ok: true, via: 'cron' };
	const adminKey = process.env.NEELA_ADMIN_KEY;
	if (!adminKey) return { ok: true, via: 'open' };
	const provided = req.headers['x-admin-key'];
	const value = Array.isArray(provided) ? provided[0] : provided;
	if (value && value === adminKey) return { ok: true, via: 'admin-key' };
	return { ok: false, via: 'admin-key' };
}

async function persistWatchState(emailAddress: string, historyId: string, expirationMs: string | null): Promise<void> {
	const url = process.env.POSTGRES_URL;
	if (!url) {
		console.warn('[gmail/watch-renew] no POSTGRES_URL; state not persisted');
		return;
	}
	const sql = neon(url);
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS neela_gmail_watch_state (
				id INT PRIMARY KEY,
				email_address TEXT NOT NULL,
				last_history_id TEXT NOT NULL,
				expiration_ms BIGINT,
				updated_at TIMESTAMPTZ DEFAULT NOW()
			)
		`;
		const expirationNumeric = expirationMs ? Number(expirationMs) : null;
		await sql`
			INSERT INTO neela_gmail_watch_state (id, email_address, last_history_id, expiration_ms, updated_at)
			VALUES (1, ${emailAddress}, ${historyId}, ${expirationNumeric}, NOW())
			ON CONFLICT (id) DO UPDATE
			SET email_address = EXCLUDED.email_address,
				last_history_id = EXCLUDED.last_history_id,
				expiration_ms = EXCLUDED.expiration_ms,
				updated_at = NOW()
		`;
	} catch (err) {
		console.warn('[gmail/watch-renew] persist failed', err instanceof Error ? err.message : err);
	}
}

async function handleWatchRenew(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET' && req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const auth = authorizedForWatch(req);
	if (!auth.ok) return res.status(401).json({ error: 'unauthorized' });

	if (!getRefreshToken()) {
		console.warn('[gmail/watch-renew] no GMAIL_REFRESH_TOKEN');
		return res.status(503).json({ error: 'no refresh token; run /api/neela/gmail?action=oauth-start first' });
	}

	const topic = getPubSubTopic();
	const emailAddress = getGmailUserEmail();

	try {
		const result = await startWatch(topic, ['INBOX']);
		console.log('[gmail/watch-renew] watch started', {
			topic,
			emailAddress,
			historyId: result.historyId,
			expiration: result.expiration,
			via: auth.via
		});
		await persistWatchState(emailAddress, result.historyId, result.expiration);
		return res.status(200).json({
			ok: true,
			emailAddress,
			topic,
			historyId: result.historyId,
			expiration: result.expiration,
			expiresHumanReadable: result.expiration ? new Date(Number(result.expiration)).toISOString() : null,
			via: auth.via
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'unknown error';
		console.error('[gmail/watch-renew] failed', msg);
		return res.status(500).json({ error: msg });
	}
}

/* ---------- top-level dispatcher ---------- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const action = pickQuery(req, 'action');
	switch (action) {
		case 'oauth-start':
			return handleOAuthStart(req, res);
		case 'oauth-callback':
			return handleOAuthCallback(req, res);
		case 'push':
			return handlePush(req, res);
		case 'watch-renew':
			return handleWatchRenew(req, res);
		default:
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			return res
				.status(400)
				.send('Missing or invalid ?action=. Valid: oauth-start, oauth-callback, push, watch-renew.');
	}
}
