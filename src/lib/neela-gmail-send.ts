/**
 * Gmail outbound + label/archive helpers for Neela.
 *
 * - sendReply(): builds an RFC 2822 message with In-Reply-To + References,
 *   posts to users.messages.send with threadId so Gmail keeps it threaded
 *   in the customer's mailbox AND in events.sula's Sent folder.
 * - addLabel(): looks up (or lazily creates) a Gmail label and adds it to
 *   the thread. Used to flag "NEELA_HANDLED", "NEELA_NEEDS_REVIEW", etc.
 * - archiveThread(): removes INBOX from every message in the thread.
 *
 * All Gmail REST calls go through getAccessToken() which transparently
 * refreshes from GMAIL_REFRESH_TOKEN.
 */

import { randomBytes } from 'node:crypto';
import { getAccessToken, getGmailUserEmail } from './neela-gmail-auth.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface MessageAttachment {
	filename: string;
	mimeType: string;
	contentBase64: string;
}

export interface SendReplyArgs {
	threadId: string;
	to: string;
	subject: string;
	body: string;
	inReplyTo?: string;
	references?: string[];
	cc?: string;
	bcc?: string;
	fromName?: string;
	attachments?: MessageAttachment[];
}

export interface SendReplyResult {
	id: string;
	threadId: string;
	labelIds?: string[];
}

function ensureSubjectIsReply(subject: string): string {
	if (!subject) return 'Re: (no subject)';
	if (/^re:\s/i.test(subject.trim())) return subject;
	return `Re: ${subject}`;
}

function generateBoundary(): string {
	return `--neela-${randomBytes(12).toString('hex')}`;
}

function encodeHeader(value: string): string {
	// MIME encoded-word, RFC 2047, only when non-ASCII present.
	if (/^[\x20-\x7e]*$/.test(value)) return value;
	return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildRawMessage(args: SendReplyArgs): string {
	const fromName = args.fromName || 'Sula Catering';
	const fromEmail = getGmailUserEmail();
	const subject = ensureSubjectIsReply(args.subject);

	const headers: string[] = [
		`From: ${encodeHeader(fromName)} <${fromEmail}>`,
		`To: ${args.to}`,
		`Subject: ${encodeHeader(subject)}`,
		`MIME-Version: 1.0`
	];
	if (args.cc) headers.push(`Cc: ${args.cc}`);
	if (args.bcc) headers.push(`Bcc: ${args.bcc}`);
	if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`);
	const refs = args.references && args.references.length > 0 ? args.references.join(' ') : args.inReplyTo || '';
	if (refs) headers.push(`References: ${refs}`);

	const hasAttachments = args.attachments && args.attachments.length > 0;
	if (!hasAttachments) {
		headers.push('Content-Type: text/plain; charset="UTF-8"');
		headers.push('Content-Transfer-Encoding: 7bit');
		return headers.join('\r\n') + '\r\n\r\n' + args.body;
	}

	const boundary = generateBoundary();
	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
	const parts: string[] = [];
	parts.push(`--${boundary}`);
	parts.push('Content-Type: text/plain; charset="UTF-8"');
	parts.push('Content-Transfer-Encoding: 7bit');
	parts.push('');
	parts.push(args.body);
	for (const att of args.attachments!) {
		parts.push(`--${boundary}`);
		parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
		parts.push('Content-Transfer-Encoding: base64');
		parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
		parts.push('');
		// Wrap base64 to 76 chars per line (RFC 2045)
		parts.push(att.contentBase64.match(/.{1,76}/g)?.join('\r\n') || '');
	}
	parts.push(`--${boundary}--`);
	return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

function rawToBase64Url(raw: string): string {
	return Buffer.from(raw, 'utf8').toString('base64url');
}

async function gmailFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const token = await getAccessToken();
	const headers = new Headers(init.headers as HeadersInit);
	headers.set('authorization', `Bearer ${token}`);
	if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
	return fetch(`${GMAIL_API_BASE}${path}`, { ...init, headers });
}

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
	const raw = buildRawMessage(args);
	const body = JSON.stringify({
		raw: rawToBase64Url(raw),
		threadId: args.threadId
	});
	const res = await gmailFetch('/messages/send', { method: 'POST', body });
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail send failed (${res.status}): ${text.slice(0, 500)}`);
	}
	return (await res.json()) as SendReplyResult;
}

/* ---------- Labels ---------- */

interface GmailLabel {
	id: string;
	name: string;
	type?: string;
}

const labelCache = new Map<string, string>(); // label name -> label id (per warm Lambda)

async function listLabels(): Promise<GmailLabel[]> {
	const res = await gmailFetch('/labels');
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail labels list failed (${res.status}): ${text.slice(0, 300)}`);
	}
	const data = (await res.json()) as { labels?: GmailLabel[] };
	return data.labels ?? [];
}

async function createLabel(name: string): Promise<GmailLabel> {
	const res = await gmailFetch('/labels', {
		method: 'POST',
		body: JSON.stringify({
			name,
			labelListVisibility: 'labelShow',
			messageListVisibility: 'show'
		})
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail label create failed (${res.status}): ${text.slice(0, 300)}`);
	}
	return (await res.json()) as GmailLabel;
}

export async function ensureLabelId(name: string): Promise<string> {
	if (labelCache.has(name)) return labelCache.get(name)!;
	const labels = await listLabels();
	const found = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
	if (found) {
		labelCache.set(name, found.id);
		return found.id;
	}
	const created = await createLabel(name);
	labelCache.set(name, created.id);
	return created.id;
}

