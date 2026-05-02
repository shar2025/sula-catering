/**
 * Builds a customer-facing PDF filename of the form
 *   Sula-Catering-{CustomerName}-{DD}-{MMM}-{YYYY}[-{suffix}].pdf
 *
 * Used by the email-attachment layer (api/neela/submit-order.ts) and the
 * download endpoint (api/neela/invoice/[reference].ts) so the suggested
 * filename matches across both surfaces.
 *
 * Suffixes:
 *   ''         customer copy
 *   'invoice'  team invoice (audience=internal)
 *   'kitchen'  kitchen sheet (audience=kitchen)
 *
 * Sanitization:
 *   customerName   non-alphanumeric collapsed to single hyphen, trimmed,
 *                  capped at 30 chars, fallback "Customer" when missing.
 *   eventDate      "May 22 2026" / "2026-05-22" / "22/05/2026" all become
 *                  "22-May-2026". The 3-letter month avoids the dd/mm vs
 *                  mm/dd ambiguity that bites US/Canada readers when both
 *                  segments are numeric. When the field is missing the
 *                  segment is omitted; when a value is present but
 *                  unparseable the segment falls back to today's date so the
 *                  filename still carries some temporal anchor.
 */

export interface BuildPdfFilenameArgs {
	customerName?: string;
	eventDate?: string;
	suffix?: 'invoice' | 'kitchen' | '';
}

const NAME_MAX_LEN = 30;

function sanitizeCustomerName(raw: string | undefined): string {
	if (!raw) return 'Customer';
	const collapsed = raw
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!collapsed) return 'Customer';
	const truncated = collapsed.slice(0, NAME_MAX_LEN).replace(/-+$/g, '');
	return truncated || 'Customer';
}

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function joinDdMmmYyyy(day: number, monthIndex: number, year: number): string {
	return `${pad2(day)}-${MONTH_ABBREV[monthIndex]}-${year}`;
}

function todayDdMmmYyyy(): string {
	const d = new Date();
	return joinDdMmmYyyy(d.getDate(), d.getMonth(), d.getFullYear());
}

function formatEventDate(raw: string | undefined): string | undefined {
	if (raw === undefined || raw === null) return undefined;
	const trimmed = String(raw).trim();
	if (!trimmed) return undefined;

	const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (iso) {
		const yyyy = Number(iso[1]);
		const mm = Number(iso[2]);
		const dd = Number(iso[3]);
		if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
			return joinDdMmmYyyy(dd, mm - 1, yyyy);
		}
	}

	// Slash / dot / dash forms with 4-digit year. Treat as DD?MM?YYYY (Sula
	// is Canada-based; Neela's prompt nudges customers toward day-first
	// formats). If parsing here fails, the natural-language Date() fallback
	// below catches "May 22 2026" / "May 22, 2026" / "22 May 2026" etc.
	const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
	if (dmy) {
		const dd = Number(dmy[1]);
		const mm = Number(dmy[2]);
		const yyyy = Number(dmy[3]);
		if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
			return joinDdMmmYyyy(dd, mm - 1, yyyy);
		}
	}

	const parsed = new Date(trimmed);
	if (!Number.isNaN(parsed.getTime())) {
		return joinDdMmmYyyy(parsed.getDate(), parsed.getMonth(), parsed.getFullYear());
	}

	return todayDdMmmYyyy();
}

export function buildPdfFilename(args: BuildPdfFilenameArgs): string {
	const namePart = sanitizeCustomerName(args.customerName);
	const datePart = formatEventDate(args.eventDate);
	const suffix = args.suffix ? args.suffix.trim() : '';

	let base = `Sula-Catering-${namePart}`;
	if (datePart) base += `-${datePart}`;
	if (suffix) base += `-${suffix}`;
	return `${base}.pdf`;
}
