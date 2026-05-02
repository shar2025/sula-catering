/**
 * ingest-emails.mjs — Phase 2 RAG: ingest Sula's events-team email history
 * into Neela's knowledge base.
 *
 * Input formats:
 *   .json  — array of {thread_id, subject, messages: [{from, to, date, body}]}
 *   .mbox  — Gmail mbox export (parsed via mailparser, threaded by subject + participants)
 *
 * Pipeline:
 *   1. Parse → unified thread list
 *   2. PII strip body text (emails, phones, addresses, card numbers)
 *      Preserves: subject, money amounts, dates, guest counts, dietary mentions
 *   3. Filter: drop auto-replies, "thanks!" one-liners, no-reply senders
 *   4. Summarize each thread via Claude Sonnet (topic + summary + Q&A exchange)
 *      With --no-llm or no ANTHROPIC_API_KEY: mechanical fallback (subject + first body)
 *   5. Write src/lib/neela-email-corpus.ts (committed; not auto-regenerated)
 *
 * Token budget:
 *   If output > 30k tokens, the system-prompt path is full and we'd switch to a
 *   vector-RAG path (Voyage AI embed + Cloudflare Vectorize index). For tonight
 *   we just measure + warn; vector path is scaffolded as TODO.
 *
 * Usage:
 *   node scripts/ingest-emails.mjs <input> [--out <path>] [--dry] [--no-llm]
 *
 * Examples:
 *   node scripts/ingest-emails.mjs data/synthetic-test-emails.json --no-llm
 *   node scripts/ingest-emails.mjs data/sula-emails.mbox
 *   node scripts/ingest-emails.mjs data/synthetic-test-emails.json --dry
 */

import { readFileSync, writeFileSync, mkdirSync, createReadStream, existsSync } from 'node:fs';
import { extname, dirname } from 'node:path';

const APPROX_CHARS_PER_TOKEN = 4;
const TOKEN_BUDGET = 30_000;
const MIN_BODY_CHARS = 80;
const MIN_QUESTION_CHARS = 60;
const DEFAULT_OUT = 'src/lib/neela-email-corpus.ts';
const ANTHROPIC_TIMEOUT_MS = 25000;

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flags = {
	dry: argv.includes('--dry'),
	noLlm: argv.includes('--no-llm')
};
const positional = argv.filter((a) => !a.startsWith('--'));
const inputPath = positional[0];
const outIdx = argv.indexOf('--out');
const outPath = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT;

if (!inputPath) {
	console.error('usage: node scripts/ingest-emails.mjs <input.json|input.mbox> [--out <path>] [--dry] [--no-llm]');
	process.exit(2);
}
if (!existsSync(inputPath)) {
	console.error(`[ingest] input not found: ${inputPath}`);
	process.exit(2);
}

// ---------- Parsers ----------
async function parseJson(path) {
	const data = JSON.parse(readFileSync(path, 'utf8'));
	if (!Array.isArray(data)) throw new Error('expected an array of thread objects');
	return data.map((t, i) => ({
		thread_id: t.thread_id || t.id || `t-${i}`,
		subject: String(t.subject || '(no subject)'),
		messages: (t.messages || []).map((m) => ({
			from: String(m.from || ''),
			to: String(m.to || ''),
			date: m.date ? new Date(m.date).toISOString() : '',
			body: String(m.body || '').replace(/\r\n/g, '\n').trim()
		}))
	}));
}

async function parseMbox(path) {
	// Lazy-load mailparser only if we hit an mbox so the JSON path doesn't pay
	// the cost (mailparser pulls in libmime + iconv-lite).
	const { simpleParser } = await import('mailparser');
	const raw = readFileSync(path, 'utf8');
	// mbox: messages separated by lines starting with "From " (no colon).
	const chunks = raw.split(/^From [^\n]*$/m).map((c) => c.trim()).filter(Boolean);
	const parsed = await Promise.all(chunks.map((c) => simpleParser(c).catch(() => null)));
	const messages = parsed.filter(Boolean).map((m) => ({
		from: m.from?.text || '',
		to: m.to?.text || '',
		date: m.date ? new Date(m.date).toISOString() : '',
		subject: m.subject || '(no subject)',
		body: (m.text || '').replace(/\r\n/g, '\n').trim()
	}));
	// Group by normalized subject (strip Re: / Fwd: prefixes) + sorted participant pair.
	const threads = new Map();
	for (const m of messages) {
		const subj = m.subject.replace(/^(re:|fwd:|fw:)\s*/i, '').trim().toLowerCase();
		const peers = [m.from, m.to].sort().join('|').toLowerCase();
		const key = `${subj}::${peers}`;
		const list = threads.get(key) ?? { subject: m.subject, messages: [] };
		list.messages.push(m);
		threads.set(key, list);
	}
	let i = 0;
	return [...threads.values()].map((t) => {
		t.messages.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
		return { thread_id: `mbox-${i++}`, subject: t.subject, messages: t.messages };
	});
}

