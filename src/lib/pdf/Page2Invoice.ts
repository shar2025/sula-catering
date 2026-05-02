// Page 2, formal Invoice. Customer-facing: this is the line-items page the
// customer keeps after the team finalizes. Mirrors Page 1's restraint: same
// full brand band, same wide 60pt margins, same wide footer.
//
// 4-column line-item table (Product | Qty | Unit Price | Price). NO alt-row
// tints, NO subtotal chip, NO plum total stripe, NO watermark. Reads like a
// thoughtfully-typeset restaurant check: thin gold rules around the column
// header, faint gold rule between rows, right-aligned subtotal/tax in muted
// small-caps, and a clean Total line with gold "TOTAL" eyebrow above the
// midnight bold amount.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder, InvoiceLineItem } from './InvoicePdf.js';

const e = React.createElement;

function fmtMoney(n: number | undefined): string {
	if (n === undefined || n === null || !Number.isFinite(n)) return '';
	return '$' + n.toFixed(2);
}

function fmtQty(n: number | undefined): string {
	if (n === undefined || n === null || !Number.isFinite(n)) return '';
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Brand band, mirroring Page 1 exactly so the two pages read as one document
// when the customer flips between them. Same midnight->navy gradient, same
// 70pt elephant logo, same wordmark + italic gold tagline.
function brandBand(logoBuffer: Buffer | null | undefined) {
	return e(
		React.Fragment,
		null,
		e(
			View,
			{ style: styles.brandBand },
			e(View, { style: styles.brandBandShadeMid }),
			e(View, { style: styles.brandBandShade }),
			logoBuffer && e(
				Image as unknown as React.ComponentType<Record<string, unknown>>,
				{ src: logoBuffer, style: styles.brandLogoLarge }
			),
			e(Text, { style: styles.brandName }, 'Sula Indian Restaurant'),
			e(Text, { style: styles.brandTagline }, 'Bold spices. Warm hospitality.')
		),
		e(View, { style: styles.brandBandRule })
	);
}

function pageFooter() {
	return e(
		View,
		{ style: styles.footerWide, fixed: true },
		e(
			Text,
			{ style: styles.footerText },
			'Sula Indian Catering ',
			e(Text, { style: styles.footerDot }, ' · '),
			' Vancouver since 2010'
		),
		e(
			Text,
			{
				style: styles.footerText,
				render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
					`Page ${pageNumber} of ${totalPages}`
			}
		)
	);
}

function deriveQuote(order: InvoiceOrder): InvoiceOrder['quote'] | undefined {
	const guests = typeof order.guestCount === 'number'
		? order.guestCount
		: parseInt(String(order.guestCount || '0'), 10) || 0;
	if (guests <= 0) return undefined;
	const tierMatch = (order.menuTier || '').match(/\$([0-9]+(?:\.[0-9]+)?)/);
	if (!tierMatch) return undefined;
	const perGuest = parseFloat(tierMatch[1]);
	if (!Number.isFinite(perGuest) || perGuest <= 0) return undefined;

	const items: InvoiceLineItem[] = [];
	const baseLabel = (order.menuTier || 'Catering menu').replace(/\s*\([^)]*\)/g, '').trim() || 'Catering menu';
	items.push({ label: baseLabel, qty: guests, unit_price: perGuest, amount: round2(perGuest * guests) });

	if (order.addOns && order.addOns.length) {
		for (const a of order.addOns) {
			const m = a.match(/\$([0-9]+(?:\.[0-9]+)?)\s*\/?\s*guest/i);
			if (m) {
				const ppg = parseFloat(m[1]);
				const cleanLabel = a.replace(/\s*\([^)]*\)/, '').trim();
				items.push({ label: cleanLabel, qty: guests, unit_price: ppg, amount: round2(ppg * guests) });
			}
		}
	}

	if (order.platesAndCutlery === 'required') {
		const ppg = order.dinnerwarePerGuest ?? 6.9;
		items.push({ label: `Dinnerware ($${ppg.toFixed(2)}/Person)`, qty: guests, unit_price: ppg, amount: round2(ppg * guests) });
	}

	const setupLabel = order.setupStyle || (order.setupType ? formatSetupType(order.setupType) : 'Aluminium Trays');
	const isAlumi = /alum/i.test(setupLabel);
	items.push({ label: isAlumi ? 'Aluminium Trays (Free)' : setupLabel, qty: 1, unit_price: 0, amount: 0 });

	const km = typeof order.deliveryKm === 'number' ? order.deliveryKm : null;
	const delivery = computeDelivery(km);
	if (delivery) items.push(delivery);

	const subtotal = round2(items.reduce((s, it) => s + (it.amount || 0), 0));
	const tax = round2(subtotal * 0.05);
	const total = round2(subtotal + tax);
	return {
		line_items: items,
		subtotal,
		tax_label: 'GST 5%',
		tax_amount: tax,
		total,
		currency: 'CAD',
		disclaimer: 'Preliminary estimate. Final quote will come from the events team in writing.'
	};
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function formatSetupType(t: string): string {
	const map: Record<string, string> = {
		aluminium_trays: 'Aluminium Trays (Free)',
		stainless_steel: 'Stainless Steel Trays',
		heated_stainless: 'Heated Stainless Steel',
		copper: 'Copper Service'
	};
	return map[t] || t.replace(/_/g, ' ');
}

