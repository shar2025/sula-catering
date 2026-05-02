// Shared digest logic used by /api/cron/neela-digest (real cron) and
// /api/cron/neela-digest-test (manual GET trigger). The leading underscore
// keeps Vercel from treating this file as a route.

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';

interface ChatRow {
	id: string | number;
	created_at: string | Date;
	session_id: string;
	ip_hash: string | null;
	user_message: string;
	neela_reply: string;
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	message_index: number | null;
	conversation_length: number | null;
}

const ANTHROPIC_TIMEOUT_MS = 25000;
const DIGEST_TO = 'events@sulaindianrestaurant.com';
const DIGEST_FROM = 'Neela <neela@sulacatering.com>';

const SUMMARY_PROMPT = `You are summarizing 24 hours of chat traffic from Neela, the AI event-planning assistant on sulacatering.com. The transcript below is grouped by session (one user's full conversation per block).

Produce a clear daily digest for Sula's events team. Use a calm, factual tone with light warmth. No marketing voice. Use these exact section headings as Markdown H3 (### ...):

### Volume
- Total turns
- Unique sessions
- Any visible spike or quiet patch

### Most interesting conversations (top 3)
For each, include the session ID (truncated, last 8 chars), a one-line description of what they wanted, and a short verbatim quote from the user that captures the request. Skip if there are fewer than 3 substantive conversations.

### Common themes
3 to 5 bullets, things that came up across multiple sessions (e.g. "lots of wedding date questions for September", "several halal-specific asks").

### Where Neela fumbled or fell back
Look for replies containing "I'm taking a quick break", "events@sulaindianrestaurant.com", or "calendly.com/sula-catering" used as a fallback after a stuck moment. List any clusters or repeat fumbles. If none, say "none flagged".

### Lead capture & action items
Any user who left an email address visible in the transcript, or anything that the events team should follow up on personally. If none, say "none today".

Voice rules:
- No em dashes (use commas).
- No "solutions", "experiences", "elevate".
- No "near me" stuffing.
- Don't editorialize, just report what happened.
- Keep total length under 600 words.`;

function pickEnv(...names: string[]): string | undefined {
	for (const n of names) {
		const v = process.env[n];
		if (v && v.length > 0) return v;
	}
	return undefined;
}

function escapeHtml(s: string): string {
	return String(s).replace(/[&<>"']/g, (c) => {
		const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
		return map[c] ?? c;
	});
}

function summaryToHtml(md: string): string {
	const lines = md.split(/\r?\n/);
	const html: string[] = [];
	let inList = false;
	const closeList = () => {
		if (inList) {
			html.push('</ul>');
			inList = false;
		}
	};
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			closeList();
			continue;
		}
		if (line.startsWith('### ')) {
			closeList();
			html.push(`<h3 style="font-family:'Cormorant Garamond',Georgia,serif;color:#b8956a;font-size:18px;letter-spacing:0.4px;margin:24px 0 8px;font-weight:600">${escapeHtml(line.slice(4))}</h3>`);
		} else if (line.startsWith('- ') || line.startsWith('* ')) {
			if (!inList) {
				html.push('<ul style="margin:6px 0 12px 18px;padding:0;color:#1a1a1a">');
				inList = true;
			}
			let item = escapeHtml(line.slice(2));
			item = item.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			html.push(`<li style="margin:4px 0;line-height:1.55">${item}</li>`);
		} else {
			closeList();
			let p = escapeHtml(line);
			p = p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			html.push(`<p style="margin:8px 0;line-height:1.6;color:#1a1a1a">${p}</p>`);
		}
	}
	closeList();
	return html.join('\n');
}

