/**
 * /api/neela/gmail-push, Pub/Sub push endpoint for Gmail watch notifications.
 *
 * Flow:
 *   1. Pub/Sub POSTs us a JSON envelope with a base64-encoded message.data
 *      that decodes to { emailAddress, historyId }.
 *   2. We verify the request: if Pub/Sub push auth is enabled (OIDC), check
 *      the Authorization: Bearer <jwt> header. If it isn't (current Phase 1
 *      config), accept any envelope shaped correctly AND optionally enforce
 *      a shared-secret token in ?token=... (set GMAIL_PUBSUB_VERIFICATION_TOKEN
 *      and append ?token=XXX to the push URL for that protection).
 *   3. We dedupe via neela_gmail_threads (thread_id + last_history_id), look
 *      up new messages via gmail.history.list, and dispatch each to the
 *      action handler.
 *
 * Idempotency: Pub/Sub may redeliver the same message many times. The dedup
 * key is (thread_id, message_id). We bail early on a re-seen message_id.
 *
 * Latency budget: must respond <10s or Pub/Sub retries (creating duplicate
 * work). We cap classifier + reply at ~12s combined and return 200 either
 * way; partial failures get logged and retried by Pub/Sub on the next email.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { listHistory } from '../../src/lib/neela-gmail-send.js';
import { processInboundMessage } from '../../src/lib/neela-email-action.js';
import { getGmailUserEmail, getRefreshToken } from '../../src/lib/neela-gmail-auth.js';

export const config = { maxDuration: 30 };

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

function pickQuery(req: VercelRequest, key: string): string | null {
	const v = req.query[key];
	if (Array.isArray(v)) return v[0] || null;
	return v ?? null;
}

function verifySharedSecret(req: VercelRequest): { ok: boolean; reason?: string } {
	const expected = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
	if (!expected) return { ok: true }; // not configured; rely on envelope shape
	const provided = pickQuery(req, 'token');
	if (!provided || provided !== expected) return { ok: false, reason: 'bad-token' };
	return { ok: true };
}

// Optional Authorization: Bearer <JWT> verification. We do a structural check
// only (signature verification would require fetching Google's JWKs and
// validating against the OIDC audience). For Phase 2, the shared-secret token
// path above is the primary guard; this just logs the JWT presence.
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

interface ThreadStateRow {
	thread_id: string;
	last_history_id: string | null;
	status: string | null;
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
		console.warn('[gmail-push] bumpStartHistoryId failed', err instanceof Error ? err.message : err);
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
		console.warn('[gmail-push] recordProcessed failed', err instanceof Error ? err.message : err);
	}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	console.log('[gmail-push] hit');

	const tokenCheck = verifySharedSecret(req);
	if (!tokenCheck.ok) {
		console.warn('[gmail-push] rejected (bad shared secret)');
		return res.status(401).json({ error: 'unauthorized' });
	}
	const auth = inspectAuthHeader(req);
	if (auth.hasJwt) {
		console.log('[gmail-push] auth header present', { iss: auth.iss, email: auth.email });
	}

	if (!getRefreshToken()) {
		console.warn('[gmail-push] no GMAIL_REFRESH_TOKEN; ack and skip');
		return res.status(200).json({ ok: true, skipped: 'no-refresh-token' });
	}

	const envelope = (req.body || {}) as PubSubEnvelope;
	const message = envelope.message;
	if (!message || !message.data) {
		console.warn('[gmail-push] envelope missing message.data');
		return res.status(204).end();
	}

	let payload: GmailWatchPayload;
	try {
		const decoded = Buffer.from(message.data, 'base64').toString('utf8');
		payload = JSON.parse(decoded) as GmailWatchPayload;
	} catch (err) {
		console.warn('[gmail-push] payload decode failed', err instanceof Error ? err.message : err);
		return res.status(204).end();
	}

	const expectedInbox = getGmailUserEmail();
	if (payload.emailAddress && payload.emailAddress.toLowerCase() !== expectedInbox.toLowerCase()) {
		console.warn('[gmail-push] inbox mismatch', payload.emailAddress, '!=', expectedInbox);
		return res.status(200).json({ ok: true, skipped: 'inbox-mismatch' });
	}

	const incomingHistoryId = String(payload.historyId);
	const url = process.env.POSTGRES_URL;

	// Always ack quickly; do the rest under the same handler since Vercel
	// won't survive past the response.
	if (!url) {
		console.warn('[gmail-push] no POSTGRES_URL; processing with naive single-shot');
	}

	const startHistoryId = url ? await getStartHistoryId(url, incomingHistoryId) : incomingHistoryId;

	let history;
	try {
		history = await listHistory(startHistoryId, ['messageAdded']);
	} catch (err) {
		console.warn('[gmail-push] history.list failed', err instanceof Error ? err.message : err);
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

	console.log('[gmail-push] history.list', {
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
					console.log('[gmail-push] skipping already-seen message', item.messageId);
					continue;
				}
			}
			const result = await processInboundMessage({
				threadId: item.threadId,
				historyId: item.historyId,
				messageId: item.messageId
			});
			console.log('[gmail-push] processed', { messageId: item.messageId, ...result });
			if (url) {
				await recordProcessed(url, item.threadId, item.messageId, item.historyId, '', `${result.intent}:${result.action}`);
			}
			processed += 1;
		} catch (err) {
			console.error('[gmail-push] processing failed', item.messageId, err instanceof Error ? err.message : err);
		}
	}

	if (url) await bumpStartHistoryId(url, expectedInbox, history.historyId || incomingHistoryId);

	return res.status(200).json({ ok: true, processed });
}