function computeDelivery(km: number | null): InvoiceLineItem | null {
	if (km === null) return { label: 'Delivery Fee (TBC)', qty: 1, unit_price: 0, amount: 0 };
	if (km <= 10) return { label: `Delivery Fee (${km.toFixed(1)} KM, free zone)`, qty: 1, unit_price: 0, amount: 0 };
	if (km <= 15) return { label: `Delivery Fee (${km.toFixed(1)} KM)`, qty: 1, unit_price: 5, amount: 5 };
	if (km <= 30) return { label: `Delivery Fee (${km.toFixed(1)} KM)`, qty: 1, unit_price: 15, amount: 15 };
	return { label: `Delivery Fee (${km.toFixed(1)} KM, manual review)`, qty: 1, unit_price: 0, amount: 0 };
}

export function renderPage2(
	order: InvoiceOrder,
	opts: { watermark?: string; logoBuffer?: Buffer | null; forCustomer?: boolean } = {}
) {
	const quote = (order.quote && order.quote.line_items && order.quote.line_items.length)
		? order.quote
		: deriveQuote(order);

	const items = quote?.line_items || [];
	const subStr = fmtMoney(quote?.subtotal);
	const taxStr = fmtMoney(quote?.tax_amount);
	const totalStr = fmtMoney(quote?.total);
	const taxLabel = quote?.tax_label || 'GST 5%';

	return e(
		Page,
		{ size: 'LETTER', style: styles.page },

		brandBand(opts.logoBuffer),

		// Inner padded content (wide margins matching Page 1, no watermark)
		e(
			View,
			{ style: styles.contentInnerWide },

			// Thin gold eyebrow rule + GST registration line. We drop a
			// separate "INVOICE" title here because Page 1's title already
			// reads "CATERING INVOICE"; repeating it on Page 2 would feel
			// procedural. The brand band + this gold rule + the GST line
			// make Page 2 feel like a continuation, not a new document.
			e(View, { style: styles.docTitleEyebrowRule }),
			e(Text, { style: styles.gstLine }, 'GST 874529506 RT0001'),

			// Section eyebrow (small caps gold + thin gold underline)
			e(Text, { style: styles.sectionEyebrow }, 'ORDER'),

			// Table header (small-caps gold column titles, gold rule top + bottom)
			e(
				View,
				{ style: styles.tableHeaderRow },
				e(Text, { style: { ...styles.tableHeaderCell, ...styles.colProduct } }, 'PRODUCT'),
				e(Text, { style: { ...styles.tableHeaderCell, ...styles.colQty } }, 'QTY'),
				e(Text, { style: { ...styles.tableHeaderCell, ...styles.colUnit } }, 'UNIT PRICE'),
				e(Text, { style: { ...styles.tableHeaderCell, ...styles.colPrice } }, 'PRICE')
			),

			// Line item rows (no alt-row tints, faint gold rule between rows)
			...items.map((li, i) =>
				e(
					View,
					{ style: styles.tableRow, key: `li-${i}` },
					e(Text, { style: { ...styles.cellText, ...styles.colProduct } }, li.label),
					e(Text, { style: { ...styles.cellText, ...styles.colQty } }, fmtQty(li.qty)),
					e(Text, { style: { ...styles.cellText, ...styles.colUnit } }, fmtMoney(li.unit_price)),
					e(Text, { style: { ...styles.priceCell, ...styles.colPrice } }, fmtMoney(li.amount))
				)
			),

			// Totals block: right-aligned Subtotal + GST in muted small-caps,
			// thin gold rule, then a clean Total line with gold eyebrow above
			// the midnight bold amount.
			e(
				View,
				{ style: styles.totalsBlock },
				subStr && e(
					View,
					{ style: styles.totalsRow },
					e(Text, { style: styles.totalsLabel }, 'SUBTOTAL'),
					e(Text, { style: styles.totalsAmount }, subStr)
				),
				taxStr && e(
					View,
					{ style: styles.totalsRow },
					e(Text, { style: styles.totalsLabel }, taxLabel.toUpperCase()),
					e(Text, { style: styles.totalsAmount }, taxStr)
				),
				totalStr && e(View, { style: styles.totalsRule }),
				totalStr && e(Text, { style: styles.totalLabelMinimal }, 'TOTAL'),
				totalStr && e(Text, { style: styles.totalAmountMinimal }, totalStr)
			),

			// Closing block, warm and personal
			e(Text, { style: styles.thankYou }, 'Thank you for choosing Sula'),
			e(
				Text,
				{ style: styles.revisionsLine },
				"We're excited to cook for your event. Reply to ",
				e(Text, { style: { color: COLORS.gold } }, 'events.sula@gmail.com'),
				' with any changes.'
			),
			e(
				Text,
				{ style: styles.revisionsLine },
				'Two complimentary revisions, then $25 each up to 72 hours before the event.'
			)
		),

		// Optional sample watermark
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}
