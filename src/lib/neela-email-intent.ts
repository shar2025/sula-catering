/**
 * Intent classifier for inbound Gmail threads.
 *
 * Returns a coarse intent (new-inquiry, order-change, question, complaint,
 * spam, auto-reply, unsubscribe) plus, for order-change, the proposed delta
 * in natural language (eg. "guest count 15 -> 20").
 *
 * Uses Claude Haiku 4.5 for low-latency cheap classification (the push handler
 * has a 10s soft budget). Falls back to a heuristic classifier if Anthropic is
 * unreachable so the handler never crashes silently.
 */

import Anthropic from '@anthropic-ai/sdk';

export type EmailIntent = 'new-inquiry' | 'order-change' | 'question' | 'complaint' | 'spam' | 'auto-reply' | 'unsubscribe';

export interface IntentInput {
	subject: string;
	from: string;
	body: string;
	inReplyTo?: string | null;
	knownReference?: string | null; // existing SC-XXXX-XXXX if matched
	threadHistorySummary?: string | null;
}

export interface IntentResult {
	intent: EmailIntent;
	confidence: 'high' | 'medium' | 'low';
	orderChangeDelta?: string;
	rationale?: string;
	heuristic?: boolean; // true when we fell back to the heuristic path
}

const CLASSIFIER_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You are an email intent classifier for Sula Catering's events team. You read an inbound customer email and assign it ONE of these intents:

- new-inquiry      first contact, asking about catering or wanting a quote
- order-change     existing customer modifying a confirmed/pending order (guest count, date, dietary, menu, address, cancellation)
- question         specific question about an existing order, policy, menu, or logistics; not a change request
- complaint        customer is unhappy (food, service, billing, miscommunication). Always escalate to a human.
- spam             unsolicited marketing, sales pitch, vendor outreach unrelated to a customer order
- auto-reply       out-of-office, vacation responder, calendar invite ack, mailer-daemon
- unsubscribe      customer asking to be removed from a list

For order-change, also extract the proposed delta in plain English (eg. "guest count 15 -> 20", "date moved from May 15 to May 22 2026", "add gluten-free flag for 1 guest", "cancel entirely").

Respond ONLY with a JSON object, no prose:
{
  "intent": "...",
  "confidence": "high" | "medium" | "low",
  "orderChangeDelta": "string, omit if not order-change",
  "rationale": "one short sentence"
}`;

function buildUserPrompt(input: IntentInput): string {
	const parts: string[] = [];
	parts.push(`Subject: ${input.subject || '(no subject)'}`);
	parts.push(`From: ${input.from}`);
	if (input.inReplyTo) parts.push(`In-Reply-To: ${input.inReplyTo}`);
	if (input.knownReference) parts.push(`Matches existing customer reference: ${input.knownReference}`);
	if (input.threadHistorySummary) parts.push(`Thread history: ${input.threadHistorySummary}`);
	parts.push('');
	parts.push('Body:');
	parts.push(input.body.slice(0, 6000));
	return parts.join('\n');
}

function tryParseJson(text: string): unknown {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[0]);
	} catch {
		return null;
	}
}

const VALID_INTENTS: EmailIntent[] = [
	'new-inquiry',
	'order-change',
	'question',
	'complaint',
	'spam',
	'auto-reply',
	'unsubscribe'
];

function isValidIntent(s: unknown): s is EmailIntent {
	return typeof s === 'string' && (VALID_INTENTS as string[]).includes(s);
}

function isValidConfidence(s: unknown): s is 'high' | 'medium' | 'low' {
	return s === 'high' || s === 'medium' || s === 'low';
}

export function heuristicClassify(input: IntentInput): IntentResult {
	const subj = (input.subject || '').toLowerCase();
	const body = (input.body || '').toLowerCase();
	const from = (input.from || '').toLowerCase();

	if (
		from.includes('mailer-daemon') ||
		from.includes('postmaster@') ||
		from.includes('noreply') ||
		from.includes('no-reply') ||
		subj.startsWith('out of office') ||
		subj.includes('automatic reply') ||
		subj.includes('auto-reply') ||
		body.includes('this is an automatic reply') ||
		body.includes('i am out of the office')
	) {
		return { intent: 'auto-reply', confidence: 'high', heuristic: true };
	}
	if (subj.includes('unsubscribe') || body.includes('please unsubscribe') || body.includes('remove me from')) {
		return { intent: 'unsubscribe', confidence: 'high', heuristic: true };
	}
	if (
		body.includes('disappointed') ||
		body.includes('unacceptable') ||
		body.includes('refund') ||
		body.includes('terrible') ||
		body.includes('horrible') ||
		body.includes('complaint') ||
		body.includes('demand a refund')
	) {
		return { intent: 'complaint', confidence: 'medium', heuristic: true };
	}
	if (
		input.knownReference &&
		(body.includes('change') || body.includes('update') || body.includes('cancel') || body.includes('move') || body.includes('postpone') || body.includes('add') || body.includes('reduce') || body.includes('increase'))
	) {
		return {
			intent: 'order-change',
			confidence: 'low',
			orderChangeDelta: 'change requested (heuristic, see body)',
			heuristic: true
		};
	}
	if (input.knownReference) {
		return { intent: 'question', confidence: 'low', heuristic: true };
	}
	return { intent: 'new-inquiry', confidence: 'low', heuristic: true };
}

export async function classifyEmail(input: IntentInput): Promise<IntentResult> {
	const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Neela;
	if (!apiKey) {
		console.warn('[neela-email-intent] no ANTHROPIC_API_KEY, using heuristic');
		return heuristicClassify(input);
	}

	const client = new Anthropic({ apiKey, maxRetries: 0 });
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), CLASSIFIER_TIMEOUT_MS);
	try {
		const response = await client.messages.create(
			{
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 256,
				system: SYSTEM_PROMPT,
				messages: [{ role: 'user', content: buildUserPrompt(input) }]
			},
			{ signal: abort.signal, timeout: CLASSIFIER_TIMEOUT_MS }
		);
		const text = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n');
		const parsed = tryParseJson(text);
		if (
			parsed &&
			typeof parsed === 'object' &&
			isValidIntent((parsed as { intent: unknown }).intent) &&
			isValidConfidence((parsed as { confidence: unknown }).confidence)
		) {
			const obj = parsed as {
				intent: EmailIntent;
				confidence: 'high' | 'medium' | 'low';
				orderChangeDelta?: unknown;
				rationale?: unknown;
			};
			return {
				intent: obj.intent,
				confidence: obj.confidence,
				orderChangeDelta: typeof obj.orderChangeDelta === 'string' ? obj.orderChangeDelta : undefined,
				rationale: typeof obj.rationale === 'string' ? obj.rationale : undefined
			};
		}
		console.warn('[neela-email-intent] classifier returned unparseable response, using heuristic');
		return heuristicClassify(input);
	} catch (err) {
		console.warn('[neela-email-intent] classifier failed, using heuristic', err instanceof Error ? err.message : err);
		return heuristicClassify(input);
	} finally {
		clearTimeout(timer);
	}
}
