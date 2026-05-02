// Sula PDF style system, v2 luxury redesign.
//
// CUSTOMER PAGE (page 1) is treated as a fine-dining confirmation: minimal,
// generous whitespace, no row dividers, no alt-row tints, no section headers.
// Reads like a wedding invitation, not an invoice. Plum small caps labels,
// midnight body values, generous vertical spacing between rows.
//
// INTERNAL / KITCHEN PAGES (page 2 + 3) stay denser since they convey
// operational data: alt-row tints on the line-item table and the portioning
// table, gold-eyebrow section headers, plum total stripe.
//
// COLOUR PHILOSOPHY:
//   page base   = cream (#f5ede0)        warm restaurant tablecloth feel
//   header band = midnight to navy       deep, considered, signature
//   accents     = gold (#b8956a) and plum (#25042d)
//
// LETTER-SPACING POLICY:
//   letterSpacing > 0 is permitted ONLY on the document title (decorative).
//   Body labels, values, and section eyebrows stay at 0 so pdftotext
//   extracts them as searchable words rather than splayed glyphs.
//
// CHARACTER POLICY: never use em dashes (U+2014) or en dashes (U+2013); never
// use diamonds, geometric ornaments, or other non-WinAnsi glyphs (Helvetica
// substitutes garbage for them). Use commas, periods, middle dot (·, U+00B7),
// thin gold rules, and whitespace as separators.
//
// FONT POLICY: react-pdf's built-in Helvetica family only. External font
// registration (Cormorant Garamond, Playfair, etc.) is unreliable on Vercel
// cold-start and the fetch can hang the renderer. Brand richness comes from
// colour + weight + size + tracking on the doc title.

import { Font, StyleSheet } from '@react-pdf/renderer';

// ---------- Brand palette ----------
export const COLORS = {
	// Body ink + neutrals
	black: '#000000',
	text: '#1a1a1a',
	textSoft: '#3a3a3a',
	muted: '#6b6b6b',
	rule: '#1a1a1a',
	ruleSoft: '#cfc4ad',
	bg: '#f5ede0',              // page base, soft cream
	white: '#ffffff',           // alt-row pop colour on cream
	zebra: '#ffffff',           // alternating row bg, white on cream
	creamSoft: '#fbf6ec',
	zebraDark: '#ebe0c8',

	// Brand
	midnight: '#0a1628',
	navy: '#142442',
	navySoft: '#1c2f55',
	plum: '#25042d',
	plumSoft: '#3d1547',
	gold: '#b8956a',
	goldSoft: '#d4b88a',
	goldDeep: '#9b7b54',
	goldFaint: 'rgba(184,149,106,0.32)',
	cream: '#f5ede0',
	creamMuted: 'rgba(245,237,224,0.78)',
	creamDim: 'rgba(245,237,224,0.55)'
};

// ---------- Logo ----------
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
// Built-in Helvetica only. Cormorant Garamond registration was considered but
// rejected: external font fetch at render time hangs the renderer on Vercel
// cold-start. To enable a serif title later, uncomment the block below and
// verify cold-start times in production:
//
//   try {
//     Font.register({
//       family: 'Cormorant Garamond',
//       src: 'https://...your-stable-cdn.../CormorantGaramond-Bold.ttf'
//     });
//   } catch (err) { console.warn('[pdf] cormorant register failed', err); }
//
// Until then docTitleSerif uses Helvetica Bold + tracking 4pt for poise.
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

const HORIZONTAL_PADDING_DENSE = 44;   // page 2/3
const HORIZONTAL_PADDING_WIDE = 60;    // page 1, generous margins

