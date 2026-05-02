/**
 * ingest-emails.mjs — Phase 2 RAG: ingest Sula's events-team email history
 * into Neela's knowledge base.
 *
 * Input formats:
 *   .mbox        — Gmail mbox export (parsed via mailparser, threaded by Message-ID
 *                  + In-Reply-To + References, with subject-normalization fallback).
 *   directory    — directory containing one or more .mbox files (multi-part exports).
 *                  All threads from all files merge; cross-file replies still link
 *                  via the Message-ID graph.
 *   .json        — legacy fallback: array of {thread_id, subject, messages[]}.
 *
 * Pipeline:
 *   1. Parse → unified thread list (one thread per connected component in the
 *      reply graph; subject-normalized fallback when headers are missing)
 *   2. PII strip body text (emails, phones, addresses, card numbers)
 *      Preserves: subject, body content, dollar amounts, dates, guest counts,
 *      dietary mentions, dish names, venue names
 *   3. Filter: drop auto-replies, "thanks!" one-liners, no-reply senders,
 *      threads under 30 words total
 *   4. Summarize each thread via Claude Sonnet → JSON {topic, summary, key_exchange: {q, a}}
 *      With --no-llm or no ANTHROPIC_API_KEY: mechanical fallback (subject + first Q+A)
 *   5. Write src/lib/neela-email-corpus.ts
 *
 * Token budget:
 *   If output > 25k tokens, log "RAG mode required — corpus exceeds prompt budget;
 *   switch to vector retrieval" but still write the file. The downstream consumer
 *   (api/neela.ts) can then decide to skip the inline block and route to a vector
 *   index instead.
 *
 * Usage:
 *   node scripts/ingest-emails.mjs <input> [--out <path>] [--dry] [--no-llm]
 *   npm run ingest:emails -- data/sula-emails.mbox
 *   npm run ingest:emails -- data/synthetic-test-emails.mbox --no-llm
 *
 * Phase 2 status: NOT YET WIRED into Neela's prompt. Generated corpus is committed
 * for inspection; api/neela.ts wires it in once the real export is processed.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, existsSync } from 'node:fs';
import { extname, dirname, join } from 'node:path';

const APPROX_CHARS_PER_TOKEN = 4;
const TOKEN_BUDGET = 25_000;
const MIN_BODY_CHARS = 80;
const MIN_QUESTION_CHARS = 60;
const MIN_THREAD_WORDS = 30;
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
	console.error('usage: node scripts/ingest-emails.mjs <input.mbox|input-dir|input.json> [--out <path>] [--dry] [--no-llm]');
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
			body: String(m.body || '').replace(/\r\n/g, '\n').trim(),
			messageId: '',
			inReplyTo: '',
			references: []
		}))
	}));
}

function normalizeSubject(s) {
	return String(s || '').replace(/^(\s*(re|fwd|fw):\s*)+/i, '').trim().toLowerCase();
}

// Lazy-loaded mailparser (mailparser pulls in libmime + iconv-lite, not cheap).
let _parser;
async function getParser() {
	if (!_parser) _parser = (await import('mailparser')).simpleParser;
	return _parser;
}

async function parseMboxFile(path) {
	const simpleParser = await getParser();
	const raw = readFileSync(path, 'utf8');
	// mbox: messages separated by lines starting with "From " (no colon) at column 0.
	const chunks = raw.split(/(?:^|\r?\n)From [^\n]*\r?\n/g).map((c) => c.trim()).filter(Boolean);
	const parsed = await Promise.all(chunks.map((c) => simpleParser(c).catch(() => null)));
	return parsed.filter(Boolean).map((m) => {
		const refs = (m.references ? (Array.isArray(m.references) ? m.references : [m.references]) : []).map(String);
		return {
			from: m.from?.text || '',
			to: m.to?.text || '',
			date: m.date ? new Date(m.date).toISOString() : '',
			subject: m.subject || '(no subject)',
			body: (m.text || '').replace(/\r\n/g, '\n').trim(),
			messageId: String(m.messageId || ''),
			inReplyTo: String(m.inReplyTo || ''),
			references: refs
		};
	});
}

async function parseMboxAny(path) {
	const stats = statSync(path);
	const allMessages = [];
	if (stats.isDirectory()) {
		const files = readdirSync(path).filter((f) => f.toLowerCase().endsWith('.mbox')).sort();
		console.log(`[ingest] directory mode: ${files.length} mbox file(s)`);
		for (const f of files) {
			const full = join(path, f);
			const msgs = await parseMboxFile(full);
			console.log(`[ingest]   ${f}: ${msgs.length} messages`);
			allMessages.push(...msgs);
		}
	} else {
		const msgs = await parseMboxFile(path);
		console.log(`[ingest] ${msgs.length} messages from ${path}`);
		allMessages.push(...msgs);
	}

	// Threading: union-find over Message-IDs using In-Reply-To + References edges.
	// Fallback: messages without Message-ID join via normalized subject.
	const parent = new Map();
	const find = (k) => {
		if (!parent.has(k)) parent.set(k, k);
		while (parent.get(k) !== k) {
			parent.set(k, parent.get(parent.get(k)));
			k = parent.get(k);
		}
		return k;
	};
	const union = (a, b) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};

	for (const m of allMessages) {
		const key = m.messageId || `subj::${normalizeSubject(m.subject)}::${m.from.toLowerCase()}::${m.date}`;
		m._key = key;
		find(key);
		if (m.inReplyTo) union(key, m.inReplyTo);
		for (const r of m.references) {
			if (r) union(key, r);
		}
	}
	// Subject-normalization fallback: messages whose Message-ID has no inbound reply
	// and which share a normalized subject get merged.
	const subjectBuckets = new Map();
	for (const m of allMessages) {
		const sn = normalizeSubject(m.subject);
		if (!sn || sn === '(no subject)') continue;
		const list = subjectBuckets.get(sn) ?? [];
		list.push(m);
		subjectBuckets.set(sn, list);
	}
	for (const [, msgs] of subjectBuckets) {
		if (msgs.length < 2) continue;
		const root = msgs[0]._key;
		for (let i = 1; i < msgs.length; i++) union(msgs[i]._key, root);
	}

	const groups = new Map();
	for (const m of allMessages) {
		const root = find(m._key);
		const list = groups.get(root) ?? [];
		list.push(m);
		groups.set(root, list);
	}

	let i = 0;
	const threads = [...groups.values()].map((msgs) => {
		msgs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
		const subject = msgs[0].subject;
		return {
			thread_id: `mbox-${i++}`,
			subject,
			messages: msgs.map((m) => ({ ...m, _key: undefined }))
		};
	});
	return threads;
}

// ---------- PII strip ----------
const PII_PATTERNS = [
	// Credit cards (16-digit, with separators) — must run before phone to avoid swallowing
	{ re: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[card]' },
	// Email
	{ re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[email]' },
	// Phone (North American-ish): optional +1, optional parens around 3 digits, separators
	{ re: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: '[phone]' },
	// Address heuristic: 2-5 digit number + Capitalized street name + suffix.
	// First-letter capital is REQUIRED (no `i` flag) so guest-count phrases like
	// "35 people in our Burrard St" don't match — only "35 Larch Street"-style
	// patterns where the word right after the number is genuinely capitalized.
	// Suffix accepts either case via explicit char-class.
	{ re: /\b\d{2,5}\s+[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Za-z0-9'.-]+)*\s+(?:[Ss]t|[Ss]treet|[Aa]ve|[Aa]venue|[Rr]d|[Rr]oad|[Bb]lvd|[Bb]oulevard|[Ww]ay|[Dd]r|[Dd]rive|[Ll]ane|[Ll]n|[Cc]ourt|[Cc]t|[Pp]lace|[Pp]l|[Cc]rescent|[Cc]res|[Hh]wy|[Hh]ighway)\b\.?/g, replacement: '[address]' }
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
	const a = (addr || '').toLowerCase();
	if (a.includes('events@sulaindianrestaurant.com') || a.includes('events.sula') || a.includes('sula events') || a.includes('info@sulaindianrestaurant.com')) {
		return 'sula';
	}
	return 'user';
}

function isAutoReply(thread) {
	const subj = thread.subject.toLowerCase();
	if (/out of office|automatic reply|auto-reply|undeliverable|delivery (status|failure)|mailer-daemon/.test(subj)) return true;
	if (thread.messages.length === 1) {
		const from = thread.messages[0].from;
		if (/noreply|no-reply|mailer-daemon|postmaster/i.test(from)) return true;
	}
	return false;
}

function isThanksOnly(thread) {
	if (thread.messages.length > 2) return false;
	const userMsgs = thread.messages.filter((m) => senderRole(m.from) === 'user');
	if (userMsgs.length === 0) return true;
	const longest = Math.max(...userMsgs.map((m) => m.body.length));
	return longest < MIN_BODY_CHARS;
}

function totalWords(thread) {
	return thread.messages.reduce((n, m) => n + (m.body.split(/\s+/).filter(Boolean).length), 0);
}

function hasSubstantiveQuestion(thread) {
	for (const m of thread.messages) {
		if (senderRole(m.from) !== 'user') continue;
		if (m.body.length < MIN_QUESTION_CHARS) continue;
		if (/\?/.test(m.body)) return true;
		if (/\$\s*\d/.test(m.body)) return true;
		if (/\b(guests?|head ?count|people|wedding|event|catering|menu|halal|vegan|jain|delivery|setup|deposit|tasting|cancel|cancellation)\b/i.test(m.body)) return true;
	}
	return false;
}

function shouldKeep(thread) {
	if (isAutoReply(thread)) return false;
	if (isThanksOnly(thread)) return false;
	if (totalWords(thread) < MIN_THREAD_WORDS) return false;
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
	return {
		topic,
		summary,
		key_exchange: { q: firstUser, a: firstSula }
	};
}

async function llmSummary(thread, anthropic) {
	const transcript = thread.messages
		.map((m) => `[${senderRole(m.from).toUpperCase()}] ${m.body.replace(/\s+/g, ' ').slice(0, 1500)}`)
		.join('\n\n');
	const prompt = `Read this email thread between a Sula Catering customer and the events team. Extract:
- TOPIC: a short tag-style phrase (e.g. "wedding-quote-250-aug" or "halal-sangeet" or "cancellation-flood")
- SUMMARY: one to two lines, what was asked and how Sula handled it
- KEY_EXCHANGE: the single most useful question→answer pair from the thread

Return ONLY a JSON object on one line, no preamble, no code fences, no extra prose:
{"topic":"...","summary":"...","key_exchange":{"q":"...","a":"..."}}

Each "q" and "a" string under 280 chars. PII has already been stripped from the thread.

Voice rules: no em dashes, no "solutions"/"experiences"/"elevate" in the summary, no marketing language.

Thread (subject: "${thread.subject}"):

${transcript}`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
	try {
		const resp = await anthropic.messages.create(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 800,
				messages: [{ role: 'user', content: prompt }]
			},
			{ signal: controller.signal, timeout: ANTHROPIC_TIMEOUT_MS }
		);
		const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
		// Extract first JSON object (defensive — strip any code fence remnants).
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error('no json in response');
		const parsed = JSON.parse(jsonMatch[0]);
		const ke = parsed.key_exchange || parsed.exchange || {};
		return {
			topic: String(parsed.topic || thread.subject),
			summary: String(parsed.summary || ''),
			key_exchange: { q: String(ke.q || ''), a: String(ke.a || '') }
		};
	} finally {
		clearTimeout(timer);
	}
}

// ---------- Main ----------
async function main() {
	console.log(`[ingest] reading ${inputPath}`);
	const stats = statSync(inputPath);
	const ext = extname(inputPath).toLowerCase();

	let threads;
	if (stats.isDirectory()) {
		threads = await parseMboxAny(inputPath);
	} else if (ext === '.mbox') {
		threads = await parseMboxAny(inputPath);
	} else if (ext === '.json') {
		threads = await parseJson(inputPath);
	} else {
		console.error(`[ingest] unknown input type: ${ext} (expected .mbox, .json, or directory)`);
		process.exit(2);
	}
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
				topic: summary.topic,
				summary: summary.summary,
				key_exchange: summary.key_exchange
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
		console.warn(`[ingest] RAG mode required — corpus exceeds prompt budget; switch to vector retrieval (Voyage AI embed + Cloudflare Vectorize index).`);
		console.warn(`[ingest] File still emitted; the consumer (api/neela.ts) can decide to skip the inline block.`);
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
// Approx tokens: ${approxTokens} (budget ${TOKEN_BUDGET})
// Over-budget: ${overBudget}
//
// Phase 2 status: NOT YET WIRED into Neela's system prompt. The corpus is
// generated and committed for inspection / future use. To enable, add an
// import + cache_control block in api/neela.ts (note: Anthropic max is 4
// breakpoints; one of the existing blocks would need to merge).
//
// Token-budget plan: when EMAIL_CORPUS_OVER_BUDGET = true, switch to a
// vector-retrieval path (Voyage AI embed + Cloudflare Vectorize index).

export interface EmailKeyExchange {
\tq: string;
\ta: string;
}

export interface EmailCorpusEntry {
\tthread_id: string;
\tsubject: string;
\ttopic: string;
\tsummary: string;
\tkey_exchange: EmailKeyExchange;
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
