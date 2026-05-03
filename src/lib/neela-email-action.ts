/**
 * Action handler for inbound Gmail threads, dispatched after classifyEmail().
 *
 * Per intent:
 *   new-inquiry   send Neela's standard walkthrough opener with the chat link
 *   order-change  store the proposed delta on the order, reply with "we got it,
 *                 the team will confirm shortly", and forward a [CHANGE REQUEST]
 *                 notice to the events team. We DO NOT auto-mutate the order
 *                 or regenerate the PDF in V1: a confused or malicious email
 *                 could ratchet down a confirmed booking. Human-in-the-loop
 *                 stays in the change path until the auto-apply path is
 *                 hardened.
 *   question      pass the email body into /api/neela's classifier (model
 *                 reuses Neela's full system prompt) and reply with the answer
 *   complaint     don't auto-respond. Label "Needs Review", forward to events
 *                 team via Resend.
 *   spam          archive
 *   auto-reply    archive
 *   unsubscribe   archive (no list-management; we don't currently send marketing)
 *
 * All actions are idempotent against the (thread_id, history_id) pair. The
 * push handler enforces dedup before calling here.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { neon } from '@neondatabase/serverless';
import {
	addLabelToThread,
	archiveThread,
	getHeader,
	getMessage,
	getThread,
	parseFromHeader,
	sendReply,
	extractPlainBody
} from './neela-gmail-send.js';
import type { GmailMessage } from './neela-gmail-send.js';
import { classifyEmail, type IntentResult } from './neela-email-intent.js';

// INTERNAL TEST ROUTING ONLY, do NOT mirror in customer responses. This is
// the team-side notification recipient when neither NEELA_TEAM_EMAIL nor
// NEELA_TEST_EMAIL is set; it never appears in customer-visible content.
const TEAM_EMAIL_FALLBACK = 'mail.sharathvittal@gmail.com';
const COMPLAINT_FORWARD_TO = 'events@sulaindianrestaurant.com';
const REFERENCE_RE = /\bSC-\d{4}-[A-Z0-9]{4}\b/i;

const NEELA_FROM_NAME = 'Neela at Sula Catering';
const CHAT_LINK = 'https://sulacatering.com/';
const QUOTE_FORM_LINK = 'https://sulaindianrestaurant.com/sula-catering-order/';

interface ActionContext {
	threadId: string;
	historyId: string;
	latestMessageId: string;
	latestMessage: GmailMessage;
	subject: string;
	fromEmail: string;
	fromName: string | null;
	bodyPlain: string;
	inReplyTo: string | null;
	messageIdHeader: string | null;
	references: string[];
	priorReference: string | null; // SC-XXXX-XXXX matched in subject
}

export interface ProcessThreadResult {
	intent: IntentResult['intent'];
	confidence: IntentResult['confidence'];
	action: 'replied' | 'flagged' | 'archived' | 'skipped';
	skippedReason?: string;
	heuristic?: boolean;
}

interface OrderRow {
	reference: string;
	order_json: unknown;
	mode: string;
	created_at: string | Date;
}

async function findOrderByReferenceOrEmail(
	reference: string | null,
	email: string
): Promise<OrderRow | null> {
	const url = process.env.POSTGRES_URL;
	if (!url) return null;
	const sql = neon(url);
	try {
		if (reference) {
			const rows = (await sql`
				SELECT reference, order_json, mode, created_at
				FROM neela_orders
				WHERE reference = ${reference.toUpperCase()}
				LIMIT 1
			`) as OrderRow[];
			if (rows.length > 0) return rows[0];
		}
		// Fallback: most recent order by this email (search inside JSONB).
		const rows = (await sql`
			SELECT reference, order_json, mode, created_at
			FROM neela_orders
			WHERE order_json->'contact'->>'email' = ${email.toLowerCase()}
			ORDER BY created_at DESC
			LIMIT 1
		`) as OrderRow[];
		return rows.length > 0 ? rows[0] : null;
	} catch (err) {
		console.warn('[neela-email-action] order lookup failed', err instanceof Error ? err.message : err);
		return null;
	}
}

async function recordChangeRequest(args: {
	threadId: string;
	reference: string | null;
	customerEmail: string;
	deltaSummary: string;
	rawBody: string;
}): Promise<void> {
	const url = process.env.POSTGRES_URL;
	if (!url) return;
	const sql = neon(url);
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS neela_order_change_requests (
				id BIGSERIAL PRIMARY KEY,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				thread_id TEXT NOT NULL,
				reference TEXT,
				customer_email TEXT,
				delta_summary TEXT,
				raw_body TEXT,
				status TEXT DEFAULT 'pending'
			)
		`;
		await sql`CREATE INDEX IF NOT EXISTS neela_change_thread_idx ON neela_order_change_requests (thread_id)`;
		await sql`
			INSERT INTO neela_order_change_requests
			(thread_id, reference, customer_email, delta_summary, raw_body)
			VALUES (
				${args.threadId},
				${args.reference || null},
				${args.customerEmail},
				${args.deltaSummary},
				${args.rawBody.slice(0, 6000)}
			)
		`;
	} catch (err) {
		console.warn('[neela-email-action] recordChangeRequest failed', err instanceof Error ? err.message : err);
	}
}

function teamEmail(): string {
	return process.env.NEELA_TEAM_EMAIL || process.env.NEELA_TEST_EMAIL || TEAM_EMAIL_FALLBACK;
}

function fromForResend(): string {
	return process.env.NEELA_FROM_EMAIL || 'Neela <neela@sulacatering.com>';
}

async function sendTeamNotice(subject: string, html: string, text: string): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.warn('[neela-email-action] no RESEND_API_KEY, team notice skipped');
		return;
	}
	try {
		const resend = new Resend(apiKey);
		const result = await resend.emails.send({
			from: fromForResend(),
			to: teamEmail(),
			subject,
			html,
			text
		});
		if (result.error) {
			console.warn('[neela-email-action] resend rejected', result.error.message);
		}
	} catch (err) {
		console.warn('[neela-email-action] resend threw', err instanceof Error ? err.message : err);
	}
}

async function forwardComplaintToEvents(args: {
	threadId: string;
	customer: string;
	subject: string;
	body: string;
	rationale?: string;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.warn('[neela-email-action] no RESEND_API_KEY, complaint forward skipped');
		return;
	}
	const subject = `[FLAG] Customer complaint inbound: ${args.subject}`;
	const text = [
		`Neela classified an inbound email as a complaint and did NOT auto-respond.`,
		``,
		`Customer: ${args.customer}`,
		`Gmail thread: ${args.threadId}`,
		args.rationale ? `Classifier rationale: ${args.rationale}` : '',
		``,
		`---`,
		args.body.slice(0, 4000),
		`---`,
		``,
		`Open the thread in events.sula@gmail.com (label NEELA_NEEDS_REVIEW) and respond directly.`
	]
		.filter(Boolean)
		.join('\n');
	const html = `<p>Neela classified an inbound email as a <strong>complaint</strong> and did not auto-respond.</p>
<p><strong>Customer:</strong> ${escapeHtml(args.customer)}<br>
<strong>Gmail thread ID:</strong> ${escapeHtml(args.threadId)}</p>
${args.rationale ? `<p><em>Classifier rationale:</em> ${escapeHtml(args.rationale)}</p>` : ''}
<hr>
<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(args.body.slice(0, 4000))}</pre>
<hr>
<p>Open the thread in events.sula@gmail.com (label <code>NEELA_NEEDS_REVIEW</code>) and respond directly.</p>`;

	try {
		const resend = new Resend(apiKey);
		const recipients = [teamEmail()];
		if (!recipients.includes(COMPLAINT_FORWARD_TO)) recipients.push(COMPLAINT_FORWARD_TO);
		const result = await resend.emails.send({
			from: fromForResend(),
			to: recipients,
			subject,
			html,
			text
		});
		if (result.error) console.warn('[neela-email-action] forward complaint resend error', result.error.message);
	} catch (err) {
		console.warn('[neela-email-action] forward complaint threw', err instanceof Error ? err.message : err);
	}
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => {
		const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
		return m[c] ?? c;
	});
}

/* ---------- Reply composers ---------- */

