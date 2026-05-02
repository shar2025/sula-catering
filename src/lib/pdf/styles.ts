// Sula PDF style system, elevated to match the brand aesthetic of the live
// Sula chat panel (Neela) and the marketing site:
//   midnight + navy backgrounds for the masthead band
//   plum accents for headings and total stripe
//   gold rules, dividers, badges, brand marks, prices
//   cream text against dark, dark text against light
//
// Pages still print cleanly black-on-white in the body so the document stays
// readable when printed: the rich brand colour lives in the masthead band,
// section rules, table chrome, and footer. Body text is dark on white for
// legibility and contrast on cheap office printers.
//
// LETTER-SPACING POLICY: tracking stays at 0 on every multi-letter run.
// pdftotext extracts wide-tracked uppercase as separate glyphs ("D I E TA R Y")
// which breaks search and screen-reader flow. All emphasis comes from font
// weight, size, colour, fill, and underlines, not letter spacing.
//
// CHARACTER POLICY: never use em dashes (U+2014) or en dashes (U+2013) in any
// label, separator, or copy. Use commas, periods, or middle dot (·, U+00B7).

import { Font, StyleSheet } from '@react-pdf/renderer';

// ---------- Brand palette ----------
// Lifted from the chat panel (Neela.astro) and the live site CSS variables.
export const COLORS = {
	// Body ink + neutrals
	black: '#000000',
	text: '#1a1a1a',
	textSoft: '#3a3a3a',
	muted: '#6b6b6b',
	rule: '#1a1a1a',
	ruleSoft: '#cccccc',
	bg: '#ffffff',
	zebra: '#fbf6ec',          // very faint cream, alternating row bg
	creamSoft: '#fbf6ec',      // alias for soft cream surface
	zebraDark: '#f0e5d0',      // darker tint inside totals stripe

	// Brand
	midnight: '#0a1628',
	navy: '#142442',
	plum: '#25042d',
	plumSoft: '#3d1547',
	gold: '#b8956a',
	goldSoft: '#d4b88a',
	goldFaint: 'rgba(184,149,106,0.32)',
	cream: '#f5ede0',
	creamMuted: 'rgba(245,237,224,0.78)'
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
// Use react-pdf's built-in Helvetica family; bundling external fonts (Playfair,
// Cormorant) into Vercel serverless was unreliable and the font fetch can hang
// the renderer cold-start. Brand richness comes from colour + weight + size.
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

// Page geometry. Keep the page itself padding-free so we can render full-bleed
// brand bands at the top of every page. Content sits inside `contentInner`
// which carries the horizontal padding.
const HORIZONTAL_PADDING = 44;

// ---------- Shared styles ----------
export const styles = StyleSheet.create({
	page: {
		backgroundColor: COLORS.bg,
		color: COLORS.text,
		fontFamily: FONTS.body,
		fontSize: 10,
		paddingTop: 0,
		paddingHorizontal: 0,
		paddingBottom: 56
	},

	// Inner content wrapper, applies the body horizontal padding so brand bands
	// can break out to the page edge.
	contentInner: {
		paddingHorizontal: HORIZONTAL_PADDING,
		paddingTop: 18
	},

	// ---------- Brand band (top of every page) ----------
	// Solid midnight band with the elephant logo + Sula wordmark + tagline.
	// Two stacked Views (midnight then navy) approximate a soft gradient.
	brandBand: {
		backgroundColor: COLORS.midnight,
		paddingTop: 24,
		paddingBottom: 18,
		paddingHorizontal: HORIZONTAL_PADDING,
		alignItems: 'center'
	},
	brandBandShade: {
		// Lower half of the band, slightly lighter to fake a vertical gradient
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		height: 28,
		backgroundColor: COLORS.navy,
		opacity: 0.85
	},
	brandBandRule: {
		height: 2,
		backgroundColor: COLORS.gold
	},
	brandLogo: { width: 52, height: 52, marginBottom: 8 },
	brandLogoSmall: { width: 36, height: 36, marginBottom: 6 },
	brandName: {
		fontFamily: FONTS.bold,
		fontSize: 19,
		color: COLORS.cream,
		marginBottom: 3
	},
	brandTagline: {
		fontFamily: FONTS.italic,
		fontSize: 10.5,
		color: COLORS.gold,
		marginBottom: 2
	},
	brandEst: {
		fontSize: 8.5,
		color: COLORS.creamMuted
	},

	// ---------- Document title block (below brand band) ----------
	docTitleWrap: {
		alignItems: 'center',
		marginTop: 14,
		marginBottom: 4
	},
	docTitle: {
		fontFamily: FONTS.bold,
		fontSize: 18,
		color: COLORS.plum,
		textAlign: 'center'
	},
	docTitleRule: {
		marginTop: 8,
		width: 64,
		height: 1.4,
		backgroundColor: COLORS.gold
	},
	locationsLine: {
		fontSize: 9.5,
		color: COLORS.textSoft,
		textAlign: 'center',
		marginTop: 10,
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
		borderTopWidth: 0.6,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid',
		marginTop: 6,
		marginBottom: 12
	},

	// ---------- Section header (across all pages) ----------
	// Larger, gold ink, with a thicker gold underline rule. Renders as a
	// horizontal block so we can prepend a small gold square accent.
	section: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 10,
		marginBottom: 8,
		paddingBottom: 4,
		borderBottomWidth: 0.8,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},
	sectionAccent: {
		width: 4,
		height: 12,
		backgroundColor: COLORS.gold,
		marginRight: 8
	},
	sectionText: {
		fontFamily: FONTS.bold,
		fontSize: 12.5,
		color: COLORS.plum
	},

	// Compact gold-rule section header used on Page 3 (kitchen sheet).
	sectionGold: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 12,
		marginBottom: 4,
		paddingBottom: 2,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},
	sectionGoldAccent: {
		width: 3,
		height: 10,
		backgroundColor: COLORS.gold,
		marginRight: 6
	},
	sectionGoldText: {
		fontFamily: FONTS.bold,
		fontSize: 10.5,
		color: COLORS.plum
	},

	// ---------- Two-column field grid (Page 1 details) ----------
	fieldRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		paddingVertical: 4,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
		borderBottomStyle: 'solid'
	},
	fieldRowAlt: {
		backgroundColor: COLORS.zebra
	},
	fieldLabel: {
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.plum,
		width: 160,
		paddingRight: 8,
		paddingLeft: 4
	},
	fieldValue: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		lineHeight: 1.4,
		paddingRight: 4
	},
	fieldValueBold: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.text,
		flex: 1,
		lineHeight: 1.4,
		paddingRight: 4
	},
	dietBadge: {
		fontFamily: FONTS.italic,
		fontSize: 9,
		color: COLORS.gold
	},

	// ---------- Page 1 footer block ----------
	page1Footer: {
		marginTop: 18,
		paddingTop: 10,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.gold,
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
		paddingHorizontal: 12,
		backgroundColor: COLORS.gold,
		borderRadius: 2
	},
	subtotalChipText: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.midnight
	},

	// ---------- Order line-item table (Page 2) ----------
	tableHeaderRow: {
		flexDirection: 'row',
		paddingVertical: 7,
		paddingHorizontal: 10,
		backgroundColor: COLORS.plum,
		marginBottom: 0
	},
	tableHeaderCell: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.cream
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 6,
		paddingHorizontal: 10,
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
	priceCell: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.plum },
	totalRow: {
		flexDirection: 'row',
		paddingVertical: 10,
		paddingHorizontal: 10,
		backgroundColor: COLORS.plum,
		marginTop: 4,
		alignItems: 'center'
	},
	totalLabel: {
		fontFamily: FONTS.bold,
		fontSize: 12,
		color: COLORS.cream,
		flex: 5.1,
		textAlign: 'right',
		paddingRight: 8
	},
	totalValue: {
		fontFamily: FONTS.bold,
		fontSize: 13,
		color: COLORS.gold,
		flex: 1.1,
		textAlign: 'right'
	},

	// ---------- Page 2 footer block ----------
	thankYou: {
		marginTop: 22,
		fontFamily: FONTS.italic,
		fontSize: 12,
		color: COLORS.plum,
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
		color: COLORS.gold,
		textAlign: 'center'
	},

	// ---------- Page 3 (kitchen) ----------
	kitchenHeader: {
		fontFamily: FONTS.bold,
		fontSize: 17,
		color: COLORS.cream,
		textAlign: 'center',
		marginTop: 4
	},
	kitchenSubhead: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		textAlign: 'center',
		marginTop: 4,
		marginBottom: 2
	},

	// 2-col header field block on Page 3
	twoColRow: { flexDirection: 'row' },
	twoColCell: { flex: 1 },
	kitchenFieldRow: {
		flexDirection: 'row',
		paddingVertical: 2.5,
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
		paddingVertical: 6,
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
		paddingVertical: 4,
		paddingHorizontal: 10,
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
		paddingVertical: 3.5,
		paddingHorizontal: 4,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.ruleSoft,
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
		paddingVertical: 2.5,
		gap: 8
	},
	checkbox: {
		width: 10,
		height: 10,
		borderWidth: 0.8,
		borderColor: COLORS.gold,
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
		bottom: 22,
		left: HORIZONTAL_PADDING,
		right: HORIZONTAL_PADDING,
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

	// ---------- Faint elephant watermark on internal pages ----------
	pageWatermark: {
		position: 'absolute',
		top: 260,
		left: 180,
		right: 180,
		opacity: 0.06,
		width: 240,
		height: 240,
		alignSelf: 'center'
	},

	// ---------- SAMPLE watermark (sample preview only) ----------
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
