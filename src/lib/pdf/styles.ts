// Sula PDF style system, elevated to match the live sulacatering.com aesthetic:
// midnight + navy header panel, cream warm body, plum accents, gold rules and
// ornaments throughout. Reads like a fine-dining catering presentation, not an
// invoice with a brand sticker on top.
//
// COLOUR PHILOSOPHY:
//   page base   = cream (#f5ede0)        warm restaurant tablecloth feel
//   alt rows    = white (#ffffff)        pop against the cream
//   header band = midnight to navy       deep, considered, signature
//   accents     = gold (#b8956a) and plum (#25042d)
//
// LETTER-SPACING POLICY: tracking stays at 0 on every multi-letter run.
// pdftotext extracts wide-tracked uppercase as separate glyphs ("D I E TA R Y")
// which breaks search and screen-reader flow. All emphasis comes from font
// weight, size, colour, fill, and underlines, not letter spacing.
//
// CHARACTER POLICY: never use em dashes (U+2014) or en dashes (U+2013) in any
// label, separator, or copy. Use commas, periods, middle dot (·, U+00B7), or
// the gold diamond ornament (◆, U+25C6) as decorative separators.

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
	ruleSoft: '#cfc4ad',        // warm cream-toned rule on cream base
	bg: '#f5ede0',              // page base, soft cream (was #ffffff)
	white: '#ffffff',           // alt-row pop colour on cream base
	zebra: '#ffffff',           // alternating row bg, white on cream base
	creamSoft: '#fbf6ec',       // very faint cream surface
	zebraDark: '#ebe0c8',       // darker tint for emphasis blocks

	// Brand
	midnight: '#0a1628',
	navy: '#142442',
	navySoft: '#1c2f55',        // mid-tone navy for gradient layer
	plum: '#25042d',
	plumSoft: '#3d1547',
	gold: '#b8956a',
	goldSoft: '#d4b88a',
	goldDeep: '#9b7b54',         // darker gold for inner ornament accents
	goldFaint: 'rgba(184,149,106,0.32)',
	cream: '#f5ede0',
	creamMuted: 'rgba(245,237,224,0.78)',
	creamDim: 'rgba(245,237,224,0.55)'
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
		paddingBottom: 50
	},

	// Inner content wrapper, applies the body horizontal padding so brand bands
	// can break out to the page edge.
	contentInner: {
		paddingHorizontal: HORIZONTAL_PADDING,
		paddingTop: 10
	},

	// ---------- Brand panel (top of every page) ----------
	// Full-bleed midnight panel, taller than a thin band. Logo enlarged, name
	// in bigger weight, italic gold tagline, gold ornament line below.
	// A second View at the bottom acts as a navy gradient shade so the
	// midnight->navy transition reads as a soft vertical gradient on cheap
	// printers and on screen.
	brandBand: {
		backgroundColor: COLORS.midnight,
		paddingTop: 22,
		paddingBottom: 22,
		paddingHorizontal: HORIZONTAL_PADDING,
		alignItems: 'center',
		position: 'relative'
	},
	// Compact variant used on Page 2 (Invoice) and Page 3 (Kitchen) so the
	// document doesn't burn a quarter of every page on chrome. Same midnight
	// background + gold rule, just less vertical padding and a smaller logo.
	brandBandCompact: {
		backgroundColor: COLORS.midnight,
		paddingTop: 11,
		paddingBottom: 11,
		paddingHorizontal: HORIZONTAL_PADDING,
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
	brandLogoLarge: { width: 70, height: 70, marginBottom: 8 },
	brandLogoSmall: { width: 38, height: 38, marginBottom: 4 },
	brandName: {
		fontFamily: FONTS.bold,
		fontSize: 20,
		color: COLORS.cream,
		marginBottom: 3
	},
	brandTagline: {
		fontFamily: FONTS.italic,
		fontSize: 10.5,
		color: COLORS.gold,
		marginBottom: 4
	},
	brandEst: {
		fontSize: 8.5,
		color: COLORS.creamMuted,
		marginBottom: 3
	},
	// Gold ornament row inside the brand band: ◆  Sula Indian Restaurant  ◆
	// Used by Page 1; we also use a thin gold rule + diamond combo for Page 2/3.
	brandOrnamentRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 4
	},
	brandOrnamentRule: {
		width: 32,
		height: 0.7,
		backgroundColor: COLORS.gold,
		marginHorizontal: 8
	},
	brandOrnamentGlyph: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold
	},

	// ---------- Document title block (below brand band) ----------
	// Centered title flanked by gold diamond ornaments and thin gold rules.
	// Sits on the cream page surface immediately below the midnight panel.
	docTitleWrap: {
		alignItems: 'center',
		marginTop: 10,
		marginBottom: 2
	},
	docTitleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 4
	},
	docTitleSideRule: {
		flex: 1,
		height: 0.6,
		backgroundColor: COLORS.gold,
		maxWidth: 110
	},
	docTitleOrnament: {
		fontFamily: FONTS.bold,
		fontSize: 11,
		color: COLORS.gold,
		marginHorizontal: 8
	},
	docTitle: {
		fontFamily: FONTS.bold,
		fontSize: 16,
		color: COLORS.plum,
		textAlign: 'center',
		marginHorizontal: 6
	},
	docTitleSmall: {
		fontFamily: FONTS.bold,
		fontSize: 14,
		color: COLORS.plum,
		textAlign: 'center',
		marginHorizontal: 6
	},
	locationsLine: {
		fontSize: 9,
		color: COLORS.textSoft,
		textAlign: 'center',
		marginTop: 6,
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
		marginTop: 4,
		marginBottom: 6
	},

	// ---------- Section header (across all pages) ----------
	// Gold diamond ornament + plum text + thin gold underline rule.
	section: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 4,
		marginBottom: 6,
		paddingBottom: 3,
		borderBottomWidth: 0.8,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},
	sectionOrnament: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.gold,
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
		marginTop: 6,
		marginBottom: 3,
		paddingBottom: 2,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid'
	},
	sectionGoldOrnament: {
		fontFamily: FONTS.bold,
		fontSize: 9,
		color: COLORS.gold,
		marginRight: 6
	},
	sectionGoldText: {
		fontFamily: FONTS.bold,
		fontSize: 10.5,
		color: COLORS.plum
	},

	// ---------- Two-column field grid (Page 1 details) ----------
	// On the cream base, alternate rows pop white. The faint gold-tinted rule
	// underneath each row reads as a thin restaurant menu divider.
	fieldRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		paddingVertical: 3.5,
		paddingHorizontal: 6,
		borderBottomWidth: 0.4,
		borderBottomColor: COLORS.goldFaint,
		borderBottomStyle: 'solid'
	},
	fieldRowAlt: {
		backgroundColor: COLORS.white
	},
	fieldLabel: {
		fontFamily: FONTS.bold,
		fontSize: 9.5,
		color: COLORS.plum,
		width: 160,
		paddingRight: 8
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
		marginTop: 14,
		paddingTop: 8,
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
	// Subtotal "chip" floats top-right above the table. Gold-bordered cream
	// fill so it reads as a restraint accent, not a heavy gold block.
	subtotalChip: {
		alignSelf: 'flex-end',
		marginTop: 4,
		marginBottom: 8,
		paddingVertical: 4,
		paddingHorizontal: 12,
		backgroundColor: COLORS.white,
		borderWidth: 0.8,
		borderColor: COLORS.gold,
		borderStyle: 'solid',
		borderRadius: 2
	},
	subtotalChipLabel: {
		fontFamily: FONTS.bold,
		fontSize: 8.5,
		color: COLORS.muted,
		marginRight: 6
	},
	subtotalChipText: {
		fontFamily: FONTS.bold,
		fontSize: 10,
		color: COLORS.plum
	},

	// ---------- Order line-item table (Page 2) ----------
	tableHeaderRow: {
		flexDirection: 'row',
		paddingVertical: 8,
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
		borderBottomColor: COLORS.goldFaint,
		borderBottomStyle: 'solid',
		alignItems: 'flex-start'
	},
	tableRowAlt: {
		backgroundColor: COLORS.white
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
		paddingVertical: 12,
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
		fontSize: 14,
		color: COLORS.gold,
		flex: 1.1,
		textAlign: 'right'
	},

	// ---------- Page 2 footer block ----------
	thankYou: {
		marginTop: 16,
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
		marginBottom: 3
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

	// ---------- Footer (page-number row) ----------
	// Anchored 22pt above the bottom edge with a thin gold top rule, on a
	// transparent surface so the cream page bg shows through.
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
		top: 280,
		left: 180,
		right: 180,
		opacity: 0.05,
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