// ---------- PII strip ----------
const PII_PATTERNS = [
	// Credit cards (16-digit, with separators) — must run before phone to avoid swallowing
	{ re: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[card]' },
	// Email
	{ re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[email]' },
	// Phone (North American-ish): optional +1, optional parens around 3 digits, separators
	{ re: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: '[phone]' },
	// Address heuristic: 2-5 digit number then street name + suffix (St/Ave/Rd/etc).
	{ re: /\b\d{2,5}\s+[A-Z0-9][A-Za-z0-9'.-]*(?:\s+[A-Za-z0-9'.-]+)*\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Way|Dr|Drive|Lane|Ln|Court|Ct|Place|Pl|Crescent|Cres|Hwy|Highway)\b\.?/gi, replacement: '[address]' },
	// "555 W Hastings 14th floor" — pre-suffix pattern catches the leading number+street; unit/floor stays.
];

function stripPii(text) {
	let out = text;
	for (const { re, replacement } of PII_PATTERNS) {
		out = out.replace(re, replacement);
	}
	return out;
}

// ---------- Filter ----------
function senderRole(addr) {
	const a = addr.toLowerCase();
	if (a.includes('events@sulaindianrestaurant.com') || a.includes('sula events') || a.includes('info@sulaindianrestaurant.com')) {
		return 'sula';
	}
	return 'user';
}

function isAutoReply(thread) {
	const subj = thread.subject.toLowerCase();
	if (/out of office|automatic reply|auto-reply|undeliverable/.test(subj)) return true;
	if (thread.messages.length === 1 && /noreply|no-reply/i.test(thread.messages[0].from)) return true;
	return false;
}

function isThanksOnly(thread) {
	if (thread.messages.length > 2) return false;
	const userMsgs = thread.messages.filter((m) => senderRole(m.from) === 'user');
	if (userMsgs.length === 0) return true;
	const longest = Math.max(...userMsgs.map((m) => m.body.length));
	return longest < MIN_BODY_CHARS;
}

function hasSubstantiveQuestion(thread) {
	for (const m of thread.messages) {
		if (senderRole(m.from) !== 'user') continue;
		if (m.body.length < MIN_QUESTION_CHARS) continue;
		// Looks substantive if body has a question mark, dollar amount, or guest-count phrase
		if (/\?/.test(m.body)) return true;
		if (/\$\s*\d/.test(m.body)) return true;
		if (/\b(guests?|head ?count|people|wedding|event|catering|menu|halal|vegan|jain|delivery|setup|deposit)\b/i.test(m.body)) return true;
	}
	return false;
}

function shouldKeep(thread) {
	if (isAutoReply(thread)) return false;
	if (isThanksOnly(thread)) return false;
	return hasSubstantiveQuestion(thread);
}

// ---------- Summarize ----------
function mechanicalSummary(thread) {
	const userMsgs = thread.messages.filter((m) => senderRole(m.from) === 'user');
	const sulaMsgs = thread.messages.filter((m) => senderRole(m.from) === 'sula');
	const firstUser = userMsgs[0]?.body?.replace(/\s+/g, ' ').slice(0, 320) || '';
	const firstSula = sulaMsgs[0]?.body?.replace(/\s+/g, ' ').slice(0, 320) || '';
	const subj = thread.subject;
	const topic = subj.length > 60 ? subj.slice(0, 57) + '…' : subj;
	const summary = firstUser
		? `User asked about: ${firstUser.slice(0, 160)}${firstUser.length > 160 ? '…' : ''}`
		: `Thread "${topic}" with ${thread.messages.length} messages`;
	const exchange = [];
	if (firstUser) exchange.push(`USER: ${firstUser}`);
	if (firstSula) exchange.push(`SULA: ${firstSula}`);
	return { topic, summary, exchange };
}

async function llmSummary(thread, anthropic) {
	const transcript = thread.messages
		.map((m) => `[${senderRole(m.from).toUpperCase()}] ${m.body.replace(/\s+/g, ' ').slice(0, 1500)}`)
		.join('\n\n');
	const prompt = `You're summarizing one email thread between a customer and Sula's events team. Output exactly three lines, no extra prose, no headers:

TOPIC: <2-5 word tag, e.g. "wedding-quote-250" or "halal-sangeet" or "cancellation-flood">
SUMMARY: <one line, under 25 words, what was asked and how Sula handled it>
EXCHANGE: <one representative user message + one Sula reply, separated by ||| , each under 240 chars, both PII-stripped already>

Voice rules: no em dashes, no marketing words, no "solutions" / "experiences" / "elevate".

Thread (subject: "${thread.subject}"):

${transcript}`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
	try {
		const resp = await anthropic.messages.create(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 600,
				messages: [{ role: 'user', content: prompt }]
			},
			{ signal: controller.signal, timeout: ANTHROPIC_TIMEOUT_MS }
		);
		const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
		const topic = (text.match(/^TOPIC:\s*(.+)$/m) || [])[1]?.trim() || thread.subject;
		const summary = (text.match(/^SUMMARY:\s*(.+)$/m) || [])[1]?.trim() || '';
		const exRaw = (text.match(/^EXCHANGE:\s*(.+)$/m) || [])[1] || '';
		const exchange = exRaw.split('|||').map((s) => s.trim()).filter(Boolean);
		return { topic, summary, exchange };
	} finally {
		clearTimeout(timer);
	}
}

