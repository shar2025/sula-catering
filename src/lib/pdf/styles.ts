// Sula PDF style system, rebuilt to match Shar's existing 3-page reference
// invoice (the format the catering ops already uses). Clean black-on-white
// document typography. Brand color shows up only as accent rules and
// section heads, NOT as full-bleed page backgrounds. Goal: it looks like a
// real invoice, not a marketing brochure.
//
// LETTER SPACING IS DELIBERATELY ZERO on every multi-letter run. Earlier
// versions used wide tracking on uppercase labels; pdftotext extracts each
// glyph as its own word ("D I E TA R Y") and the visual result is tiring.
// All emphasis here comes from font weight, size, color, and underlines.

import { Font, StyleSheet } from '@react-pdf/renderer';

// ---------- Brand palette ----------
// Most ink is black/dark gray; brand colors are accent-only so the document
// reads as an invoice and not a brochure.
export const COLORS = {
	black: '#000000',
	text: '#1a1a1a',
	textSoft: '#3a3a3a',
	muted: '#6b6b6b',
	rule: '#1a1a1a',
	ruleSoft: '#cccccc',
	zebra: '#f7f4ee', // very light cream, alternating row bg
	bg: '#ffffff',
	gold: '#b8956a',
	plum: '#25042d',
	cream: '#f5ede0'
};

// ---------- Logo ----------
// Logo is pre-fetched at function init via loadLogo() and passed as a Buffer.
// We avoid passing a remote URL to <Image src> because react-pdf fetches at
// render time and any network blip throws the whole render.
export const LOGO_URL = 'https://sulacatering.com/apple-touch-icon.png';

let cachedLogo: Buffer | null = null;
let logoLoadPromise: Promise<Buffer | null> | null = null;
const LOGO_FETCH_TIMEOUT_MS = 6000;

export async function loadLogo(): Promise<Buffer | null> {
	if (cachedLogo) return cachedLogo;
	if (logoLoadPromise) return logoLoadPromise;
	logoLoadPromise = (async () => {
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), LOGO_FETCH_TIMEOUT_MS);
			const resp = await fetch(LOGO_URL, { signal: ctrl.signal });
			clearTimeout(t);
			if (!resp.ok) {
				console.warn('[pdf] logo fetch non-ok', resp.status);
				return null;
			}
			const buf = Buffer.from(await resp.arrayBuffer());
			cachedLogo = buf;
			return buf;
		} catch (err) {
			console.warn('[pdf] logo fetch failed, rendering without logo', err instanceof Error ? err.message : err);
			return null;
		}
	})();
	return logoLoadPromise;
}

// ---------- Fonts ----------
// Use react-pdf's built-in Helvetica family; bundling external fonts into
// Vercel serverless was unreliable. Font weight + style do all the work.
let fontsRegistered = false;
export function ensureFonts(): void {
	if (fontsRegistered) return;
	fontsRegistered = true;
}

export const FONTS = {
	body: 'Helvetica',
	bold: 'Helvetica-Bold',
	italic: 'Helvetica-Oblique',
	boldItalic: 'Helvetica-BoldOblique'
};