function newInquiryReplyBody(customerName: string | null): string {
	const greeting = customerName ? `Hi ${customerName.split(/\s+/)[0]},` : 'Hi there,';
	return `${greeting}

Thanks for reaching out to Sula Catering. I'm Neela, the team's planning assistant. Quickest way to get a real number is to walk through a few short questions with me on our site, and I'll send a PDF quote you can review (no commitment).

Chat with me here: ${CHAT_LINK}
Prefer a form? sulaindianrestaurant.com/sula-catering-order/

If you'd rather hop on a call, you can reach the team at 604-215-1130 or book 30 minutes at calendly.com/sula-catering/30min.

Talk soon,
Neela
Sula Catering`;
}

function changeRequestReplyBody(customerName: string | null, reference: string | null, deltaSummary: string): string {
	const greeting = customerName ? `Hi ${customerName.split(/\s+/)[0]},` : 'Hi there,';
	const refLine = reference ? `your booking ${reference}` : 'your booking';
	return `${greeting}

Got your change request on ${refLine}. Noting it as: ${deltaSummary || 'see your message'}.

The events team will confirm the updated quote in writing within a business day. Nothing on your booking is locked in until you approve the revised quote, so feel free to send any extra details in this thread.

Thanks,
Neela
Sula Catering`;
}

