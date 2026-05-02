/**
 * /api/neela/submit-order — captures a customer-confirmed order from the chat,
 * persists to Postgres (neela_orders), and emails the events team.
 *
 * Required env (silent skip if missing):
 *   POSTGRES_URL          — Vercel Postgres / Neon (table auto-creates)
 *   RESEND_API_KEY        — Resend; without it order still persists, email skipped
 *
 * Returns:
 *   { ok: true, reference: "SC-0502-A7K2", emailed: true|false, message: "..." }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { renderToBuffer } from '@react-pdf/renderer';
import { buildInvoicePdf, type InvoiceOrder, type Audience } from '../../src/lib/pdf/InvoicePdf.js';
import { calculatePortions, type MenuItem } from '../../src/lib/portioning.js';

export const config = { maxDuration: 30 };

const EMAIL_TO = 'events@sulaindianrestaurant.com';
const EMAIL_FROM = 'Neela <neela@sulacatering.com>';
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
	halal?: boolean;
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
interface Order {
	mode: Mode;
	eventType?: EventType;
	eventDate?: string;
	guestCount?: number | string; // number for 'full', string range allowed for 'quick'
	serviceType?: ServiceType;
	location?: { city?: string; venueOrAddress?: string };
	timeWindow?: string;
	dietary?: Dietary;
	menuTier?: string;
	addOns?: string[];
	setupStyle?: string;
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

	// eventType — required for full + quick, optional for consultation.
	if (mode !== 'consultation') {
		if (!o.eventType || !VALID_EVENT_TYPES.includes(o.eventType as EventType)) {
			return { ok: false, error: 'order.eventType required (one of: ' + VALID_EVENT_TYPES.join(', ') + ')' };
		}
	} else if (o.eventType && !VALID_EVENT_TYPES.includes(o.eventType as EventType)) {
		return { ok: false, error: 'order.eventType invalid (one of: ' + VALID_EVENT_TYPES.join(', ') + ')' };
	}

	// guestCount — required for full (number), required for quick (number or "rough range" string),
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

	// eventDate — required for full + quick, optional for consultation.
	const eventDate = String(o.eventDate || '').trim().slice(0, 200);
	if (mode !== 'consultation' && !eventDate) {
		return { ok: false, error: 'order.eventDate required (specific date or month for ' + mode + ' mode)' };
	}

	if (o.serviceType && !VALID_SERVICE_TYPES.includes(o.serviceType as ServiceType)) {
		return { ok: false, error: 'order.serviceType must be one of: ' + VALID_SERVICE_TYPES.join(', ') };
	}
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
		timeWindow: o.timeWindow ? String(o.timeWindow).slice(0, 200) : undefined,
		dietary: o.dietary && typeof o.dietary === 'object' ? {
			vegetarianPct: typeof o.dietary.vegetarianPct === 'number' ? o.dietary.vegetarianPct : undefined,
			hasJain: typeof o.dietary.hasJain === 'boolean' ? o.dietary.hasJain : undefined,
			hasVegan: typeof o.dietary.hasVegan === 'boolean' ? o.dietary.hasVegan : undefined,
			hasGlutenFree: typeof o.dietary.hasGlutenFree === 'boolean' ? o.dietary.hasGlutenFree : undefined,
			hasNutAllergy: typeof o.dietary.hasNutAllergy === 'boolean' ? o.dietary.hasNutAllergy : undefined,
			halal: typeof o.dietary.halal === 'boolean' ? o.dietary.halal : undefined,
			notes: o.dietary.notes ? String(o.dietary.notes).slice(0, 800) : undefined
		} : undefined,
		menuTier: o.menuTier ? String(o.menuTier).slice(0, 200) : undefined,
		addOns: Array.isArray(o.addOns) ? o.addOns.map((s) => String(s).slice(0, 200)).slice(0, 30) : undefined,
		setupStyle: o.setupStyle ? String(o.setupStyle).slice(0, 200) : undefined,
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
	if (d.hasGlutenFree) lines.push('Gluten-free options needed');
	if (d.hasNutAllergy) lines.push('⚠ Nut allergy flagged');
	if (d.halal) lines.push('Halal-only');
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
	const locStr =
		order.location?.venueOrAddress && order.location?.city
			? `${order.location.venueOrAddress}, ${order.location.city}`
			: order.location?.venueOrAddress || order.location?.city || undefined;
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
					${row('Guest count', String(order.guestCount))}
					${row('Service', order.serviceType)}
					${row('Location', locStr)}
					${row('Time', order.timeWindow)}
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
					${row('Setup', order.setupStyle)}
				</table>
				<div style="margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#666;letter-spacing:0.4px;text-transform:uppercase">Dietary</div>
				<div style="margin:6px 0 0">${dietaryHtml}</div>
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
	if (order.guestCount !== undefined) lines.push(`Guest count: ${order.guestCount}`);
	if (order.serviceType) lines.push(`Service: ${order.serviceType}`);
	if (order.location?.venueOrAddress || order.location?.city) {
		lines.push(`Location: ${[order.location.venueOrAddress, order.location.city].filter(Boolean).join(', ')}`);
	}
	if (order.timeWindow) lines.push(`Time: ${order.timeWindow}`);
	lines.push(`Contact: ${order.contact.name} <${order.contact.email}>${order.contact.phone ? ' / ' + order.contact.phone : ''}`);
	if (order.menuTier) lines.push(`Menu tier: ${order.menuTier}`);
	if (order.addOns?.length) lines.push(`Add-ons: ${order.addOns.join(', ')}`);
	if (order.setupStyle) lines.push(`Setup: ${order.setupStyle}`);
	const dietary = dietaryLines(order.dietary);
	if (dietary.length) lines.push('Dietary:\n  ' + dietary.join('\n  '));
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
function inferMenuForOrder(order: Order): { appetizers: MenuItem[]; curries: MenuItem[] } {
	const appetizers: MenuItem[] = [];
	const curries: MenuItem[] = [];
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
	return {
		reference,
		createdAt,
		mode: order.mode,
		eventType: order.eventType,
		eventDate: order.eventDate,
		guestCount: order.guestCount,
		serviceType: order.serviceType,
		location: order.location,
		timeWindow: order.timeWindow,
		dietary: order.dietary,
		menuTier: order.menuTier,
		addOns: order.addOns,
		setupStyle: order.setupStyle,
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
		const doc = buildInvoicePdf({ order: invoiceOrder, sheet, audience });
		const buf = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);
		return buf;
	} catch (err) {
		console.error('[neela-order] pdf render failed', { reference, audience, err });
		return null;
	}
}

// Skip PDF for consultation mode (just contact + notes, not enough to render
// a meaningful kitchen sheet). Quick + Full both get PDFs.
function shouldGeneratePdf(order: Order): boolean {
	return order.mode !== 'consultation';
}

async function sendOrderEmail(reference: string, order: Order): Promise<{ sent: boolean; emailId?: string }> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.log('[neela-order] no resend key, skipped email send', { reference });
		return { sent: false };
	}

	// Render PDFs in parallel where possible
	const generatePdfs = shouldGeneratePdf(order);
	const [fullBuffer, customerBuffer, kitchenBuffer] = generatePdfs
		? await Promise.all([
			renderInvoicePdfBuffer(reference, order, 'all'),
			renderInvoicePdfBuffer(reference, order, 'customer'),
			process.env.KITCHEN_EMAIL ? renderInvoicePdfBuffer(reference, order, 'kitchen') : Promise.resolve(null)
		])
		: [null, null, null];

	try {
		const resend = new Resend(apiKey);
		const subject = modeSubject(reference, order);
		const html = buildOrderEmailHtml(reference, order);
		const text = buildOrderEmailText(reference, order);

		// 1) Events team — full 3-page PDF attached
		const teamAttachments = fullBuffer
			? [{ filename: `${reference}-full.pdf`, content: fullBuffer }]
			: undefined;
		const teamResult = await resend.emails.send({
			from: EMAIL_FROM,
			to: [EMAIL_TO],
			replyTo: order.contact.email,
			subject,
			html,
			text,
			attachments: teamAttachments
		});
		const emailId = (teamResult.data && (teamResult.data as { id?: string }).id) || undefined;
		console.log('[neela-order] sent to events team', { reference, emailId, withPdf: !!fullBuffer });
		await markEmailed(reference);

		// 2) Customer copy — pages 1 + 2 only (no kitchen sheet)
		if (customerBuffer && order.contact.email) {
			try {
				const customerSubject = order.mode === 'quick'
					? `Sula Catering, your inquiry ${reference}`
					: `Sula Catering, your order ${reference}`;
				const customerHtml = buildCustomerEmailHtml(reference, order);
				await resend.emails.send({
					from: EMAIL_FROM,
					to: [order.contact.email],
					replyTo: EMAIL_TO,
					subject: customerSubject,
					html: customerHtml,
					attachments: [{ filename: `Sula-Catering-${reference}.pdf`, content: customerBuffer }]
				});
				console.log('[neela-order] sent customer copy', { reference });
			} catch (err) {
				console.warn('[neela-order] customer email failed (non-fatal)', err);
			}
		}

		// 3) Optional kitchen-only email (when KITCHEN_EMAIL is set)
		if (kitchenBuffer && process.env.KITCHEN_EMAIL) {
			try {
				await resend.emails.send({
					from: EMAIL_FROM,
					to: [process.env.KITCHEN_EMAIL],
					subject: `[Kitchen ${reference}] Prep sheet ${order.eventDate || ''}`.trim(),
					html: `<p style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">Kitchen prep sheet for reference <strong>${reference}</strong> attached. ${order.guestCount || ''} guests, ${order.eventDate || 'date TBD'}.</p>`,
					attachments: [{ filename: `${reference}-kitchen.pdf`, content: kitchenBuffer }]
				});
				console.log('[neela-order] sent kitchen copy', { reference });
			} catch (err) {
				console.warn('[neela-order] kitchen email failed (non-fatal)', err);
			}
		}

		return { sent: true, emailId };
	} catch (err) {
		console.error('[neela-order] email send failed', err);
		return { sent: false };
	}
}

// Customer-facing email body (warmer, simpler, no transcript dump)
function buildCustomerEmailHtml(reference: string, order: Order): string {
	const dateLabel = new Date().toLocaleDateString('en-CA', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'America/Vancouver'
	});
	const isQuick = order.mode === 'quick';
	const heading = isQuick ? 'Thanks for the inquiry' : 'Your order is in';
	const sub = isQuick
		? 'Our events team will be back within a business day with menu ideas and tailored pricing.'
		: 'Our events team will be in touch within a business day to confirm details.';
	return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5ede0;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede0">
	<tr><td align="center" style="padding:32px 16px">
		<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid rgba(184,149,106,0.25);max-width:600px">
			<tr><td style="padding:30px 32px 22px;background:linear-gradient(135deg,#0a1628 0%,#25042d 70%);text-align:center">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#b8956a">Sula Indian Catering</p>
				<h1 style="margin:8px 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:600;color:#f5ede0;letter-spacing:0.4px;font-style:italic">${escapeHtml(heading)}</h1>
				<p style="margin:6px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(245,237,224,0.78);letter-spacing:0.3px">Reference <strong style="color:#d4b572">${escapeHtml(reference)}</strong></p>
			</td></tr>
			<tr><td style="padding:24px 32px">
				<p style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1a1a1a;line-height:1.6;font-style:italic">Hi ${escapeHtml(order.contact.name)},</p>
				<p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${escapeHtml(sub)}</p>
				<p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">Attached is a PDF copy of what we have on file so far. Reply to this email if anything needs to change.</p>
				<p style="margin:18px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:#666">Sula Indian Catering &middot; events@sulaindianrestaurant.com &middot; 604-215-1130</p>
			</td></tr>
			<tr><td style="padding:14px 32px 22px;border-top:1px solid rgba(184,149,106,0.2);background:#fbf6ec">
				<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:11px;color:#666;letter-spacing:0.3px">${escapeHtml(dateLabel)} &middot; sulacatering.com</p>
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

	const { sent } = await sendOrderEmail(reference, v.order);

	console.log('[neela-order] complete', {
		reference,
		mode: v.order.mode,
		emailed: sent,
		eventType: v.order.eventType,
		guestCount: v.order.guestCount
	});

	return res.status(200).json({
		ok: true,
		reference,
		mode: v.order.mode,
		emailed: sent,
		message: modeReplyMessage(reference, v.order.mode)
	});
}
