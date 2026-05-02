// Sula PDF style system. Plum-dominant editorial layout that mirrors
// sulacatering.com's hero gradient + cream-card pattern. Same visual DNA
// you see on the catering site, in Neela's chat, and the Sula Café surface.
//
// Page backgrounds are plum (#25042d) for the dominant brand color.
// Hero bands are navy/midnight gradients (approximated as solid bands since
// react-pdf doesn't support full-page CSS gradients).
// Content lives on cream cards (#f5ede0) for legibility.

import { Font, StyleSheet } from '@react-pdf/renderer';

// ---------- Brand palette ----------
export const COLORS = {
	midnight: '#0a1628',
	midnightDeep: '#050b15',
	navy: '#142442',
	navyMid: '#1c2f54',
	plum: '#25042d',
	plumDeep: '#1a0420',
	plumRich: '#4a1554',
	gold: '#b8956a',
	goldDeep: '#9a7a52',
	goldLight: '#d4b572',
	goldShimmer: '#e8c987',
	cream: '#f5ede0',
	creamSoft: '#ede4d3',
	darkText: '#1a1a1a',
	mutedText: '#6b6357',
	white: '#ffffff'
};

// ---------- Logo URL ----------
export const LOGO_URL = 'https://sulacatering.com/apple-touch-icon.png';

