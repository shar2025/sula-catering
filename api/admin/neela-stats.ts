/**
 * /api/admin/neela-stats — read-only verification endpoint for chat persistence.
 *
 * Auth: send `x-admin-key: <NEELA_ADMIN_KEY>` header. If the env var isn't set,
 * the endpoint refuses everything (so it's never accidentally world-readable).
 *
 * Returns:
 *   {
 *     totalChatsAllTime: number,
 *     totalChatsToday: number,
 *     uniqueIpHashesToday: number,
 *     latestFive: [{created_at, session_id (truncated), user_message, neela_reply, ...}]
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 30 };

interface CountRow {
	c: number | string;
}
interface RecentRow {
	id: number | string;
	created_at: string | Date;
	session_id: string;
	user_message: string;
	neela_reply: string;
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	message_index: number | null;
	conversation_length: number | null;
}

function truncate(s: string, n: number): string {
	if (!s) return '';
	const flat = s.replace(/\s+/g, ' ').trim();
	return flat.length > n ? flat.slice(0, n) + '…' : flat;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const expectedKey = process.env.NEELA_ADMIN_KEY;
	if (!expectedKey) {
		return res.status(503).json({ error: 'admin key not configured' });
	}
	const provided = req.headers['x-admin-key'];
	const providedStr = Array.isArray(provided) ? provided[0] : provided || '';
	if (providedStr !== expectedKey) {
		return res.status(401).json({ error: 'unauthorized' });
	}

	const url = process.env.POSTGRES_URL;
	if (!url) {
		return res.status(503).json({ error: 'postgres not configured' });
	}

	try {
		const sql = neon(url);

		const [totalRow] = (await sql`SELECT COUNT(*)::int AS c FROM neela_chats`) as CountRow[];
		const [todayRow] = (await sql`SELECT COUNT(*)::int AS c FROM neela_chats WHERE created_at >= NOW() - INTERVAL '24 hours'`) as CountRow[];
		const [uniqIpRow] = (await sql`SELECT COUNT(DISTINCT ip_hash)::int AS c FROM neela_chats WHERE created_at >= NOW() - INTERVAL '24 hours'`) as CountRow[];
		const recent = (await sql`
			SELECT id, created_at, session_id, user_message, neela_reply,
				input_tokens, output_tokens, cache_read_tokens, message_index, conversation_length
			FROM neela_chats
			ORDER BY created_at DESC
			LIMIT 5
		`) as RecentRow[];

		return res.status(200).json({
			generatedAt: new Date().toISOString(),
			totalChatsAllTime: Number(totalRow?.c ?? 0),
			totalChatsToday: Number(todayRow?.c ?? 0),
			uniqueIpHashesToday: Number(uniqIpRow?.c ?? 0),
			latestFive: recent.map((r) => ({
				id: r.id,
				createdAt: r.created_at,
				sessionId: typeof r.session_id === 'string' ? r.session_id.slice(-12) : r.session_id,
				messageIndex: r.message_index,
				conversationLength: r.conversation_length,
				userMessage: truncate(r.user_message, 200),
				neelaReply: truncate(r.neela_reply, 200),
				usage: {
					input: r.input_tokens,
					output: r.output_tokens,
					cacheRead: r.cache_read_tokens
				}
			}))
		});
	} catch (err) {
		console.error('[neela-stats] db error', err);
		return res.status(500).json({ error: 'db error' });
	}
}