function buildEmailHtml(summary: string, count: number, sessionCount: number, dateLabel: string): string {
	const summaryHtml = summaryToHtml(summary);
	return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5ede0;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede0">
	<tr><td align="center" style="padding:32px 16px">
		<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid rgba(184,149,106,0.25);max-width:600px">
			<tr><td style="padding:28px 32px 20px;border-bottom:1px solid rgba(184,149,106,0.25);background:linear-gradient(180deg,#0a1628 0%,#142442 100%)">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#b8956a">Neela &middot; daily digest</p>
				<h1 style="margin:8px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:#f5ede0;letter-spacing:0.5px">${escapeHtml(dateLabel)}</h1>
				<p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(245,237,224,0.75);letter-spacing:0.3px">${count} turns &middot; ${sessionCount} unique sessions</p>
			</td></tr>
			<tr><td style="padding:24px 32px 28px">
				${summaryHtml}
			</td></tr>
			<tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(184,149,106,0.2);background:#fbf6ec">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:12px;color:#666;letter-spacing:0.3px">Auto-generated from neela_chats. Reply to this email and the team will pick it up.</p>
			</td></tr>
		</table>
	</td></tr>
</table>
</body></html>`;
}

function buildTranscript(rows: ChatRow[]): { transcript: string; sessions: number } {
	const bySession = new Map<string, ChatRow[]>();
	for (const r of rows) {
		const list = bySession.get(r.session_id) ?? [];
		list.push(r);
		bySession.set(r.session_id, list);
	}
	const blocks: string[] = [];
	for (const [sessionId, sessionRows] of bySession.entries()) {
		sessionRows.sort((a, b) => Number(a.message_index ?? 0) - Number(b.message_index ?? 0));
		const sessionTag = sessionId.slice(-8);
		const lines: string[] = [`--- session ${sessionTag} (${sessionRows.length} turns) ---`];
		for (const r of sessionRows) {
			lines.push(`USER: ${r.user_message.replace(/\s+/g, ' ').trim().slice(0, 600)}`);
			lines.push(`NEELA: ${r.neela_reply.replace(/\s+/g, ' ').trim().slice(0, 600)}`);
		}
		blocks.push(lines.join('\n'));
	}
	return { transcript: blocks.join('\n\n'), sessions: bySession.size };
}

export interface DigestResult {
	skipped?: string;
	sent?: boolean;
	count: number;
	sessions: number;
	summary?: string;
	emailId?: string;
	preview?: string;
}

export async function runDigest(opts: { dryRun?: boolean } = {}): Promise<DigestResult> {
	const dryRun = !!opts.dryRun;
	const postgresUrl = pickEnv('POSTGRES_URL');
	if (!postgresUrl) {
		console.log('[neela-digest] no POSTGRES_URL, skipping');
		return { skipped: 'no postgres url', count: 0, sessions: 0 };
	}

	const sql = neon(postgresUrl);
	let rows: ChatRow[] = [];
	try {
		rows = (await sql`
			SELECT id, created_at, session_id, ip_hash, user_message, neela_reply,
				input_tokens, output_tokens, cache_read_tokens, message_index, conversation_length
			FROM neela_chats
			WHERE created_at >= NOW() - INTERVAL '24 hours'
			ORDER BY session_id, message_index ASC NULLS LAST, created_at ASC
		`) as ChatRow[];
	} catch (err) {
		// Table likely doesn't exist yet (no chats persisted). Treat as empty.
		console.warn('[neela-digest] db read failed', err instanceof Error ? err.message : err);
		return { skipped: 'db read failed', count: 0, sessions: 0 };
	}

	const count = rows.length;
	if (count < 1) {
		console.log('[neela-digest] no chats in 24h, skipping');
		return { skipped: 'no chats', count: 0, sessions: 0 };
	}

	const { transcript, sessions } = buildTranscript(rows);

	const apiKey = pickEnv('ANTHROPIC_API_KEY', 'Neela');
	if (!apiKey) {
		console.warn('[neela-digest] no anthropic key, skipping');
		return { skipped: 'no anthropic key', count, sessions };
	}

	const client = new Anthropic({ apiKey, maxRetries: 0 });
	const abortController = new AbortController();
	const abortTimer = setTimeout(() => abortController.abort(), ANTHROPIC_TIMEOUT_MS);

	let summary = '';
	try {
		const response = await client.messages.create(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 1500,
				system: SUMMARY_PROMPT,
				messages: [
					{
						role: 'user',
						content: `Date: ${new Date().toISOString().slice(0, 10)}\nTotal turns: ${count}\nUnique sessions: ${sessions}\n\nTranscript follows:\n\n${transcript.slice(0, 60000)}`
					}
				]
			},
			{
				signal: abortController.signal,
				timeout: ANTHROPIC_TIMEOUT_MS
			}
		);
		summary = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
			.trim();
	} catch (err) {
		console.error('[neela-digest] summarize failed', err);
		return { skipped: 'summarize failed', count, sessions };
	} finally {
		clearTimeout(abortTimer);
	}

	const dateLabel = new Date().toLocaleDateString('en-CA', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'America/Vancouver'
	});
	const html = buildEmailHtml(summary, count, sessions, dateLabel);
	const subject = `Neela daily digest – ${dateLabel}`;

	if (dryRun) {
		console.log('[neela-digest] dry-run, not sending');
		return { count, sessions, summary, preview: html };
	}

	const resendKey = pickEnv('RESEND_API_KEY');
	if (!resendKey) {
		console.log('[neela-digest] no resend key, skipping send');
		return { skipped: 'no resend key', count, sessions, summary };
	}

	try {
		const resend = new Resend(resendKey);
		const result = await resend.emails.send({
			from: DIGEST_FROM,
			to: [DIGEST_TO],
			subject,
			html,
			text: summary
		});
		const emailId = (result.data && (result.data as { id?: string }).id) || undefined;
		console.log('[neela-digest] sent', { emailId, count, sessions });
		return { sent: true, emailId, count, sessions, summary };
	} catch (err) {
		console.error('[neela-digest] send failed', err);
		return { skipped: 'send failed', count, sessions, summary };
	}
}
