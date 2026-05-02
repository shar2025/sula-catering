/**
 * /api/neela/submit-order, captures a customer-confirmed order from the chat,
 * persists to Postgres (neela_orders), and emails the events team.
 *
 * Required env (silent skip if missing):
 *   POSTGRES_URL         , Vercel Postgres / Neon (table auto-creates)
 *   RESEND_API_KEY       , Resend; without it order still persists, email skipped
 *
 * Returns:
 *   { ok: true, reference: "SC-0502-A7K2", emailed: true|false, emailError?: "...", message: "..." }
 *
 * Email diagnostics: the Resend SDK does NOT throw on rejected sends, it
 * returns { data: null, error: ResendError }. We surface that error string
 * back through the handler response as `emailError` so a silent rejection
 * (invalid api key, unverified sender, etc.) does not produce a misleading
 * `emailed: true`. If you ever see emailed stay false in production, the most
 * common causes are:
 *   1. RESEND_API_KEY env var unset, rotated, or pointing at a different
 *      Resend account than the one whose dashboard you are checking,
 *   2. NEELA_FROM_EMAIL set to a sender outside sulacatering.com,
 *   3. sulacatering.com DNS regressed and the domain is no longer Verified.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildInvoicePdf, type InvoiceOrder, type Audience } from '../../src/lib/pdf/InvoicePdf.js';
import { loadLogo, loadCormorant } from '../../src/lib/pdf/styles.js';
import { buildPdfFilename } from '../../src/lib/pdf/filename.js';
import { calculatePortions, type MenuItem } from '../../src/lib/portioning.js';

export const config = { maxDuration: 30 };

// Recipient + sender resolution.
//   NEELA_TEST_EMAIL → routes ALL notifications there for testing (subject is
//                      NOT decorated; the redirect itself is the test signal)
//   NEELA_FROM_EMAIL → override sender; defaults to neela@sulacatering.com (verified)
const EMAIL_TO_PROD = 'mail.sharathvittal@gmail.com';
const FROM_TEAM = 'Neela <neela@sulacatering.com>';
const FROM_CUSTOMER = 'Sula Catering <neela@sulacatering.com>';
function recipient(): string {
	return process.env.NEELA_TEST_EMAIL || EMAIL_TO_PROD;
}
function emailFrom(): string {
	return process.env.NEELA_FROM_EMAIL || FROM_TEAM;
}
function isTestMode(): boolean {
	return !!process.env.NEELA_TEST_EMAIL;
}
const REFERENCE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // I, O, 0, 1 excluded for readability

type EventType = 'wedding' | 'corporate' | 'private' | 'cafe-chai' | 'other';
type ServiceType = 'drop-off' | 'full-service' | 'live-station' | 'in-restaurant';
// Mirrors the 3 paths on sulaindianrestaurant.com/sula-catering-order/:
//   'full'         = "I'm Ready" full quote request
//   'quick'        = "Still Deciding" lightweight inquiry
//   'consultation' = "Want Help" Calendly-call routing (no confirm card)
type Mode = 'full' | 'quick' | 'consultation';

interface Dietary {
	vegetarianPct?: number;
	hasJain?: boolean;
	hasVegan?: boolean;
	hasGlutenFree?: boolean;
	hasNutAllergy?: boolean;
	hasShellfishAllergy?: boolean;
	hasDairyFree?: boolean;
	// Note: halal is intentionally NOT a field. Sula's kitchen has been
	// halal-certified by default since 2010, so every meat dish IS halal.
	// Asking the customer is redundant and could feel intrusive; the events
	// team confirms warmly only if asked.
	notes?: string;
}
interface Contact {
	name: string;
	email: string;
	phone?: string;
}
interface QuoteLineItem {
	label: string;
	amount: number;
}
interface Quote {
	line_items: QuoteLineItem[];
	subtotal?: number;
	tax_label?: string;
	tax_amount?: number;
	total?: number;
	currency?: string;
	disclaimer?: string;
}
// Setup type aligns with the Catering Inquiry form (Form 27): aluminium trays
// (free), reusable plastic bowls, non-heated bowl setup, heated stainless,
// premium hammered copper. Free-text fallback if Neela captures a phrasing
// that doesn't snap cleanly to one of these.
type SetupType =
	| 'aluminium_trays'
	| 'reusable_plastic_bowls'
	| 'non_heated_bowl_setup'
	| 'heated_stainless'
	| 'hammered_copper'
	| string;
type RequirementChoice = 'required' | 'not_required';

// One curry / appetizer slot on the customer's chosen tier. `kind` decides which
// row label the PDF prints (Veg Curry #N, Non-Veg Curry #N, Vegan Curry #N,
// Appetizer). `name` is the dish name as the customer picked it, OR the literal
// string "Chef's choice" when they deferred to the kitchen. `diet` is the
// optional dietary badge ("Gluten Free", "Dairy & Gluten Free") drawn from the
// verified Form 27 dish list, rendered in muted gray after the dish name.
type MenuKind = 'veg' | 'vegan' | 'nonveg' | 'appetizer';
const VALID_MENU_KINDS: MenuKind[] = ['veg', 'vegan', 'nonveg', 'appetizer'];
interface MenuLineInput {
	kind: MenuKind;
	name: string;
	diet?: string;
}

interface Order {
	mode: Mode;
	eventType?: EventType;
	eventDate?: string;
	guestCount?: number | string; // number for 'full', string range allowed for 'quick'
	serviceType?: ServiceType;
	location?: { city?: string; venueOrAddress?: string };
	deliveryAddress?: string; // full street address; primary location field for delivery jobs
	deliveryTime?: string;    // e.g. "12:00 PM", "evening reception ~6 PM"
	timeWindow?: string;      // legacy field, kept for back-compat with older order JSONs
	dietary?: Dietary;
	menuTier?: string;
	addOns?: string[];
	menuItems?: MenuLineInput[];   // structured curry / appetizer / vegan / non-veg picks (drives PDF Page 1 dish rows)
	additionalMenuItems?: string;  // free-text extras beyond the tier slots ("plus an extra naan, mango chutney")
	setupStyle?: string;      // legacy free-text version of setupType
	setupType?: SetupType;
	rentalsRequired?: boolean;
	platesAndCutlery?: RequirementChoice;
	servingSpoons?: RequirementChoice;
	customMenuDetails?: string; // free-text capture of dish requests + style preference
	contact: Contact;
	notes?: string;
	quote?: Quote;
	transcriptSnippet?: string;
}
interface SubmitBody {
	sessionId?: string;
	order?: Partial<Order>;
}

const VALID_EVENT_TYPES: EventType[] = ['wedding', 'corporate', 'private', 'cafe-chai', 'other'];
const VALID_SERVICE_TYPES: ServiceType[] = ['drop-off', 'full-service', 'live-station', 'in-restaurant'];
const VALID_MODES: Mode[] = ['full', 'quick', 'consultation'];

function isValidEmail(s: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function getClientIp(req: VercelRequest): string {
	const fwd = req.headers['x-forwarded-for'];
	const fwdStr = Array.isArray(fwd) ? fwd[0] : fwd || '';
	const first = fwdStr.split(',')[0].trim();
	if (first) return first;
	const real = req.headers['x-real-ip'];
	const realStr = Array.isArray(real) ? real[0] : real || '';
	return realStr || 'unknown';
}
function hashIp(ip: string): string {
	return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}
function makeReference(): string {
	const d = new Date();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	let suffix = '';
	for (let i = 0; i < 4; i++) {
		suffix += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
	}
	return `SC-${mm}${dd}-${suffix}`;
}

function validate(body: SubmitBody): { ok: true; sessionId: string; order: Order } | { ok: false; error: string } {
	if (!body || typeof body !== 'object') return { ok: false, error: 'invalid body' };
	const sessionId = String(body.sessionId || '').trim();
	if (!sessionId) return { ok: false, error: 'sessionId required' };
	const o = (body.order || {}) as Partial<Order>;

	// Mode (defaults to 'full' for backwards compatibility with the original endpoint).
	const mode: Mode = VALID_MODES.includes(o.mode as Mode) ? (o.mode as Mode) : 'full';

	// Contact is required in all modes.
	const c = (o.contact || {}) as Partial<Contact>;
	const name = String(c.name || '').trim();
	const email = String(c.email || '').trim();
	if (!name) return { ok: false, error: 'order.contact.name required' };
	if (!email || !isValidEmail(email)) return { ok: false, error: 'order.contact.email required (valid email)' };

	// eventType, required for full + quick, optional for consultation.
	if (mode !== 'consultation') {
		if (!o.eventType || !VALID_EVENT_TYPES.includes(o.eventType as EventType)) {
			return { ok: false, error: 'order.eventType required (one of: ' + VALID_EVENT_TYPES.join(', ') + ')' };
		}
	} else if (o.eventType && !VALID_EVENT_TYPES.includes(o.eventType as EventType)) {
		return { ok: false, error: 'order.eventType invalid (one of: ' + VALID_EVENT_TYPES.join(', ') + ')' };
	}

	// guestCount, required for full (number), required for quick (number or "rough range" string),
	// optional for consultation.
	let guestCountValue: number | string | undefined;
	if (mode === 'full') {
		const n = Number(o.guestCount);
		if (!Number.isFinite(n) || n < 1) {
			return { ok: false, error: 'order.guestCount required (positive integer for full mode)' };
		}
		guestCountValue = Math.floor(n);
	} else if (mode === 'quick') {
		if (typeof o.guestCount === 'number' && Number.isFinite(o.guestCount) && o.guestCount >= 1) {
			guestCountValue = Math.floor(o.guestCount);
		} else if (typeof o.guestCount === 'string' && o.guestCount.trim().length > 0) {
			guestCountValue = o.guestCount.trim().slice(0, 80);
		} else {
			return { ok: false, error: 'order.guestCount required for quick mode (number or rough range like "around 50")' };
		}
	} else if (o.guestCount !== undefined) {
		// consultation: optional, accept whatever shape
		guestCountValue = typeof o.guestCount === 'number' ? Math.floor(o.guestCount) : String(o.guestCount).slice(0, 80);
	}

	// eventDate, required for full + quick, optional for consultation.
	const eventDate = String(o.eventDate || '').trim().slice(0, 200);
	if (mode !== 'consultation' && !eventDate) {
		return { ok: false, error: 'order.eventDate required (specific date or month for ' + mode + ' mode)' };
	}

	if (o.serviceType && !VALID_SERVICE_TYPES.includes(o.serviceType as ServiceType)) {
		return { ok: false, error: 'order.serviceType must be one of: ' + VALID_SERVICE_TYPES.join(', ') };
	}
	const oo = o as Partial<Order>;
	const order: Order = {
		mode,
		eventType: o.eventType as EventType | undefined,
		eventDate: eventDate || undefined,
		guestCount: guestCountValue,
		serviceType: o.serviceType as ServiceType | undefined,
		location: o.location && typeof o.location === 'object' ? {
			city: o.location.city ? String(o.location.city).slice(0, 200) : undefined,
			venueOrAddress: o.location.venueOrAddress ? String(o.location.venueOrAddress).slice(0, 400) : undefined
		} : undefined,
		deliveryAddress: oo.deliveryAddress ? String(oo.deliveryAddress).slice(0, 400) : undefined,
		deliveryTime: oo.deliveryTime ? String(oo.deliveryTime).slice(0, 80) : undefined,
		timeWindow: o.timeWindow ? String(o.timeWindow).slice(0, 200) : undefined,
		dietary: o.dietary && typeof o.dietary === 'object' ? {
			vegetarianPct: typeof o.dietary.vegetarianPct === 'number' ? o.dietary.vegetarianPct : undefined,
			hasJain: typeof o.dietary.hasJain === 'boolean' ? o.dietary.hasJain : undefined,
			hasVegan: typeof o.dietary.hasVegan === 'boolean' ? o.dietary.hasVegan : undefined,
			hasGlutenFree: typeof o.dietary.hasGlutenFree === 'boolean' ? o.dietary.hasGlutenFree : undefined,
			hasNutAllergy: typeof o.dietary.hasNutAllergy === 'boolean' ? o.dietary.hasNutAllergy : undefined,
			hasShellfishAllergy: typeof o.dietary.hasShellfishAllergy === 'boolean' ? o.dietary.hasShellfishAllergy : undefined,
			hasDairyFree: typeof o.dietary.hasDairyFree === 'boolean' ? o.dietary.hasDairyFree : undefined,
			// halal field is silently ignored if sent, kitchen is halal by default
			notes: o.dietary.notes ? String(o.dietary.notes).slice(0, 800) : undefined
		} : undefined,
		menuTier: o.menuTier ? String(o.menuTier).slice(0, 200) : undefined,
		addOns: Array.isArray(o.addOns) ? o.addOns.map((s) => String(s).slice(0, 200)).slice(0, 30) : undefined,
		menuItems: cleanMenuItems(oo.menuItems),
		additionalMenuItems: oo.additionalMenuItems ? String(oo.additionalMenuItems).slice(0, 600) : undefined,
		setupStyle: o.setupStyle ? String(o.setupStyle).slice(0, 200) : undefined,
		setupType: oo.setupType ? String(oo.setupType).slice(0, 60) : undefined,
		rentalsRequired: typeof oo.rentalsRequired === 'boolean' ? oo.rentalsRequired : undefined,
		platesAndCutlery: oo.platesAndCutlery === 'required' || oo.platesAndCutlery === 'not_required' ? oo.platesAndCutlery : undefined,
		servingSpoons: oo.servingSpoons === 'required' || oo.servingSpoons === 'not_required' ? oo.servingSpoons : undefined,
		customMenuDetails: oo.customMenuDetails ? String(oo.customMenuDetails).slice(0, 2000) : undefined,
		contact: {
			name: name.slice(0, 200),
			email: email.slice(0, 200),
			phone: c.phone ? String(c.phone).slice(0, 80) : undefined
		},
		notes: o.notes ? String(o.notes).slice(0, 4000) : undefined,
		quote: cleanQuote(o.quote),
		transcriptSnippet: o.transcriptSnippet ? String(o.transcriptSnippet).slice(0, 16000) : undefined
	};
	return { ok: true, sessionId, order };
}

// Validate + normalize the menuItems array. Drops entries with missing kind /
// name; clamps every string field; caps the total at 12 items so a malformed
// payload can't bloat the JSON column. Each entry's name preserves "Chef's
// choice" verbatim (used as a placeholder when the customer defers).
function cleanMenuItems(raw: unknown): MenuLineInput[] | undefined {
	if (!Array.isArray(raw) || raw.length === 0) return undefined;
	const out: MenuLineInput[] = [];
	for (const item of raw.slice(0, 12)) {
		if (!item || typeof item !== 'object') continue;
		const r = item as Partial<MenuLineInput>;
		const kind = String(r.kind || '').trim().toLowerCase() as MenuKind;
		if (!VALID_MENU_KINDS.includes(kind)) continue;
		const name = String(r.name || '').trim().slice(0, 120);
		if (!name) continue;
		const diet = r.diet ? String(r.diet).trim().slice(0, 60) : undefined;
		out.push(diet ? { kind, name, diet } : { kind, name });
	}
	return out.length > 0 ? out : undefined;
}

function cleanQuote(q: unknown): Quote | undefined {
	if (!q || typeof q !== 'object') return undefined;
	const raw = q as Partial<Quote>;
	if (!Array.isArray(raw.line_items) || raw.line_items.length === 0) return undefined;
	const items: QuoteLineItem[] = [];
	for (const li of raw.line_items.slice(0, 30)) {
		if (!li || typeof li !== 'object') continue;
		const label = String((li as QuoteLineItem).label || '').slice(0, 200).trim();
		const amount = Number((li as QuoteLineItem).amount);
		if (!label || !Number.isFinite(amount)) continue;
		items.push({ label, amount: Math.round(amount * 100) / 100 });
	}
	if (items.length === 0) return undefined;
	const num = (n: unknown): number | undefined => {
		const v = Number(n);
		return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
	};
	return {
		line_items: items,
		subtotal: num(raw.subtotal),
		tax_label: raw.tax_label ? String(raw.tax_label).slice(0, 80) : 'GST 5%',
		tax_amount: num(raw.tax_amount),
		total: num(raw.total),
		currency: raw.currency ? String(raw.currency).slice(0, 8) : 'CAD',
		disclaimer: raw.disclaimer
			? String(raw.disclaimer).slice(0, 600)
			: 'Preliminary estimate. Final quote in writing from the events team.'
	};
}

let tableEnsured = false;
async function persistOrder(args: {
	reference: string;
	sessionId: string;
	ipHash: string;
	order: Order;
}): Promise<void> {
	const url = process.env.POSTGRES_URL;
	if (!url) {
		console.warn('[neela-order] no POSTGRES_URL, persisting skipped');
		return;
	}
	const sql = neon(url);
	if (!tableEnsured) {
		await sql`
			CREATE TABLE IF NOT EXISTS neela_orders (
				id BIGSERIAL PRIMARY KEY,
				reference TEXT UNIQUE NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				session_id TEXT NOT NULL,
				ip_hash TEXT,
				order_json JSONB NOT NULL,
				status TEXT DEFAULT 'new',
				emailed_at TIMESTAMPTZ,
				mode TEXT NOT NULL DEFAULT 'full'
			)
		`;
		// Idempotent migration for tables created before the mode column existed.
		await sql`ALTER TABLE neela_orders ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full'`;
		await sql`CREATE INDEX IF NOT EXISTS neela_orders_created_at_idx ON neela_orders (created_at DESC)`;
		await sql`CREATE INDEX IF NOT EXISTS neela_orders_reference_idx ON neela_orders (reference)`;
		tableEnsured = true;
	}
	await sql`
		INSERT INTO neela_orders (reference, session_id, ip_hash, order_json, mode)
		VALUES (${args.reference}, ${args.sessionId}, ${args.ipHash}, ${JSON.stringify(args.order)}, ${args.order.mode})
	`;
}

async function markEmailed(reference: string): Promise<void> {
	const url = process.env.POSTGRES_URL;
	if (!url) return;
	try {
		const sql = neon(url);
		await sql`UPDATE neela_orders SET emailed_at = NOW() WHERE reference = ${reference}`;
	} catch (err) {
		console.warn('[neela-order] markEmailed failed', err instanceof Error ? err.message : err);
	}
}

function formatSetupType(s: string): string {
	const map: Record<string, string> = {
		aluminium_trays: 'Aluminium catering trays (free)',
		reusable_plastic_bowls: 'Reusable plastic bowls',
		non_heated_bowl_setup: 'Non-heated bowl setup',
		heated_stainless: 'Heated stainless steel chafing dishes',
		hammered_copper: 'Premium hammered copper'
	};
	return map[s] || s;
}

function escapeHtml(s: string): string {
	return String(s).replace(/[&<>"']/g, (c) => {
		const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
		return m[c] ?? c;
	});
}

function dietaryLines(d?: Dietary): string[] {
	if (!d) return [];
	const lines: string[] = [];
	if (typeof d.vegetarianPct === 'number') lines.push(`Vegetarian mix: ~${d.vegetarianPct}%`);
	if (d.hasJain) lines.push('Jain prep needed');
	if (d.hasVegan) lines.push('Vegan options needed');
	if (d.hasGlutenFree) lines.push('⚠ Gluten-free options needed');
	if (d.hasDairyFree) lines.push('⚠ Dairy-free options needed');
	if (d.hasNutAllergy) lines.push('⚠ Nut allergy flagged');
	if (d.hasShellfishAllergy) lines.push('⚠ Shellfish allergy flagged');
	if (d.notes) lines.push(`Notes: ${d.notes}`);
	return lines;
}

function row(label: string, value: string | undefined): string {
	if (!value) return '';
	return `<tr><td style="padding:6px 14px 6px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666;letter-spacing:0.4px;text-transform:uppercase;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55">${escapeHtml(value)}</td></tr>`;
}

function fmtMoney(n: number | undefined): string {
	if (n === undefined || !Number.isFinite(n)) return '';
	return '$' + n.toFixed(2);
}

function buildQuoteHtml(q?: Quote): string {
	if (!q || !q.line_items || q.line_items.length === 0) return '';
	const items = q.line_items
		.map(
			(li) =>
				`<tr><td style="padding:5px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1a1a1a;border-bottom:1px dotted rgba(184,149,106,0.35)">${escapeHtml(li.label)}</td><td style="padding:5px 0;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1a1a1a;font-variant-numeric:tabular-nums;border-bottom:1px dotted rgba(184,149,106,0.35);white-space:nowrap">${escapeHtml(fmtMoney(li.amount))}</td></tr>`
		)
		.join('');
	const sumRow = (label: string, amount: number | undefined, opts: { strong?: boolean; gold?: boolean; topBorder?: boolean } = {}): string => {
		if (amount === undefined) return '';
		const weight = opts.strong ? '700' : '500';
		const color = opts.gold ? '#b8956a' : '#1a1a1a';
		const fontSize = opts.strong ? '15px' : '13px';
		const border = opts.topBorder ? 'border-top:1px solid rgba(184,149,106,0.4);padding-top:8px' : '';
		return `<tr><td style="padding:6px 0;${border};font-family:'Helvetica Neue',Arial,sans-serif;font-size:${fontSize};color:${color};font-weight:${weight};letter-spacing:0.2px">${escapeHtml(label)}</td><td style="padding:6px 0;${border};text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-size:${fontSize};color:${color};font-weight:${weight};font-variant-numeric:tabular-nums;white-space:nowrap">${escapeHtml(fmtMoney(amount))}</td></tr>`;
	};
	return `
				<h2 style="margin:18px 0 10px;font-family:'Cormorant Garamond',Georgia,serif;color:#b8956a;font-size:20px;letter-spacing:0.4px;font-weight:600"><em>Preliminary estimate</em></h2>
				<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:8px">
					${items}
					${sumRow('Subtotal', q.subtotal)}
					${sumRow(q.tax_label || 'Tax', q.tax_amount)}
					${sumRow('Total', q.total, { strong: true, gold: true, topBorder: true })}
				</table>
				${q.disclaimer ? `<p style="margin:6px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:12px;color:#888;line-height:1.5">${escapeHtml(q.disclaimer)}</p>` : ''}`;
}

function modeEyebrow(mode: Mode): string {
	if (mode === 'quick') return 'Neela &middot; new inquiry (still deciding)';
	if (mode === 'consultation') return 'Neela &middot; wants a Calendly call';
	return 'Neela &middot; new order captured';
}

function isBuyoutOrder(order: Order): boolean {
	// Heuristic: customer notes mention restaurant / buyout / in-restaurant /
	// at-Sula language, OR location.venueOrAddress matches one of the three
	// Sula addresses, OR the notes literally contain "buyout".
	const hay = (
		(order.notes || '') + ' ' +
		(order.location?.venueOrAddress || '') + ' ' +
		(order.dietary?.notes || '')
	).toLowerCase();
	if (/\bbuyout\b/.test(hay)) return true;
	if (/\b(at|host(?:ing)? at|at the) sula\b/.test(hay)) return true;
	if (/in[- ]restaurant/.test(hay)) return true;
	if (/(commercial drive|main street|davie street).*sula|sula.*(commercial drive|main street|davie street)/.test(hay)) return true;
	return false;
}

function modeSubject(reference: string, order: Order): string {
	const guestStr = order.guestCount === undefined ? 'TBD' : String(order.guestCount);
	const dateStr = order.eventDate || 'TBD';
	const typeStr = order.eventType || 'event';
	if (order.mode === 'quick') {
		return `[Neela inquiry ${reference}] Looking at ${typeStr} for ${guestStr} around ${dateStr}`;
	}
	if (order.mode === 'consultation') {
		return `[Neela call request ${reference}] ${order.contact.name} wants a Calendly chat`;
	}
	if (isBuyoutOrder(order)) {
		const loc = order.location?.venueOrAddress || order.location?.city || 'Sula';
		return `[Neela buyout ${reference}] ${loc} for ${guestStr} on ${dateStr}`;
	}
	return `[Neela order ${reference}] ${typeStr} for ${guestStr} on ${dateStr}`;
}

function modeReplyMessage(reference: string, mode: Mode): string {
	if (mode === 'quick') {
		return `Sent over for menu ideas. Events team will be back with options within a business day. Reference ${reference} in case you want to follow up.`;
	}
	if (mode === 'consultation') {
		return `Reference ${reference} noted, the events team has your details. Easiest next step: book a 30-min call at calendly.com/sula-catering/30min.`;
	}
	return `Got it! Sent over to the events team. They'll be in touch within a business day. Reference ${reference} in case you want to follow up.`;
}

function buildOrderEmailHtml(reference: string, order: Order): string {
	const dateLabel = new Date().toLocaleDateString('en-CA', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'America/Vancouver'
	});
	// Prefer deliveryAddress (the new full-street-address field) over the legacy
	// location.venueOrAddress / .city pair when present. Falls back gracefully so
	// older order JSONs still render.
	const locStr =
		order.deliveryAddress
			? order.deliveryAddress
			: order.location?.venueOrAddress && order.location?.city
				? `${order.location.venueOrAddress}, ${order.location.city}`
				: order.location?.venueOrAddress || order.location?.city || undefined;
	const setupLabel = order.setupType ? formatSetupType(order.setupType) : order.setupStyle || undefined;
	const deliveryTimeLabel = order.deliveryTime || order.timeWindow || undefined;
	const rentalsLabel = order.rentalsRequired === true ? 'Required' : order.rentalsRequired === false ? 'Not required' : undefined;
	const platesLabel = order.platesAndCutlery === 'required' ? 'Required' : order.platesAndCutlery === 'not_required' ? 'Not required' : undefined;
	const servingSpoonsLabel = order.servingSpoons === 'required' ? 'Required' : order.servingSpoons === 'not_required' ? 'Not required' : undefined;
	const dietary = dietaryLines(order.dietary);
	const dietaryHtml = dietary.length
		? `<ul style="margin:4px 0 0 18px;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${dietary.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
		: '<em style="color:#999">No dietary notes captured</em>';
	const addOnsHtml = order.addOns && order.addOns.length
		? order.addOns.map((a) => escapeHtml(a)).join(', ')
		: undefined;
	const transcriptHtml = order.transcriptSnippet
		? `<pre style="margin:0;padding:14px;background:#fbf6ec;border-left:3px solid #b8956a;font-family:'Helvetica Neue',Arial,monospace;font-size:12px;color:#444;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;border-radius:3px">${escapeHtml(order.transcriptSnippet)}</pre>`
		: '<em style="color:#999">No transcript captured</em>';

	return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5ede0;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede0">
	<tr><td align="center" style="padding:32px 16px">
		<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid rgba(184,149,106,0.25);max-width:640px">
			<tr><td style="padding:28px 32px 22px;border-bottom:1px solid rgba(184,149,106,0.25);background:linear-gradient(180deg,#0a1628 0%,#142442 100%)">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#b8956a">${modeEyebrow(order.mode)}</p>
				<h1 style="margin:8px 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:600;color:#f5ede0;letter-spacing:0.5px">${escapeHtml(reference)}</h1>
				<p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(245,237,224,0.78);letter-spacing:0.3px">${escapeHtml(dateLabel)}</p>
			</td></tr>

			<tr><td style="padding:24px 32px 8px">
				<h2 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;color:#b8956a;font-size:20px;letter-spacing:0.4px;font-weight:600">At a glance</h2>
				<table cellpadding="0" cellspacing="0" style="width:100%">
					${row('Event type', order.eventType)}
					${row('Event date', order.eventDate)}
					${row('Delivery time', deliveryTimeLabel)}
					${row('Guest count', String(order.guestCount))}
					${row('Service', order.serviceType)}
					${row('Delivery address', locStr)}
					${row('Contact', order.contact.name)}
					${row('Email', order.contact.email)}
					${row('Phone', order.contact.phone)}
				</table>
			</td></tr>

			<tr><td style="padding:18px 32px 8px">
				<h2 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;color:#b8956a;font-size:20px;letter-spacing:0.4px;font-weight:600">Order details</h2>
				<table cellpadding="0" cellspacing="0" style="width:100%">
					${row('Menu tier', order.menuTier)}
					${row('Add-ons', addOnsHtml)}
					${row('Setup', setupLabel)}
					${row('Rentals', rentalsLabel)}
					${row('Plates + cutlery', platesLabel)}
					${row('Serving spoons', servingSpoonsLabel)}
				</table>
				<div style="margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666;letter-spacing:0.4px;text-transform:uppercase">Dietary</div>
				<div style="margin:6px 0 0">${dietaryHtml}</div>
				${order.customMenuDetails ? `<div style="margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666;letter-spacing:0.4px;text-transform:uppercase">Custom menu details</div><p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${escapeHtml(order.customMenuDetails)}</p>` : ''}
				${order.notes ? `<div style="margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666;letter-spacing:0.4px;text-transform:uppercase">Customer notes</div><p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${escapeHtml(order.notes)}</p>` : ''}
			</td></tr>

			${order.quote && order.quote.line_items && order.quote.line_items.length ? `<tr><td style="padding:18px 32px 8px">${buildQuoteHtml(order.quote)}</td></tr>` : ''}

			<tr><td style="padding:18px 32px 24px">
				<h2 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;color:#b8956a;font-size:20px;letter-spacing:0.4px;font-weight:600">Conversation snippet</h2>
				${transcriptHtml}
			</td></tr>

			<tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(184,149,106,0.2);background:#fbf6ec">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#666;letter-spacing:0.3px">Reply to this email and the message goes straight to ${escapeHtml(order.contact.name)} at ${escapeHtml(order.contact.email)}. Reference <strong>${escapeHtml(reference)}</strong> when following up.</p>
			</td></tr>
		</table>
	</td></tr>
</table>
</body></html>`;
}

function buildOrderEmailText(reference: string, order: Order): string {
	const lines: string[] = [];
	lines.push(`Reference: ${reference}`);
	lines.push(`Mode: ${order.mode}`);
	if (order.eventType) lines.push(`Event type: ${order.eventType}`);
	if (order.eventDate) lines.push(`Event date: ${order.eventDate}`);
	if (order.deliveryTime || order.timeWindow) lines.push(`Delivery time: ${order.deliveryTime || order.timeWindow}`);
	if (order.guestCount !== undefined) lines.push(`Guest count: ${order.guestCount}`);
	if (order.serviceType) lines.push(`Service: ${order.serviceType}`);
	const addr = order.deliveryAddress || [order.location?.venueOrAddress, order.location?.city].filter(Boolean).join(', ');
	if (addr) lines.push(`Delivery address: ${addr}`);
	lines.push(`Contact: ${order.contact.name} <${order.contact.email}>${order.contact.phone ? ' / ' + order.contact.phone : ''}`);
	if (order.menuTier) lines.push(`Menu tier: ${order.menuTier}`);
	if (order.addOns?.length) lines.push(`Add-ons: ${order.addOns.join(', ')}`);
	const setupLabel = order.setupType ? formatSetupType(order.setupType) : order.setupStyle;
	if (setupLabel) lines.push(`Setup: ${setupLabel}`);
	if (order.rentalsRequired !== undefined) lines.push(`Rentals: ${order.rentalsRequired ? 'Required' : 'Not required'}`);
	if (order.platesAndCutlery) lines.push(`Plates + cutlery: ${order.platesAndCutlery === 'required' ? 'Required' : 'Not required'}`);
	if (order.servingSpoons) lines.push(`Serving spoons: ${order.servingSpoons === 'required' ? 'Required' : 'Not required'}`);
	const dietary = dietaryLines(order.dietary);
	if (dietary.length) lines.push('Dietary:\n  ' + dietary.join('\n  '));
	if (order.customMenuDetails) lines.push(`Custom menu details: ${order.customMenuDetails}`);
	if (order.notes) lines.push(`Notes: ${order.notes}`);
	if (order.quote && order.quote.line_items && order.quote.line_items.length) {
		lines.push('\n--- preliminary estimate ---');
		for (const li of order.quote.line_items) lines.push(`  ${li.label} ${fmtMoney(li.amount)}`);
		if (order.quote.subtotal !== undefined) lines.push(`  Subtotal: ${fmtMoney(order.quote.subtotal)}`);
		if (order.quote.tax_amount !== undefined) lines.push(`  ${order.quote.tax_label || 'Tax'}: ${fmtMoney(order.quote.tax_amount)}`);
		if (order.quote.total !== undefined) lines.push(`  Total: ${fmtMoney(order.quote.total)}`);
		if (order.quote.disclaimer) lines.push(`  (${order.quote.disclaimer})`);
	}
	if (order.transcriptSnippet) lines.push('\n--- conversation ---\n' + order.transcriptSnippet);
	return lines.join('\n');
}

// ---------- PDF generation helpers ----------

// Best-effort menu inference (mirrors the route's heuristic so kitchen-sheet
// portioning matches what /api/neela/invoice/[ref] would produce).
//
// When order.menuItems is populated (the new structured dish-pick capture),
// we use it directly so the kitchen sheet shows real dish names instead of
// "Veg Curry #1" placeholders. We fall back to tier-based generic names only
// for legacy orders that pre-date dish-pick capture.
function inferMenuForOrder(order: Order): { appetizers: MenuItem[]; curries: MenuItem[] } {
	const appetizers: MenuItem[] = [];
	const curries: MenuItem[] = [];

	if (order.menuItems && order.menuItems.length > 0) {
		for (const m of order.menuItems) {
			if (m.kind === 'appetizer') {
				const isNonVeg = /chicken|wing|lamb|tandoori/i.test(m.name) && !/veg|paneer|onion|samosa|pakora/i.test(m.name);
				appetizers.push({ name: m.name, isNonVeg });
			} else {
				curries.push({ name: m.name, isNonVeg: m.kind === 'nonveg' });
			}
		}
		return { appetizers, curries };
	}

	const tier = String(order.menuTier || '').toLowerCase();

	if (tier.includes('vegetarian') || tier.includes('vegan')) {
		appetizers.push({ name: 'Onion Bhajia', isNonVeg: false });
		curries.push({ name: 'Paneer Butter Masala', isNonVeg: false });
		curries.push({ name: 'Dal Makhani', isNonVeg: false });
	} else if (tier.includes('meat lovers')) {
		curries.push({ name: 'Butter Chicken', isNonVeg: true });
		curries.push({ name: 'Chicken Saagwala', isNonVeg: true });
		curries.push({ name: 'Lamb Rogan Josh', isNonVeg: true });
		curries.push({ name: 'Lamb Pasanda', isNonVeg: true });
	} else if (tier.includes('option 1')) {
		curries.push({ name: 'Veg Curry #1', isNonVeg: false });
		curries.push({ name: 'Veg Curry #2', isNonVeg: false });
		curries.push({ name: 'Non-Veg Curry', isNonVeg: true });
	} else if (tier.includes('option 2')) {
		curries.push({ name: 'Veg Curry #1', isNonVeg: false });
		curries.push({ name: 'Veg Curry #2', isNonVeg: false });
		curries.push({ name: 'Non-Veg Curry #1', isNonVeg: true });
		curries.push({ name: 'Non-Veg Curry #2', isNonVeg: true });
	} else if (tier.includes('option 3')) {
		appetizers.push({ name: 'Veg Appetizer', isNonVeg: false });
		curries.push({ name: 'Veg Curry #1', isNonVeg: false });
		curries.push({ name: 'Veg Curry #2', isNonVeg: false });
		curries.push({ name: 'Non-Veg Curry #1', isNonVeg: true });
		curries.push({ name: 'Non-Veg Curry #2', isNonVeg: true });
	} else if (tier.includes('option 4')) {
		appetizers.push({ name: 'Non-Veg Appetizer', isNonVeg: true });
		curries.push({ name: 'Veg Curry #1', isNonVeg: false });
		curries.push({ name: 'Veg Curry #2', isNonVeg: false });
		curries.push({ name: 'Non-Veg Curry #1', isNonVeg: true });
		curries.push({ name: 'Non-Veg Curry #2', isNonVeg: true });
	}
	return { appetizers, curries };
}

function orderToInvoiceOrder(reference: string, order: Order, createdAt: string): InvoiceOrder {
	const setupLabel = order.setupType ? formatSetupType(order.setupType) : order.setupStyle;
	return {
		reference,
		createdAt,
		mode: order.mode,
		eventType: order.eventType,
		eventDate: order.eventDate,
		guestCount: order.guestCount,
		serviceType: order.serviceType,
		location: order.location,
		deliveryAddress: order.deliveryAddress,
		deliveryTime: order.deliveryTime,
		timeWindow: order.timeWindow,
		dietary: order.dietary,
		menuTier: order.menuTier,
		addOns: order.addOns,
		menuItems: order.menuItems,
		additionalMenuItems: order.additionalMenuItems,
		setupStyle: setupLabel,
		setupType: order.setupType,
		rentalsRequired: order.rentalsRequired,
		platesAndCutlery: order.platesAndCutlery,
		servingSpoons: order.servingSpoons,
		customMenuDetails: order.customMenuDetails,
		contact: order.contact,
		notes: order.notes,
		quote: order.quote
	};
}

async function renderInvoicePdfBuffer(
	reference: string,
	order: Order,
	audience: Audience
): Promise<Buffer | null> {
	try {
		const invoiceOrder = orderToInvoiceOrder(reference, order, new Date().toISOString());
		const { appetizers, curries } = inferMenuForOrder(order);
		const guestCount = typeof order.guestCount === 'number'
			? order.guestCount
			: parseInt(String(order.guestCount || '0'), 10) || 0;
		const sheet = calculatePortions({ guestCount, appetizers, curries });
		const [logoBuffer, cormorantBuffer] = await Promise.all([loadLogo(), loadCormorant()]);
		const doc = buildInvoicePdf({
			order: invoiceOrder,
			sheet,
			audience,
			logoBuffer,
			cormorantRegistered: !!cormorantBuffer
		});
		const buf = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);
		return buf;
	} catch (err) {
		const e = err as { message?: string; stack?: string; name?: string };
		console.error('[neela-order] pdf render failed', {
			reference,
			audience,
			err: e?.message,
			name: e?.name,
			stack: e?.stack
		});
		return null;
	}
}

// Skip PDF for consultation mode (just contact + notes, not enough to render
// a meaningful kitchen sheet). Quick + Full both get PDFs.
function shouldGeneratePdf(order: Order): boolean {
	return order.mode !== 'consultation';
}

async function sendOrderEmail(reference: string, order: Order): Promise<{ sent: boolean; emailId?: string; error?: string }> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.log('[neela-order] no resend key, skipped email send', { reference });
		return { sent: false, error: 'RESEND_API_KEY not set' };
	}

	// Render all 3 audience PDFs in parallel. The team email needs both the
	// 2-page invoice AND the 1-page kitchen sheet attached as separate
	// documents (so the team can forward each to its respective audience
	// without further editing). The customer email gets only the 1-page
	// submission record. KITCHEN_EMAIL, when set, also receives the kitchen
	// PDF as a standalone email.
	// 'internal' → pages 1 + 2 (customer-final invoice; team review + customer forward)
	// 'customer' → page 1 only (initial submission record; no pricing)
	// 'kitchen'  → page 3 only (separate prep sheet for the kitchen team)
	const generatePdfs = shouldGeneratePdf(order);
	const [teamBuffer, customerBuffer, kitchenBuffer] = generatePdfs
		? await Promise.all([
			renderInvoicePdfBuffer(reference, order, 'internal'),
			renderInvoicePdfBuffer(reference, order, 'customer'),
			renderInvoicePdfBuffer(reference, order, 'kitchen')
		])
		: [null, null, null];

	try {
		const resend = new Resend(apiKey);
		const fromAddr = emailFrom();
		const teamRecipient = recipient();
		const testMode = isTestMode();
		const subject = modeSubject(reference, order);
		const html = buildOrderEmailHtml(reference, order);
		const text = buildOrderEmailText(reference, order);

		// 1) Events team gets BOTH attachments as separate documents so they
		// can forward each one independently (invoice → customer once
		// finalized; kitchen sheet → kitchen team). In test mode this routes
		// to NEELA_TEST_EMAIL.
		const teamAttachments: { filename: string; content: Buffer }[] = [];
		if (teamBuffer) {
			teamAttachments.push({
				filename: buildPdfFilename({ customerName: order.contact.name, eventDate: order.eventDate, suffix: 'invoice' }),
				content: teamBuffer
			});
		}
		if (kitchenBuffer) {
			teamAttachments.push({
				filename: buildPdfFilename({ customerName: order.contact.name, eventDate: order.eventDate, suffix: 'kitchen' }),
				content: kitchenBuffer
			});
		}
		const teamTo = testMode ? teamRecipient : 'events@sulaindianrestaurant.com';
		const teamResult = await resend.emails.send({
			from: fromAddr,
			to: [teamTo],
			replyTo: order.contact.email,
			subject,
			html,
			text,
			attachments: teamAttachments.length ? teamAttachments : undefined
		});
		if (teamResult.error) {
			const e = teamResult.error as { message?: string; statusCode?: number; name?: string };
			const detail = e.message || String(teamResult.error);
			console.error('[neela-order] resend rejected team email', {
				reference,
				from: fromAddr,
				to: teamTo,
				statusCode: e.statusCode,
				name: e.name,
				detail
			});
			return { sent: false, error: detail };
		}
		const emailId = (teamResult.data && (teamResult.data as { id?: string }).id) || undefined;
		console.log('[neela-order] sent to events team', {
			reference,
			emailId,
			attachments: teamAttachments.map((a) => a.filename),
			testMode
		});
		await markEmailed(reference);

		// 2) Customer copy, page 1 ONLY (catering details, no pricing). The
		// customer never sees Neela's preliminary line-items; events team
		// controls the official quote. In test mode, redirect this to
		// NEELA_TEST_EMAIL (we don't want to email real customers during testing).
		// reply-to points at the events team so customer replies land there.
		if (customerBuffer && order.contact.email) {
			try {
				const customerSubject = `Sula Catering, your event details (for your records) ${reference}`;
				const customerTo = testMode ? teamRecipient : order.contact.email;
				const customerHtml = buildCustomerEmailHtml(reference, order);
				const customerFilename = buildPdfFilename({ customerName: order.contact.name, eventDate: order.eventDate });
				const customerResult = await resend.emails.send({
					from: FROM_CUSTOMER,
					to: [customerTo],
					replyTo: EMAIL_TO_PROD,
					subject: customerSubject,
					html: customerHtml,
					attachments: [{ filename: customerFilename, content: customerBuffer }]
				});
				if (customerResult.error) {
					const e = customerResult.error as { message?: string; statusCode?: number; name?: string };
					console.warn('[neela-order] customer email rejected', { reference, statusCode: e.statusCode, name: e.name, detail: e.message });
				} else {
					console.log('[neela-order] sent customer copy', { reference, redirected: testMode });
				}
			} catch (err) {
				console.warn('[neela-order] customer email failed (non-fatal)', err);
			}
		}

		// 3) Optional kitchen-only email (when KITCHEN_EMAIL is set). The team
		// email already includes the kitchen PDF; this is a convenience for
		// kitchens that want a direct copy without the team forwarding step.
		// In test mode, redirect kitchen email to NEELA_TEST_EMAIL too.
		if (kitchenBuffer && process.env.KITCHEN_EMAIL) {
			try {
				const kitchenTo = testMode ? teamRecipient : process.env.KITCHEN_EMAIL;
				const kitchenSubject = `[Neela kitchen sheet ${reference}] ${order.eventDate || ''}`.trim();
				const kitchenFilename = buildPdfFilename({ customerName: order.contact.name, eventDate: order.eventDate, suffix: 'kitchen' });
				const kitchenResult = await resend.emails.send({
					from: fromAddr,
					to: [kitchenTo],
					subject: kitchenSubject,
					html: `<p style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">Kitchen prep sheet for reference <strong>${reference}</strong> attached. ${order.guestCount || ''} guests, ${order.eventDate || 'date TBD'}.</p>`,
					attachments: [{ filename: kitchenFilename, content: kitchenBuffer }]
				});
				if (kitchenResult.error) {
					const e = kitchenResult.error as { message?: string; statusCode?: number; name?: string };
					console.warn('[neela-order] kitchen email rejected', { reference, statusCode: e.statusCode, name: e.name, detail: e.message });
				} else {
					console.log('[neela-order] sent kitchen copy', { reference });
				}
			} catch (err) {
				console.warn('[neela-order] kitchen email failed (non-fatal)', err);
			}
		}

		return { sent: true, emailId };
	} catch (err) {
		const e = err as { message?: string };
		const detail = e?.message || String(err);
		console.error('[neela-order] email send failed', { reference, detail, err });
		return { sent: false, error: detail };
	}
}

// Customer-facing email body. Page-1-only Catering Submission Record PDF
// attached. The customer does NOT see prices in this email or the attachment,
// the events team is reviewing and will send a formal written quote.
// Brand-styled (table-based for client compat, max-width 600px, midnight/navy
// header band, gold rule, plum/cream/gold accents). No em dashes anywhere.
function buildCustomerEmailHtml(reference: string, order: Order): string {
	const firstName = (order.contact.name || '').split(/\s+/)[0] || 'there';
	const intro = `Hi ${firstName}, thanks for the request.`;
	const reviewing = 'The events team is reviewing the quote and will send the formal one shortly.';
	const attachment = "Your submission record is attached for reference, reply if anything's off.";
	return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5ede0;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede0">
	<tr><td align="center" style="padding:28px 16px">
		<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid rgba(184,149,106,0.30);border-collapse:separate">

			<!-- Brand band -->
			<tr><td align="center" style="padding:32px 32px 26px;background:linear-gradient(180deg,#0a1628 0%,#142442 100%);background-color:#0a1628;text-align:center">
				<p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#b8956a;text-transform:uppercase;font-weight:700">Sula Indian Catering</p>
				<p style="margin:8px 0 4px;font-family:Georgia,serif;font-size:26px;color:#f5ede0;font-weight:600;line-height:1.2">Submission received</p>
				<p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:14px;color:rgba(245,237,224,0.78);line-height:1.4">Bold spices. Warm hospitality.</p>
			</td></tr>

			<!-- Gold rule -->
			<tr><td style="padding:0;background:#b8956a;line-height:2px;height:2px;font-size:0">&nbsp;</td></tr>

			<!-- Body -->
			<tr><td style="padding:24px 32px 8px;background:#ffffff">
				<p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">${escapeHtml(intro)}</p>
				<p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">${escapeHtml(reviewing)}</p>
				<p style="margin:0 0 18px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">${escapeHtml(attachment)}</p>
			</td></tr>

			<!-- Reference chip -->
			<tr><td style="padding:0 32px 18px;background:#ffffff">
				<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
					<tr>
						<td style="padding:8px 14px;background:#fbf6ec;border-left:3px solid #b8956a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#6b6b6b;letter-spacing:1.4px;text-transform:uppercase;font-weight:700">Reference</td>
						<td style="padding:8px 14px;background:#fbf6ec;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#25042d;font-weight:700;letter-spacing:0.4px">${escapeHtml(reference)}</td>
					</tr>
				</table>
			</td></tr>

			<!-- Sign-off -->
			<tr><td style="padding:8px 32px 20px;background:#ffffff">
				<p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55">Talk soon,</p>
				<p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#25042d;font-weight:600;line-height:1.4">The Sula events team</p>
			</td></tr>

			<!-- Footer band -->
			<tr><td style="padding:16px 32px;background:#25042d;border-top:2px solid #b8956a">
				<p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#f5ede0;line-height:1.5">events.sula@gmail.com <span style="color:#b8956a;font-weight:700">&nbsp;&middot;&nbsp;</span> 604-215-1130 <span style="color:#b8956a;font-weight:700">&nbsp;&middot;&nbsp;</span> sulaindianrestaurant.com</p>
				<p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:rgba(245,237,224,0.65);letter-spacing:0.3px">Vancouver since 2010 <span style="color:#b8956a">&nbsp;&middot;&nbsp;</span> Commercial Drive <span style="color:#b8956a">&nbsp;&middot;&nbsp;</span> Main Street <span style="color:#b8956a">&nbsp;&middot;&nbsp;</span> Davie Street <span style="color:#b8956a">&nbsp;&middot;&nbsp;</span> Sula Cafe</p>
			</td></tr>
		</table>
	</td></tr>
</table>
</body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log('[neela-order] hit', req.method);

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'method not allowed' });
	}

	const body = (req.body || {}) as SubmitBody;
	const v = validate(body);
	if (!v.ok) {
		return res.status(400).json({ error: v.error });
	}

	const ip = getClientIp(req);
	const ipHash = hashIp(ip);

	// Generate reference, retry once on UNIQUE collision (vanishingly rare).
	let reference = makeReference();
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await persistOrder({ reference, sessionId: v.sessionId, ipHash, order: v.order });
			break;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/unique|duplicate/i.test(msg) && attempt < 2) {
				reference = makeReference();
				console.warn('[neela-order] reference collision, retrying with new one');
				continue;
			}
			console.error('[neela-order] persist failed', err);
			return res.status(500).json({ error: 'failed to save order, please try again or call 604-215-1130' });
		}
	}

	const { sent, error: emailError } = await sendOrderEmail(reference, v.order);

	console.log('[neela-order] complete', {
		reference,
		mode: v.order.mode,
		emailed: sent,
		emailError: emailError || null,
		eventType: v.order.eventType,
		guestCount: v.order.guestCount
	});

	return res.status(200).json({
		ok: true,
		reference,
		mode: v.order.mode,
		emailed: sent,
		...(emailError ? { emailError } : {}),
		message: modeReplyMessage(reference, v.order.mode)
	});
}