function complaintAcknowledgmentBody(customerName: string | null): string {
	// We DO send a brief "we hear you, a human will reply" so the customer
	// isn't left hanging while the team picks up the thread. Avoids silence.
	const greeting = customerName ? `Hi ${customerName.split(/\s+/)[0]},` : 'Hi there,';
	return `${greeting}

Thanks for writing in. I've flagged this for the events team so a real person can dig into the detail and reply directly. You'll hear from someone within a business day.

If it's urgent, the team line is 604-215-1130.

Neela
Sula Catering`;
}

/* ---------- Question path (re-runs Neela on the email body) ---------- */

const QUESTION_TIMEOUT_MS = 12000;

const QUESTION_REPLY_PROMPT = `You are Neela, Sula Catering's email assistant, replying to an inbound email from a current or prospective customer. Read the message and write a warm, concise email reply.

Constraints:
- Sign off as "Neela / Sula Catering".
- 80 to 160 words. Plain text, no markdown.
- NEVER use em dashes or en dashes. Use commas or periods.
- Don't invent menu items, prices, or guarantees outside Sula's verified menus.
- If the question can't be answered confidently from public Sula info (custom menu, specific dates, dietary-medical, complex weddings), say "I'll loop in the events team to confirm" rather than guessing.
- Don't quote a wedding price or tier in chat; offer the team's calendar at calendly.com/sula-catering/30min.
- Don't reply to spam or marketing.
- Speak as a real person, not a chatbot.

Output ONLY the email body. No subject line, no headers.`;

