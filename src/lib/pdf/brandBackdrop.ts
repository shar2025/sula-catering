// Brand backdrop, the dark midnight->navy gradient + low-opacity gold diamond
// pattern that bookends the page (header band at top, footer band at bottom).
//
// Implementation notes:
//   1) Linear gradient via SVG <LinearGradient> (well-supported in @react-pdf).
//   2) Diamond pattern: @react-pdf/renderer 4.5.1 does NOT export <Pattern>,
//      so we generate a grid of <Path> diamonds programmatically. Density
//      is sparse enough (~80 diamonds on a 612x170 header) that render
//      cost is negligible.
//   3) Uses U+25C6 was banned earlier because Helvetica/WinAnsi has no
//      glyph for it. The diamonds here are SVG paths, not text glyphs, so
//      they're rendered as actual vector shapes and don't depend on font
//      coverage.

import React from 'react';
import { Svg, Defs, LinearGradient, Stop, Rect, G, Path } from '@react-pdf/renderer';

const e = React.createElement;

// Color tokens, kept inline so this module doesn't import from styles.ts and
// create a circular dep (styles.ts may import this helper later).
const MIDNIGHT = '#0a1628';
const NAVY = '#142442';
const GOLD = '#b8956a';

// Tile spacing for the diamond pattern. 32pt feels balanced on the header,
// not so tight it looks busy, not so loose it disappears. We offset alternate
// rows by half a tile width for a damask-style stagger.
const TILE = 32;
const HALF = TILE / 2;
const DIAMOND_HALF = 5; // diamond radius (half-width). 10pt across.
// Stroke is the visible part; opacity stays low so the texture is felt
// rather than seen.
const STROKE_OPACITY = 0.10;
const STROKE_WIDTH = 0.5;

function diamondPath(cx: number, cy: number, half: number): string {
	// Rhombus centered at (cx, cy), half-diagonal `half` in both axes.
	return `M${cx} ${cy - half} L${cx + half} ${cy} L${cx} ${cy + half} L${cx - half} ${cy} Z`;
}

// Generate the staggered diamond grid for the given band dimensions.
function diamondGrid(width: number, height: number): React.ReactNode[] {
	const paths: React.ReactNode[] = [];
	let key = 0;
	for (let row = 0; row * HALF < height + HALF; row++) {
		const cy = row * HALF;
		const rowOffset = row % 2 === 0 ? 0 : HALF;
		for (let col = -1; col * TILE + rowOffset < width + TILE; col++) {
			const cx = col * TILE + rowOffset + HALF;
			if (cx < -DIAMOND_HALF || cx > width + DIAMOND_HALF) continue;
			if (cy < -DIAMOND_HALF || cy > height + DIAMOND_HALF) continue;
			paths.push(
				e(Path, {
					key: `d${key++}`,
					d: diamondPath(cx, cy, DIAMOND_HALF),
					stroke: GOLD,
					strokeOpacity: STROKE_OPACITY,
					strokeWidth: STROKE_WIDTH,
					fill: 'none'
				})
			);
		}
	}
	return paths;
}

// Returns an absolutely-positioned SVG element that renders the gradient
// background + diamond grid for a band of the given width x height.
//
// IMPORTANT: this element MUST be the FIRST child of its parent View so
// later children (logo, wordmark, footer copy) render on top. The SVG is
// position: absolute so it doesn't take part in flex layout.
export function brandBackdrop(width: number, height: number, gradientId: string) {
	return e(
		Svg,
		{
			width,
			height,
			viewBox: `0 0 ${width} ${height}`,
			style: { position: 'absolute', top: 0, left: 0 }
		} as Record<string, unknown>,
		e(
			Defs,
			null,
			e(
				LinearGradient as unknown as React.ComponentType<Record<string, unknown>>,
				{ id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' },
				e(Stop, { offset: '0', stopColor: MIDNIGHT } as Record<string, unknown>),
				e(Stop, { offset: '1', stopColor: NAVY } as Record<string, unknown>)
			)
		),
		// Gradient layer
		e(Rect, {
			x: 0,
			y: 0,
			width,
			height,
			fill: `url(#${gradientId})`
		} as Record<string, unknown>),
		// Diamond pattern overlay
		e(G, null, ...diamondGrid(width, height))
	);
}

// Centered "rule + diamond + rule" section divider, mirroring the website's
//   ─── ◆ ───
// pattern. Pure SVG, gold filled diamond, no font-glyph dependency. Default
// 80pt wide, 12pt tall, with a 6pt-radius diamond in the center.
export function goldDiamondDivider(width = 80, height = 12) {
	const diamondHalf = 3.5; // 7pt across
	const gap = 6;           // pt between rule end and diamond edge
	const cx = width / 2;
	const cy = height / 2;
	const ruleY = cy - 0.3;
	const ruleEnd = cx - diamondHalf - gap;
	return e(
		Svg,
		{ width, height, viewBox: `0 0 ${width} ${height}` } as Record<string, unknown>,
		// Left rule
		e(Rect, { x: 0, y: ruleY, width: ruleEnd, height: 0.6, fill: GOLD } as Record<string, unknown>),
		// Right rule
		e(Rect, {
			x: cx + diamondHalf + gap,
			y: ruleY,
			width: ruleEnd,
			height: 0.6,
			fill: GOLD
		} as Record<string, unknown>),
		// Filled diamond at center
		e(Path, {
			d: diamondPath(cx, cy, diamondHalf),
			fill: GOLD
		} as Record<string, unknown>)
	);
}