export async function addLabelToThread(threadId: string, labelName: string): Promise<void> {
	const labelId = await ensureLabelId(labelName);
	const res = await gmailFetch(`/threads/${encodeURIComponent(threadId)}/modify`, {
		method: 'POST',
		body: JSON.stringify({ addLabelIds: [labelId] })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail thread label failed (${res.status}): ${text.slice(0, 300)}`);
	}
}

export async function archiveThread(threadId: string): Promise<void> {
	const res = await gmailFetch(`/threads/${encodeURIComponent(threadId)}/modify`, {
		method: 'POST',
		body: JSON.stringify({ removeLabelIds: ['INBOX'] })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail thread archive failed (${res.status}): ${text.slice(0, 300)}`);
	}
}

/* ---------- Reads (used by the push handler) ---------- */

export interface GmailMessageHeader {
	name: string;
	value: string;
}

export interface GmailMessagePayloadPart {
	mimeType?: string;
	filename?: string;
	headers?: GmailMessageHeader[];
	body?: { data?: string; size?: number; attachmentId?: string };
	parts?: GmailMessagePayloadPart[];
}

export interface GmailMessage {
	id: string;
	threadId: string;
	historyId?: string;
	internalDate?: string;
	snippet?: string;
	labelIds?: string[];
	payload?: GmailMessagePayloadPart;
}

export interface GmailThread {
	id: string;
	historyId?: string;
	messages: GmailMessage[];
}

export async function getThread(threadId: string): Promise<GmailThread> {
	const res = await gmailFetch(`/threads/${encodeURIComponent(threadId)}?format=full`);
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail thread fetch failed (${res.status}): ${text.slice(0, 300)}`);
	}
	return (await res.json()) as GmailThread;
}

export async function getMessage(messageId: string): Promise<GmailMessage> {
	const res = await gmailFetch(`/messages/${encodeURIComponent(messageId)}?format=full`);
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail message fetch failed (${res.status}): ${text.slice(0, 300)}`);
	}
	return (await res.json()) as GmailMessage;
}

export interface HistoryListResult {
	history?: Array<{
		id: string;
		messages?: Array<{ id: string; threadId: string }>;
		messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
	}>;
	historyId?: string;
	nextPageToken?: string;
}

export async function listHistory(
	startHistoryId: string,
	historyTypes: string[] = ['messageAdded']
): Promise<HistoryListResult> {
	const params = new URLSearchParams({ startHistoryId });
	for (const t of historyTypes) params.append('historyTypes', t);
	const res = await gmailFetch(`/history?${params.toString()}`);
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail history.list failed (${res.status}): ${text.slice(0, 300)}`);
	}
	return (await res.json()) as HistoryListResult;
}

export interface WatchResult {
	historyId: string;
	expiration: string; // ms-since-epoch as string
}

export async function startWatch(topicName: string, labelIds: string[] = ['INBOX']): Promise<WatchResult> {
	const res = await gmailFetch('/watch', {
		method: 'POST',
		body: JSON.stringify({ topicName, labelIds, labelFilterAction: 'include' })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail watch failed (${res.status}): ${text.slice(0, 500)}`);
	}
	return (await res.json()) as WatchResult;
}

export async function stopWatch(): Promise<void> {
	const res = await gmailFetch('/stop', { method: 'POST' });
	if (!res.ok && res.status !== 204) {
		const text = await res.text().catch(() => '');
		throw new Error(`gmail stop failed (${res.status}): ${text.slice(0, 300)}`);
	}
}

/* ---------- Helpers for parsing inbound payloads ---------- */

export function getHeader(message: GmailMessage, name: string): string | null {
	const headers = message.payload?.headers ?? [];
	const lower = name.toLowerCase();
	const found = headers.find((h) => h.name.toLowerCase() === lower);
	return found ? found.value : null;
}

function decodeBase64Url(s: string | undefined | null): string {
	if (!s) return '';
	try {
		return Buffer.from(s, 'base64url').toString('utf8');
	} catch {
		return '';
	}
}

export function extractPlainBody(message: GmailMessage): string {
	const payload = message.payload;
	if (!payload) return '';
	const stack: GmailMessagePayloadPart[] = [payload];
	let firstHtml = '';
	while (stack.length > 0) {
		const part = stack.pop()!;
		const mime = (part.mimeType || '').toLowerCase();
		if (mime === 'text/plain' && part.body?.data) {
			return decodeBase64Url(part.body.data).trim();
		}
		if (mime === 'text/html' && part.body?.data && !firstHtml) {
			firstHtml = decodeBase64Url(part.body.data);
		}
		if (part.parts) for (const p of part.parts) stack.push(p);
	}
	if (firstHtml) {
		// Crude HTML to text: drop tags + collapse whitespace. Good enough for
		// classifier input; we never display this back to the customer.
		return firstHtml
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<br\s*\/?\s*>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}
	return (message.snippet || '').trim();
}

export interface ParsedFromHeader {
	name: string | null;
	email: string;
}

export function parseFromHeader(value: string | null): ParsedFromHeader | null {
	if (!value) return null;
	// Forms: "Name <email@x.com>" or just "email@x.com".
	const angle = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
	if (angle) return { name: angle[1]?.trim() || null, email: angle[2].trim().toLowerCase() };
	const bare = value.match(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/);
	if (bare) return { name: null, email: bare[0].toLowerCase() };
	return null;
}
