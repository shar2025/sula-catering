/**
 * /api/neela/gmail-watch-renew, daily Gmail watch refresher.
 *
 * Gmail watch subscriptions expire after 7 days. We re-call users.watch every
 * day to keep the Pub/Sub push alive, and persist the historyId Gmail returns
 * so the next push handler picks up from there.
 *
 * Triggered by Vercel cron (see vercel.json) and also runnable manually with
 * a GET. The first manual run is what bootstraps the subscription after the
 * one-time OAuth grant.
 *
 * Optional auth: if NEELA_ADMIN_KEY is set, manual GETs require an
 * x-admin-key header that matches. Vercel's cron-platform runs with no such
 * header but provides a `x-vercel-cron` header we accept.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { startWatch } from '../../src/lib/neela-gmail-send.js';
import { getGmailUserEmail, getPubSubTopic, getRefreshToken } from '../../src/lib/neela-gmail-auth.js';

export const config = { maxDuration: 30 };

function authorized(req: VercelRequest): { ok: boolean; via: 'cron' | 'admin-key' | 'open' } {
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
		console.warn('[gmail-watch-renew] no POSTGRES_URL; state not persisted');
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
		console.warn('[gmail-watch-renew] persist failed', err instanceof Error ? err.message : err);
	}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET' && req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const auth = authorized(req);
	if (!auth.ok) return res.status(401).json({ error: 'unauthorized' });

	if (!getRefreshToken()) {
		console.warn('[gmail-watch-renew] no GMAIL_REFRESH_TOKEN');
		return res.status(503).json({ error: 'no refresh token; run /api/neela/gmail-oauth-start first' });
	}

	const topic = getPubSubTopic();
	const emailAddress = getGmailUserEmail();

	try {
		const result = await startWatch(topic, ['INBOX']);
		console.log('[gmail-watch-renew] watch started', {
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
		console.error('[gmail-watch-renew] failed', msg);
		return res.status(500).json({ error: msg });
	}
}