// ---------- Shared styles ----------
export const styles = StyleSheet.create({
	page: {
		backgroundColor: COLORS.bg,
		color: COLORS.text,
		fontFamily: FONTS.body,
		fontSize: 10,
		paddingHorizontal: 44,
		paddingTop: 32,
		paddingBottom: 48
	},

	// ---------- Brand header block (Pages 1 + 2) ----------
	brandBlock: {
		alignItems: 'center',
		marginBottom: 12
	},
	brandLogo: { width: 44, height: 44, marginBottom: 6 },
	brandName: {
		fontFamily: FONTS.bold,
		fontSize: 18,
		color: COLORS.plum,
		marginBottom: 3
	},
	brandTagline: {
		fontFamily: FONTS.italic,
		fontSize: 10,
		color: COLORS.muted,
		marginBottom: 2
	},
	brandEst: {
		fontSize: 8.5,
		color: COLORS.muted
	},
	docTitle: {
		fontFamily: FONTS.bold,
		fontSize: 20,
		color: COLORS.text,
		marginTop: 12,
		marginBottom: 8,
		textAlign: 'center'
	},
	locationsLine: {
		fontSize: 9.5,
		color: COLORS.textSoft,
		textAlign: 'center',
		marginBottom: 2
	},
	cityLine: {
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center',
		marginBottom: 2
	},
	contactLine: {
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center',
		marginBottom: 6
	},
	headerRule: {
		borderTopWidth: 1,
		borderTopColor: COLORS.rule,
		borderTopStyle: 'solid',
		marginTop: 4,
		marginBottom: 10
	},

	// ---------- Section header (across all pages) ----------
	section: {
		fontFamily: FONTS.bold,
		fontSize: 12,
		color: COLORS.text,
		marginTop: 8,
		marginBottom: 8,
		paddingBottom: 4,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.rule,
		borderBottomStyle: 'solid'
	},
	sectionGold: {
		fontFamily: FONTS.bold,
		fontSize: 10.5,
		color: COLORS.text,
		marginTop: 10,
		marginBottom: 4,
		paddingBottom: 2,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},

	// ---------- Two-column field grid (Page 1 details) ----------
	// Each row is Label | Value. Label gets a fixed width on the left so all
	// values line up. Pairs are stacked; on Page 1 we run a single column of
	// rows, but the 'two-column field layout' from the reference reads as a
	// label/value grid (label left, value right), not two side-by-side columns.
	fieldRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		paddingVertical: 3.5,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
		borderBottomStyle: 'solid'
	},
	fieldLabel: {
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.textSoft,
		width: 160,
		paddingRight: 8
	},
	fieldValue: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		lineHeight: 1.4
	},
	fieldValueBold: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		lineHeight: 1.4
	},
	dietBadge: {
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.muted
	},

	// ---------- Page 1 footer ----------
	page1Footer: {
		marginTop: 18,
		paddingTop: 10,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.ruleSoft,
		borderTopStyle: 'solid',
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center',
		fontFamily: FONTS.italic
	},

	// ---------- Page 2 invoice meta ----------
	gstLine: {
		fontSize: 9,
		color: COLORS.muted,
		marginBottom: 6,
		textAlign: 'center'
	},
	subtotalChip: {
		alignSelf: 'flex-end',
		marginTop: 4,
		marginBottom: 8,
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderWidth: 0.6,
		borderColor: COLORS.rule,
		borderStyle: 'solid'
	},
	subtotalChipText: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.text
	},

	// ---------- Order line-item table (Page 2) ----------
	tableHeaderRow: {
		flexDirection: 'row',
		paddingVertical: 6,
		paddingHorizontal: 8,
		backgroundColor: COLORS.text,
		marginBottom: 0
	},
	tableHeaderCell: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: '#ffffff'
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
		borderBottomStyle: 'solid',
		alignItems: 'flex-start'
	},
	tableRowAlt: {
		backgroundColor: COLORS.zebra
	},
	colProduct: { flex: 3.4, paddingRight: 8 },
	colQty: { flex: 0.7, textAlign: 'right', paddingRight: 8 },
	colUnit: { flex: 1, textAlign: 'right', paddingRight: 8 },
	colPrice: { flex: 1.1, textAlign: 'right' },
	cellText: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.text },
	cellTextBold: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.text },
	totalRow: {
		flexDirection: 'row',
		paddingVertical: 8,
		paddingHorizontal: 8,
		borderTopWidth: 1,
		borderTopColor: COLORS.rule,
		borderTopStyle: 'solid',
		marginTop: 4,
		alignItems: 'flex-start'
	},
	totalLabel: {
		fontFamily: FONTS.bold,
		fontSize: 12,
		color: COLORS.text,
		flex: 5.1,
		textAlign: 'right',
		paddingRight: 8
	},
	totalValue: {
		fontFamily: FONTS.bold,
		fontSize: 12,
		color: COLORS.text,
		flex: 1.1,
		textAlign: 'right'
	},

	// ---------- Page 2 footer block ----------
	thankYou: {
		marginTop: 18,
		fontFamily: FONTS.italic,
		fontSize: 11,
		color: COLORS.text,
		textAlign: 'center'
	},
	revisionsLine: {
		marginTop: 8,
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center'
	},
	closingEmail: {
		marginTop: 4,
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center'
	},

	// ---------- Page 3 (kitchen) ----------
	kitchenHeader: {
		fontFamily: FONTS.bold,
		fontSize: 16,
		color: COLORS.text,
		textAlign: 'center',
		marginBottom: 3
	},
	kitchenSubhead: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.plum,
		textAlign: 'center',
		marginBottom: 8
	},

	// 2-col header field block on Page 3
	twoColRow: { flexDirection: 'row' },
	twoColCell: { flex: 1 },
	kitchenFieldRow: {
		flexDirection: 'row',
		paddingVertical: 2,
		alignItems: 'flex-start'
	},
	kitchenFieldLabel: {
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.textSoft,
		width: 80,
		paddingRight: 6
	},
	kitchenFieldValue: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		lineHeight: 1.4
	},

	// Portioning table (3 cols: Item | Portions | Notes)
	portTableHeaderRow: {
		flexDirection: 'row',
		paddingVertical: 6,
		paddingHorizontal: 8,
		backgroundColor: COLORS.text
	},
	portHeaderItem: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: '#ffffff',
		flex: 2.4
	},
	portHeaderPortions: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: '#ffffff',
		flex: 1,
		textAlign: 'right',
		paddingRight: 8
	},
	portHeaderNotes: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: '#ffffff',
		flex: 2.6
	},
	portRow: {
		flexDirection: 'row',
		paddingVertical: 3.5,
		paddingHorizontal: 8,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
		borderBottomStyle: 'solid',
		alignItems: 'flex-start'
	},
	portRowAlt: { backgroundColor: COLORS.zebra },
	portBullet: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		marginRight: 6
	},
	portCellItem: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text,
		flex: 2.4,
		flexDirection: 'row'
	},
	portCellItemText: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text
	},
	portCellPortions: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		textAlign: 'right',
		paddingRight: 8
	},
	portCellNotes: {
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.muted,
		flex: 2.6,
		lineHeight: 1.35
	},
	portFootnote: {
		marginTop: 8,
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.muted,
		lineHeight: 1.4
	},

	// Setup / Delivery 3-col rows
	threeColRow: {
		flexDirection: 'row',
		paddingVertical: 3,
		paddingHorizontal: 4,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
		borderBottomStyle: 'solid'
	},
	threeColCellLabel: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.text,
		flex: 1.5,
		paddingRight: 8
	},
	threeColCellValue: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text,
		flex: 1.5,
		paddingRight: 8
	},
	threeColCellNote: {
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.muted,
		flex: 2
	},

	// Delivery block (label/value pairs, simple)
	deliveryBlock: { marginTop: 4 },
	deliveryNoteHighlight: {
		marginTop: 6,
		paddingVertical: 4,
		paddingHorizontal: 6,
		borderLeftWidth: 2,
		borderLeftColor: COLORS.gold,
		borderLeftStyle: 'solid',
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.text
	},

	// Pre-delivery checklist (single column, gold checkbox)
	checklistItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 2,
		gap: 8
	},
	checkbox: {
		width: 10,
		height: 10,
		borderWidth: 0.8,
		borderColor: COLORS.text,
		borderStyle: 'solid'
	},
	checklistText: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text
	},

	// ---------- Footer (page-number row) ----------
	footer: {
		position: 'absolute',
		bottom: 24,
		left: 48,
		right: 48,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 6,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.ruleSoft,
		borderTopStyle: 'solid'
	},
	footerText: {
		fontSize: 8.5,
		color: COLORS.muted
	},
	footerTextConfidential: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.plum
	},

	// SAMPLE watermark (used by sample preview only)
	sampleWatermark: {
		position: 'absolute',
		top: 320,
		left: 0,
		right: 0,
		textAlign: 'center',
		fontFamily: FONTS.bold,
		fontSize: 110,
		color: COLORS.gold,
		opacity: 0.08,
		transform: 'rotate(-30deg)'
	}
});