async function generateQuestionReply(args: {
	subject: string;
	body: string;
	priorReference: string | null;
}): Promise<string | null> {
	const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Neela;
	if (!apiKey) return null;
	const client = new Anthropic({ apiKey, maxRetries: 0 });
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), QUESTION_TIMEOUT_MS);
	try {
		const userPrompt = [
			args.priorReference ? `Customer references existing booking ${args.priorReference}.` : '',
			`Subject: ${args.subject}`,
			'',
			'Email body:',
			args.body.slice(0, 6000)
		]
			.filter(Boolean)
			.join('\n');
		const response = await client.messages.create(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 512,
				system: QUESTION_REPLY_PROMPT,
				messages: [{ role: 'user', content: userPrompt }]
			},
			{ signal: abort.signal, timeout: QUESTION_TIMEOUT_MS }
		);
		const text = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
			.trim();
		return text || null;
	} catch (err) {
		console.warn('[neela-email-action] question reply LLM failed', err instanceof Error ? err.message : err);
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/* ---------- Context builder ---------- */

async function buildActionContext(threadId: string, historyId: string, messageId: string): Promise<ActionContext | null> {
	let latestMessage: GmailMessage;
	try {
		latestMessage = await getMessage(messageId);
	} catch (err) {
		console.warn('[neela-email-action] could not fetch message', messageId, err instanceof Error ? err.message : err);
		return null;
	}
	// Skip messages we (events.sula) sent ourselves, those should never trigger
	// the loop on themselves.
	const labelIds = latestMessage.labelIds || [];
	if (labelIds.includes('SENT')) {
		return null;
	}
	const subject = getHeader(latestMessage, 'Subject') || '';
	const fromHeader = getHeader(latestMessage, 'From');
	const parsedFrom = parseFromHeader(fromHeader);
	if (!parsedFrom) return null;
	const inReplyTo = getHeader(latestMessage, 'In-Reply-To');
	const messageIdHeader = getHeader(latestMessage, 'Message-ID') || getHeader(latestMessage, 'Message-Id');
	const referencesHeader = getHeader(latestMessage, 'References') || '';
	const references = referencesHeader
		.split(/\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const bodyPlain = extractPlainBody(latestMessage);
	const refMatch = subject.match(REFERENCE_RE);
	return {
		threadId,
		historyId,
		latestMessageId: messageId,
		latestMessage,
		subject,
		fromEmail: parsedFrom.email,
		fromName: parsedFrom.name,
		bodyPlain,
		inReplyTo,
		messageIdHeader,
		references,
		priorReference: refMatch ? refMatch[0].toUpperCase() : null
	};
}

/* ---------- Public entrypoint ---------- */

export async function processInboundMessage(args: {
	threadId: string;
	historyId: string;
	messageId: string;
}): Promise<ProcessThreadResult> {
	const ctx = await buildActionContext(args.threadId, args.historyId, args.messageId);
	if (!ctx) {
		return { intent: 'spam', confidence: 'low', action: 'skipped', skippedReason: 'self-sent or unparseable' };
	}

	const classification = await classifyEmail({
		subject: ctx.subject,
		from: ctx.fromEmail,
		body: ctx.bodyPlain,
		inReplyTo: ctx.inReplyTo,
		knownReference: ctx.priorReference
	});

	console.log('[neela-email-action] classified', {
		threadId: ctx.threadId,
		intent: classification.intent,
		confidence: classification.confidence,
		from: ctx.fromEmail.split('@')[1]
	});

	const replyBase = {
		threadId: ctx.threadId,
		to: ctx.fromEmail,
		subject: ctx.subject,
		fromName: NEELA_FROM_NAME,
		inReplyTo: ctx.messageIdHeader || undefined,
		references: ctx.messageIdHeader
			? [...ctx.references.filter((r) => r !== ctx.messageIdHeader), ctx.messageIdHeader]
			: ctx.references
	};

	switch (classification.intent) {
		case 'spam':
		case 'auto-reply':
		case 'unsubscribe': {
			await safeArchive(ctx.threadId);
			await safeLabel(ctx.threadId, 'NEELA_HANDLED');
			return { intent: classification.intent, confidence: classification.confidence, action: 'archived', heuristic: classification.heuristic };
		}

		case 'complaint': {
			await safeLabel(ctx.threadId, 'NEELA_NEEDS_REVIEW');
			await forwardComplaintToEvents({
				threadId: ctx.threadId,
				customer: ctx.fromName ? `${ctx.fromName} <${ctx.fromEmail}>` : ctx.fromEmail,
				subject: ctx.subject,
				body: ctx.bodyPlain,
				rationale: classification.rationale
			});
			try {
				await sendReply({
					...replyBase,
					body: complaintAcknowledgmentBody(ctx.fromName)
				});
			} catch (err) {
				console.warn('[neela-email-action] complaint ack reply failed', err instanceof Error ? err.message : err);
			}
			return { intent: 'complaint', confidence: classification.confidence, action: 'flagged', heuristic: classification.heuristic };
		}

		case 'order-change': {
			const order = await findOrderByReferenceOrEmail(ctx.priorReference, ctx.fromEmail);
			const reference = order?.reference ?? ctx.priorReference ?? null;
			const delta = classification.orderChangeDelta || 'see customer message';
			await recordChangeRequest({
				threadId: ctx.threadId,
				reference,
				customerEmail: ctx.fromEmail,
				deltaSummary: delta,
				rawBody: ctx.bodyPlain
			});
			await safeLabel(ctx.threadId, 'NEELA_CHANGE_REQUEST');
			// Notify the team so the events team can review + apply.
			await sendTeamNotice(
				`[Change request] ${reference || ctx.fromEmail}: ${delta.slice(0, 80)}`,
				`<p>Customer requested a change to ${reference ? `<strong>${escapeHtml(reference)}</strong>` : 'an existing order'} (${escapeHtml(ctx.fromEmail)}).</p>
<p><strong>Proposed delta:</strong> ${escapeHtml(delta)}</p>
<p><strong>Gmail thread:</strong> ${escapeHtml(ctx.threadId)}</p>
<hr>
<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(ctx.bodyPlain.slice(0, 4000))}</pre>`,
				`Change request from ${ctx.fromEmail} on ${reference || '(no ref matched)'}.\nDelta: ${delta}\nGmail thread: ${ctx.threadId}\n\n---\n${ctx.bodyPlain.slice(0, 4000)}`
			);
			try {
				await sendReply({
					...replyBase,
					body: changeRequestReplyBody(ctx.fromName, reference, delta)
				});
			} catch (err) {
				console.warn('[neela-email-action] change ack reply failed', err instanceof Error ? err.message : err);
			}
			return { intent: 'order-change', confidence: classification.confidence, action: 'flagged', heuristic: classification.heuristic };
		}

		case 'question': {
			const reply = await generateQuestionReply({
				subject: ctx.subject,
				body: ctx.bodyPlain,
				priorReference: ctx.priorReference
			});
			if (!reply) {
				// Fallback to the generic new-inquiry shape.
				await sendReply({
					...replyBase,
					body: newInquiryReplyBody(ctx.fromName)
				});
			} else {
				await sendReply({ ...replyBase, body: reply });
			}
			await safeLabel(ctx.threadId, 'NEELA_HANDLED');
			return { intent: 'question', confidence: classification.confidence, action: 'replied', heuristic: classification.heuristic };
		}

		case 'new-inquiry':
		default: {
			await sendReply({
				...replyBase,
				body: newInquiryReplyBody(ctx.fromName)
			});
			await safeLabel(ctx.threadId, 'NEELA_HANDLED');
			return { intent: classification.intent, confidence: classification.confidence, action: 'replied', heuristic: classification.heuristic };
		}
	}
}

async function safeLabel(threadId: string, label: string): Promise<void> {
	try {
		await addLabelToThread(threadId, label);
	} catch (err) {
		console.warn('[neela-email-action] label failed', label, err instanceof Error ? err.message : err);
	}
}

async function safeArchive(threadId: string): Promise<void> {
	try {
		await archiveThread(threadId);
	} catch (err) {
		console.warn('[neela-email-action] archive failed', err instanceof Error ? err.message : err);
	}
}

// Re-export for the push handler to fetch the thread snapshot if needed.
export { getThread };