// ---------- Font registration ----------
let fontsRegistered = false;
export function ensureFonts(): void {
	if (fontsRegistered) return;
	try {
		Font.register({
			family: 'Cormorant',
			fonts: [
				{ src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjQAllvuQWJ4VsKi4.ttf', fontWeight: 400 },
				{ src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3WmX5slCNuHLi8bLeY9MK7whWMhyjYrEPjuw.ttf', fontWeight: 400, fontStyle: 'italic' },
				{ src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjQDFhvuQWJ4VsKi4.ttf', fontWeight: 600 },
				{ src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3WmX5slCNuHLi8bLeY9MK7whWMhyjYNkjjuw.ttf', fontWeight: 600, fontStyle: 'italic' }
			]
		});
		Font.register({
			family: 'Montserrat',
			fonts: [
				{ src: 'https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm45_dJE7gnD-w.ttf', fontWeight: 400 },
				{ src: 'https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm45_bZF3gnD-w.ttf', fontWeight: 600 },
				{ src: 'https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm45_dJE3gnD-w.ttf', fontWeight: 700 }
			]
		});
		fontsRegistered = true;
	} catch (err) {
		console.warn('[pdf] font registration failed, falling back to Helvetica', err);
	}
}

export const FONTS = {
	heading: 'Cormorant',
	body: 'Montserrat',
	helvetica: 'Helvetica'
};

// ---------- Shared styles ----------
export const styles = StyleSheet.create({
	// Plum-dominant pages (1 & 2) and full-plum page (3)
	pageDark: {
		backgroundColor: COLORS.plum,
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.cream,
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: 0
	},

	// PAGE 1 — welcome hero band (midnight → plum approximated as stacked navy + plum)
	heroBand: {
		backgroundColor: COLORS.midnight,
		paddingTop: 60,
		paddingBottom: 44,
		paddingHorizontal: 36,
		alignItems: 'center'
	},
	heroBandInner: {
		alignItems: 'center'
	},
	heroLogo: { width: 64, height: 64, marginBottom: 16 },
	heroEyebrow: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.gold,
		letterSpacing: 4,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 10
	},
	heroBrand: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 22,
		color: COLORS.cream,
		letterSpacing: 0.5,
		fontWeight: 600,
		marginBottom: 18
	},
	heroBrandGold: {
		color: COLORS.goldLight
	},
	heroDiamond: {
		fontFamily: FONTS.helvetica,
		fontSize: 10,
		color: COLORS.gold,
		marginVertical: 6
	},
	heroCustomerLabel: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.gold,
		letterSpacing: 3,
		textTransform: 'uppercase',
		fontWeight: 600,
		marginTop: 22,
		marginBottom: 6
	},
	heroCustomerName: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 32,
		color: COLORS.goldShimmer,
		letterSpacing: 0.4,
		fontWeight: 600,
		textAlign: 'center'
	},

	// Cream content card floating on the plum page
	creamCard: {
		marginHorizontal: 36,
		marginTop: 36,
		marginBottom: 60,
		padding: 28,
		backgroundColor: COLORS.cream,
		borderWidth: 1,
		borderColor: COLORS.gold,
		borderStyle: 'solid'
	},
	creamCardAccent: {
		// Top gold accent strip on cards (1px high)
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: 2,
		backgroundColor: COLORS.gold
	},

	// Section label inside cream card (tracked uppercase gold)
	sectionEyebrow: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.gold,
		letterSpacing: 2.5,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 4
	},
	sectionTitle: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 20,
		color: COLORS.midnight,
		letterSpacing: 0.3,
		fontWeight: 600,
		marginBottom: 16
	},
	sectionTitleGold: {
		color: COLORS.gold
	},

	// Diamond divider row
	diamondRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		marginVertical: 14
	},
	diamondLine: {
		flex: 1,
		height: 0.5,
		backgroundColor: COLORS.gold,
		opacity: 0.4
	},
	diamondGlyph: {
		fontFamily: FONTS.helvetica,
		fontSize: 9,
		color: COLORS.gold,
		marginHorizontal: 8
	},

	// Two-column event details grid
	twoCol: { flexDirection: 'row', gap: 28 },
	col: { flex: 1 },
	fieldLabel: {
		fontFamily: FONTS.body,
		fontSize: 7.5,
		color: COLORS.gold,
		letterSpacing: 1.5,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 4,
		marginTop: 12
	},
	fieldValue: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 14,
		color: COLORS.midnight,
		lineHeight: 1.4,
		fontWeight: 500
	},
	fieldValueSmall: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.darkText,
		lineHeight: 1.55
	},

	// PAGE 2 — smaller hero band
	hero2Band: {
		backgroundColor: COLORS.midnight,
		paddingTop: 36,
		paddingBottom: 28,
		paddingHorizontal: 36,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between'
	},
	hero2Left: { flexDirection: 'row', alignItems: 'center', gap: 14 },
	hero2Logo: { width: 40, height: 40 },
	hero2BrandText: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 14,
		color: COLORS.goldLight,
		letterSpacing: 0.4
	},
	hero2RefBox: { alignItems: 'flex-end' },
	hero2RefLabel: {
		fontFamily: FONTS.body,
		fontSize: 7.5,
		color: COLORS.gold,
		letterSpacing: 2.5,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 4
	},
	hero2RefValue: {
		fontFamily: FONTS.body,
		fontSize: 14,
		color: COLORS.goldShimmer,
		letterSpacing: 1.5,
		fontWeight: 700
	},
	estimateTitle: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 30,
		color: COLORS.midnight,
		letterSpacing: 0.3,
		fontWeight: 600,
		marginBottom: 6
	},
	estimateTitleGold: {
		color: COLORS.gold
	},
	estimateSub: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 12,
		color: COLORS.mutedText,
		marginBottom: 20
	},

	// Menu-style line items table
	menuRow: {
		flexDirection: 'row',
		alignItems: 'baseline',
		paddingVertical: 9,
		borderBottomWidth: 0.5,
		borderBottomColor: COLORS.plum,
		borderBottomStyle: 'solid'
	},
	menuItem: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 13,
		color: COLORS.midnight,
		flexShrink: 1,
		minWidth: 0
	},
	menuLeader: {
		flex: 1,
		marginHorizontal: 8,
		alignSelf: 'flex-end',
		height: 1,
		borderBottomWidth: 0.6,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'dotted',
		marginBottom: 3,
		opacity: 0.55
	},
	menuQty: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.mutedText,
		letterSpacing: 1.5,
		textTransform: 'uppercase',
		marginRight: 12,
		minWidth: 60,
		textAlign: 'right'
	},
	menuPrice: {
		fontFamily: FONTS.body,
		fontSize: 12,
		color: COLORS.gold,
		fontWeight: 700,
		textAlign: 'right',
		minWidth: 70
	},

	// Total card (right-aligned, gold-bordered)
	totalCard: {
		marginTop: 22,
		marginLeft: 'auto',
		width: 240,
		padding: 16,
		borderWidth: 1.5,
		borderColor: COLORS.gold,
		borderStyle: 'solid',
		backgroundColor: COLORS.white
	},
	totalRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 3
	},
	totalLabel: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.mutedText,
		letterSpacing: 1.2,
		textTransform: 'uppercase',
		fontWeight: 600
	},
	totalValue: {
		fontFamily: FONTS.body,
		fontSize: 11,
		color: COLORS.darkText,
		textAlign: 'right'
	},
	totalRowFinal: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'baseline',
		paddingTop: 12,
		marginTop: 8,
		borderTopWidth: 1,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	totalLabelFinal: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 14,
		color: COLORS.midnight,
		letterSpacing: 0.3,
		fontWeight: 600
	},
	totalValueFinal: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 22,
		color: COLORS.gold,
		textAlign: 'right',
		fontWeight: 700
	},

	// Preliminary stamp (rotated, top-right of estimate page)
	stamp: {
		position: 'absolute',
		top: 156,
		right: 38,
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderWidth: 1.2,
		borderColor: COLORS.gold,
		borderStyle: 'solid',
		transform: 'rotate(6deg)',
		opacity: 0.85
	},
	stampText: {
		fontFamily: FONTS.body,
		fontSize: 7,
		color: COLORS.gold,
		letterSpacing: 2.5,
		textTransform: 'uppercase',
		fontWeight: 700
	},

	// Revisions policy footer
	revisions: {
		marginTop: 26,
		paddingTop: 14,
		paddingBottom: 4,
		borderTopWidth: 0.5,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	revisionsText: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 9.5,
		color: COLORS.mutedText,
		lineHeight: 1.6,
		textAlign: 'center'
	},
	gstLine: {
		fontFamily: FONTS.body,
		fontSize: 7.5,
		color: COLORS.mutedText,
		letterSpacing: 1.2,
		textAlign: 'center',
		marginTop: 6
	},

	// PAGE 3 — full plum, kitchen sheet
	kitchenHero: {
		paddingTop: 40,
		paddingBottom: 30,
		paddingHorizontal: 36,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 16
	},
	kitchenLogo: { width: 40, height: 40 },
	kitchenHeroText: { flex: 1 },
	kitchenHeroEyebrow: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.goldShimmer,
		letterSpacing: 4,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 4
	},
	kitchenHeroTitle: {
		fontFamily: FONTS.body,
		fontSize: 24,
		color: COLORS.cream,
		letterSpacing: 6,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 6
	},
	kitchenHeroSub: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 11,
		color: COLORS.goldLight,
		letterSpacing: 0.5
	},

	// Body section on plum (with cream cards inside)
	kitchenBody: {
		paddingHorizontal: 36,
		paddingBottom: 60
	},

	// Inverted cream card for customer info on plum
	invertedCard: {
		flexDirection: 'row',
		gap: 14,
		padding: 14,
		backgroundColor: COLORS.cream,
		marginBottom: 18
	},
	invertedCol: { flex: 1 },
	invertedColTitle: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.gold,
		letterSpacing: 1.6,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 6
	},
	invertedColLine: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.darkText,
		lineHeight: 1.55
	},
	invertedColLineHero: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 13,
		color: COLORS.midnight,
		fontWeight: 600,
		lineHeight: 1.4
	},

	// Gold-outlined card on plum (Setup, Delivery)
	plumCard: {
		marginTop: 14,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.gold,
		borderStyle: 'solid'
	},
	plumCardLabel: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.gold,
		letterSpacing: 1.6,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginBottom: 6
	},
	plumCardLine: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.cream,
		lineHeight: 1.55
	},
	plumCardLineMuted: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: 'rgba(245, 237, 224, 0.65)',
		lineHeight: 1.55
	},

	// Portioning table on plum (cream type, gold portions)
	portTitle: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.gold,
		letterSpacing: 2,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginTop: 18,
		marginBottom: 8
	},
	portTableHeader: {
		flexDirection: 'row',
		paddingVertical: 8,
		paddingHorizontal: 10,
		backgroundColor: COLORS.midnight,
		borderTopWidth: 1,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	portRow: {
		flexDirection: 'row',
		paddingVertical: 7,
		paddingHorizontal: 10,
		alignItems: 'baseline',
		borderBottomWidth: 0.5,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid',
		opacity: 1
	},
	portRowAlt: {
		backgroundColor: 'rgba(255, 255, 255, 0.03)'
	},
	portCellHeader: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.goldShimmer,
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		fontWeight: 700
	},
	portCellHeaderItem: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.goldShimmer,
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		fontWeight: 700,
		flex: 1.6
	},
	portCellHeaderQty: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.goldShimmer,
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		fontWeight: 700,
		flex: 0.7,
		textAlign: 'right'
	},
	portCellHeaderNotes: {
		fontFamily: FONTS.body,
		fontSize: 8,
		color: COLORS.goldShimmer,
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		fontWeight: 700,
		flex: 2.3,
		textAlign: 'right'
	},
	portRowAltMerged: {
		flexDirection: 'row',
		paddingVertical: 7,
		paddingHorizontal: 10,
		alignItems: 'baseline',
		borderBottomWidth: 0.5,
		borderBottomColor: COLORS.gold,
		borderBottomStyle: 'solid',
		backgroundColor: 'rgba(255, 255, 255, 0.03)'
	},
	portCellItem: {
		fontFamily: FONTS.body,
		fontSize: 10,
		color: COLORS.cream,
		flex: 1.6
	},
	portCellPortions: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontWeight: 700,
		fontSize: 18,
		color: COLORS.goldShimmer,
		flex: 0.7,
		textAlign: 'right'
	},
	portCellNotes: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 8.5,
		color: 'rgba(245, 237, 224, 0.55)',
		flex: 2.3,
		textAlign: 'right',
		lineHeight: 1.45
	},

	// Pre-delivery checklist
	checklistTitle: {
		fontFamily: FONTS.body,
		fontSize: 9,
		color: COLORS.gold,
		letterSpacing: 2,
		textTransform: 'uppercase',
		fontWeight: 700,
		marginTop: 18,
		marginBottom: 10
	},
	checklistGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap'
	},
	checklistItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 5,
		gap: 8,
		width: '50%'
	},
	checkbox: {
		width: 11,
		height: 11,
		borderWidth: 1,
		borderColor: COLORS.gold,
		borderStyle: 'solid'
	},
	checklistText: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 11,
		color: COLORS.cream
	},

	// Footers
	footer: {
		position: 'absolute',
		bottom: 22,
		left: 36,
		right: 36,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 8,
		borderTopWidth: 0.4,
		borderTopColor: COLORS.gold,
		borderTopStyle: 'solid'
	},
	footerLight: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 9,
		color: COLORS.mutedText,
		letterSpacing: 0.3
	},
	footerDark: {
		fontFamily: FONTS.heading,
		fontStyle: 'italic',
		fontSize: 9,
		color: 'rgba(245, 237, 224, 0.55)',
		letterSpacing: 0.3
	}
});