// ---------- Main ----------
async function main() {
	console.log(`[ingest] reading ${inputPath}`);
	const ext = extname(inputPath).toLowerCase();
	const threads = ext === '.mbox' ? await parseMbox(inputPath) : await parseJson(inputPath);
	console.log(`[ingest] parsed ${threads.length} threads`);

	// Strip PII first, then filter
	for (const t of threads) {
		for (const m of t.messages) m.body = stripPii(m.body);
	}
	const kept = threads.filter(shouldKeep);
	const dropped = threads.length - kept.length;
	console.log(`[ingest] kept ${kept.length} threads, dropped ${dropped} (auto-replies, one-liners, non-substantive)`);

	const useLlm = !flags.noLlm && !!process.env.ANTHROPIC_API_KEY;
	let anthropic = null;
	if (useLlm) {
		try {
			const Anthropic = (await import('@anthropic-ai/sdk')).default;
			anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
			console.log('[ingest] LLM summarization on (claude-sonnet-4-6)');
		} catch (err) {
			console.warn('[ingest] LLM init failed, falling back to mechanical', err?.message || err);
		}
	} else {
		console.log(`[ingest] LLM summarization off (${flags.noLlm ? '--no-llm' : 'no ANTHROPIC_API_KEY'})`);
	}

	const corpus = [];
	for (const t of kept) {
		try {
			const summary = anthropic
				? await llmSummary(t, anthropic)
				: mechanicalSummary(t);
			corpus.push({
				thread_id: t.thread_id,
				subject: t.subject,
				topic: summary.topic || t.subject,
				summary: summary.summary || '',
				exchange: summary.exchange || []
			});
			console.log(`[ingest]  ✓ ${t.thread_id} → ${summary.topic}`);
		} catch (err) {
			console.warn(`[ingest]  ✗ ${t.thread_id} summarize failed, mechanical fallback`, err?.message || err);
			const m = mechanicalSummary(t);
			corpus.push({ thread_id: t.thread_id, subject: t.subject, ...m });
		}
	}

	const serialized = JSON.stringify(corpus, null, '\t');
	const approxTokens = Math.round(serialized.length / APPROX_CHARS_PER_TOKEN);
	const overBudget = approxTokens > TOKEN_BUDGET;
	console.log(`[ingest] corpus ${serialized.length} chars, ~${approxTokens} tokens (budget ${TOKEN_BUDGET}) ${overBudget ? '— OVER' : 'ok'}`);
	if (overBudget) {
		console.warn(`[ingest] WARNING: corpus exceeds ${TOKEN_BUDGET} tokens.`);
		console.warn(`[ingest] System-prompt path is full. Switch to vector RAG (Voyage AI embed + Cloudflare Vectorize index).`);
		console.warn(`[ingest] For now the file is still emitted; the consumer (api/neela.ts) can decide to skip if oversize.`);
	}

	if (flags.dry) {
		console.log('[ingest] --dry, not writing output');
		return;
	}

	mkdirSync(dirname(outPath), { recursive: true });
	const ts = `// AUTO-GENERATED by scripts/ingest-emails.mjs
// Source: ${inputPath}
// Generated: ${new Date().toISOString()}
// Threads kept: ${corpus.length} of ${threads.length} parsed (${dropped} filtered out)
// Approx tokens: ${approxTokens}
//
// Phase 2 status: NOT YET WIRED into Neela's system prompt. The corpus is
// generated and committed for inspection / future use. To enable, add an
// import + 5th cache_control block in api/neela.ts (note: Anthropic max is 4
// breakpoints, so one of the existing blocks would need to merge).
//
// Token-budget plan: if EMAIL_CORPUS_TOKEN_ESTIMATE > 30000 we'll instead
// pre-embed via Voyage AI and query a Cloudflare Vectorize index per chat.

export interface EmailCorpusEntry {
\tthread_id: string;
\tsubject: string;
\ttopic: string;
\tsummary: string;
\texchange: string[];
}

export const EMAIL_CORPUS: EmailCorpusEntry[] = ${serialized};

export const EMAIL_CORPUS_THREAD_COUNT = ${corpus.length};
export const EMAIL_CORPUS_TOKEN_ESTIMATE = ${approxTokens};
export const EMAIL_CORPUS_OVER_BUDGET = ${overBudget};
export const EMAIL_CORPUS_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};
`;
	writeFileSync(outPath, ts);
	console.log(`[ingest] wrote ${outPath}`);
}

main().catch((err) => {
	console.error('[ingest] fatal', err);
	process.exit(1);
});