// ---------- Shared styles ----------
export const styles = StyleSheet.create({
	page: {
		backgroundColor: COLORS.bg,
		color: COLORS.text,
		fontFamily: FONTS.body,
		fontSize: 10,
		paddingTop: 0,
		paddingHorizontal: 0,
		paddingBottom: 50
	},

	// Dense inner wrapper, used by Page 2 (Invoice) and Page 3 (Kitchen) where
	// operational data needs the horizontal real-estate.
	contentInner: {
		paddingHorizontal: HORIZONTAL_PADDING_DENSE,
		paddingTop: 10
	},
	// Wide inner wrapper, used by Page 1 (customer + internal-summary) for the
	// fine-dining-confirmation aesthetic. 60pt side margins, ample breathing
	// room above the field grid.
	contentInnerWide: {
		paddingHorizontal: HORIZONTAL_PADDING_WIDE,
		paddingTop: 16
	},

	// ---------- Brand panel (top of page 1) ----------
	// Full-bleed midnight panel with a navy gradient shade at the bottom.
	// Logo, wordmark, italic gold tagline. No "Est. 2010", no ornament row.
	brandBand: {
		backgroundColor: COLORS.midnight,
		paddingTop: 26,
		paddingBottom: 24,
		paddingHorizontal: HORIZONTAL_PADDING_WIDE,
		alignItems: 'center',
		position: 'relative'
	},
	// Compact brand panel for Page 2 (Invoice) and Page 3 (Kitchen).
	brandBandCompact: {
		backgroundColor: COLORS.midnight,
		paddingTop: 9,
		paddingBottom: 9,
		paddingHorizontal: HORIZONTAL_PADDING_DENSE,
		alignItems: 'center',
		position: 'relative'
	},
	brandBandShade: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		height: 50,
		backgroundColor: COLORS.navy,
		opacity: 0.55
	},
	brandBandShadeMid: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 14,
		height: 32,
		backgroundColor: COLORS.navySoft,
		opacity: 0.30
	},
	brandBandRule: {
		height: 2,
		backgroundColor: COLORS.gold
	},
	brandLogo: { width: 56, height: 56, marginBottom: 6 },
	brandLogoLarge: { width: 72, height: 72, marginBottom: 10 },
	brandLogoSmall: { width: 38, height: 38, marginBottom: 4 },
	brandName: {
		fontFamily: FONTS.bold,
		fontSize: 20,
		color: COLORS.cream,
		marginBottom: 4
	},
	brandTagline: {
		fontFamily: FONTS.italic,
		fontSize: 10.5,
		color: COLORS.gold
	},

	// ---------- Document title block (Page 1, minimal) ----------
	// A single thin gold rule centered above, then the title in Helvetica Bold
	// with 4pt tracking for serif-feel poise, in plum, centered. Ample
	// whitespace before and after so the title reads as a statement piece.
	docTitleEyebrowRule: {
		alignSelf: 'center',
		width: 56,
		height: 0.6,
		backgroundColor: COLORS.gold,
		marginTop: 8,
		marginBottom: 6
	},
	docTitleSerif: {
		fontFamily: FONTS.bold,
		fontSize: 18,
		color: COLORS.plum,
		textAlign: 'center',
		letterSpacing: 4,
		marginTop: 4,
		marginBottom: 18
	},

	// ---------- Document title block (Page 2 INVOICE, smaller, no flanking) ----------
	docTitleInvoice: {
		fontFamily: FONTS.bold,
		fontSize: 14,
		color: COLORS.plum,
		textAlign: 'center',
		letterSpacing: 3,
		marginTop: 6,
		marginBottom: 8
	},

	// ---------- Field grid (Page 1, customer + internal-summary) ----------
	// Clean two-column layout. NO row dividers, NO column borders, NO alt-row
	// tints. Generous vertical spacing. Plum small-caps label, midnight body
	// value. Bigger value font (11pt) so the data lifts off the page.
	fieldRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		paddingVertical: 5
	},
	fieldLabel: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.plum,
		width: 148,
		paddingRight: 14,
		paddingTop: 3
	},
	fieldValue: {
		fontFamily: FONTS.body,
		fontSize: 11,
		color: COLORS.midnight,
		flex: 1,
		lineHeight: 1.45
	},
	fieldValueBold: {
		fontFamily: FONTS.bold,
		fontSize: 11,
		color: COLORS.midnight,
		flex: 1,
		lineHeight: 1.45
	},
	dietBadge: {
		fontFamily: FONTS.italic,
		fontSize: 9.5,
		color: COLORS.gold
	},

	// Customer reference line at end of page 1 (centered, italic, muted).
	customerReference: {
		marginTop: 18,
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center'
	},

	// ---------- Section eyebrow (Page 2 + Page 3 ONLY) ----------
	// Small-caps gold text with a thin gold underline rule. Replaces the old
	// gold-accent-bar + plum-text section header. Cleaner and reads as
	// restraint rather than ornament.
	sectionEyebrow: {
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.gold,
		paddingBottom: 4,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid',
		marginTop: 10,
		marginBottom: 8
	},
	sectionEyebrowCompact: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		paddingBottom: 2,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid',
		marginTop: 5,
		marginBottom: 3
	},

	// ---------- Page 2 invoice meta ----------
	gstLine: {
		fontSize: 9,
		color: COLORS.muted,
		marginBottom: 6,
		textAlign: 'center'
	},

	// ---------- Order line-item table (Page 2, minimal) ----------
	// Reads like a thoughtfully-typeset restaurant check, not a procurement
	// template. Thin gold rule above + below the column header. NO alt-row
	// tints, NO heavy plum stripes. Faint gold rule between each line item
	// for legibility; midnight body text; column header in small-caps gold.
	tableHeaderRow: {
		flexDirection: 'row',
		paddingTop: 8,
		paddingBottom: 5,
		paddingHorizontal: 4,
		borderTopWidth: 0.6,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid',
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},
	tableHeaderCell: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.gold
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 6,
		paddingHorizontal: 4,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.goldFaint,
		borderBottomStyle: 'solid',
		alignItems: 'flex-start'
	},
	colProduct: { flex: 3.4, paddingRight: 8 },
	colQty: { flex: 0.7, textAlign: 'right', paddingRight: 8 },
	colUnit: { flex: 1, textAlign: 'right', paddingRight: 8 },
	colPrice: { flex: 1.1, textAlign: 'right' },
	cellText: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.midnight },
	cellTextBold: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.midnight },
	priceCell: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.midnight },

	// ---------- Totals block (Page 2, minimal) ----------
	// Right-aligned subtotal/tax/total. Subtotal + tax in muted small-caps
	// labels with midnight regular amounts. Thin gold rule above the Total
	// line. Total line: gold "TOTAL" small-caps eyebrow + midnight bold
	// 14pt amount, right-aligned. No plum stripe.
	totalsBlock: {
		marginTop: 12,
		alignItems: 'flex-end'
	},
	totalsRow: {
		flexDirection: 'row',
		paddingVertical: 3,
		paddingHorizontal: 4,
		minWidth: 220,
		justifyContent: 'flex-end'
	},
	totalsLabel: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.muted,
		paddingRight: 16,
		textAlign: 'right'
	},
	totalsAmount: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.midnight,
		minWidth: 80,
		textAlign: 'right'
	},
	totalsRule: {
		alignSelf: 'flex-end',
		width: 220,
		height: 0.6,
		backgroundColor: COLORS.gold,
		marginTop: 6,
		marginBottom: 6
	},
	// Total stacked vertically: gold "TOTAL" eyebrow on top, midnight bold
	// amount below. Both right-aligned so they line up flush with the
	// subtotal and tax rows above.
	totalLabelMinimal: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		textAlign: 'right',
		paddingRight: 4,
		marginBottom: 2
	},
	totalAmountMinimal: {
		fontFamily: FONTS.bold,
		fontSize: 16,
		color: COLORS.midnight,
		textAlign: 'right',
		paddingRight: 4
	},

	// ---------- Page 2 footer block ----------
	thankYou: {
		marginTop: 22,
		fontFamily: FONTS.italic,
		fontSize: 13,
		color: COLORS.plum,
		textAlign: 'center'
	},
	revisionsLine: {
		marginTop: 6,
		fontSize: 9,
		color: COLORS.muted,
		textAlign: 'center'
	},
	closingEmail: {
		marginTop: 4,
		fontSize: 9,
		color: COLORS.gold,
		textAlign: 'center'
	},

	// ---------- Page 3 (kitchen) ----------
	kitchenHeader: {
		fontFamily: FONTS.bold,
		fontSize: 17,
		color: COLORS.cream,
		textAlign: 'center',
		marginTop: 2,
		marginBottom: 3,
		letterSpacing: 2
	},
	kitchenSubhead: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		textAlign: 'center',
		marginTop: 1,
		marginBottom: 1
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
		color: COLORS.plum,
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
		paddingVertical: 7,
		paddingHorizontal: 10,
		backgroundColor: COLORS.plum
	},
	portHeaderItem: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.cream,
		flex: 2.4
	},
	portHeaderPortions: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.cream,
		flex: 1,
		textAlign: 'right',
		paddingRight: 8
	},
	portHeaderNotes: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.cream,
		flex: 2.6
	},
	portRow: {
		flexDirection: 'row',
		paddingVertical: 3,
		paddingHorizontal: 10,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.goldFaint,
		borderBottomStyle: 'solid',
		alignItems: 'flex-start'
	},
	portRowAlt: { backgroundColor: COLORS.white },
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
		color: COLORS.plum,
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
		paddingVertical: 2.5,
		paddingHorizontal: 4,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.goldFaint,
		borderBottomStyle: 'solid'
	},
	threeColCellLabel: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.plum,
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

	// Pre-delivery checklist
	checklistItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 2,
		gap: 8
	},
	checkbox: {
		width: 11,
		height: 11,
		borderWidth: 1,
		borderColor: COLORS.gold,
		borderStyle: 'solid',
		backgroundColor: COLORS.white
	},
	checklistText: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text
	},

	// ---------- Footer (page-number row, all pages) ----------
	// One thin gold top rule, "Sula Indian Catering · Vancouver since 2010"
	// centered-left in muted text, page number right. No plum band, no ornaments.
	footer: {
		position: 'absolute',
		bottom: 22,
		left: HORIZONTAL_PADDING_DENSE,
		right: HORIZONTAL_PADDING_DENSE,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 6,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	// Wider footer for Page 1 to match the wider content margins.
	footerWide: {
		position: 'absolute',
		bottom: 22,
		left: HORIZONTAL_PADDING_WIDE,
		right: HORIZONTAL_PADDING_WIDE,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 6,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	footerText: {
		fontSize: 8.5,
		color: COLORS.muted
	},
	footerDot: {
		fontSize: 8.5,
		color: COLORS.gold,
		fontFamily: FONTS.bold
	},
	footerTextConfidential: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.plum
	},

	// Faint elephant watermark on internal pages
	pageWatermark: {
		position: 'absolute',
		top: 280,
		left: 180,
		right: 180,
		opacity: 0.05,
		width: 240,
		height: 240,
		alignSelf: 'center'
	},

	// SAMPLE watermark (sample preview only)
	sampleWatermark: {
		position: 'absolute',
		top: 320,
		left: 0,
		right: 0,
		textAlign: 'center',
		fontFamily: FONTS.bold,
		fontSize: 110,
		color: COLORS.gold,
		opacity: 0.10,
		transform: 'rotate(-30deg)'
	}
});
