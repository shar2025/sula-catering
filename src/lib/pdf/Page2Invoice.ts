// Page 2 — The Estimate (receipt of dreams).
// Plum-dominant page with smaller hero band (logo + reference number).
// Cream card with menu-style line items (gold dotted leaders), then a
// gold-bordered total card at the right with the total in giant Cormorant
// italic gold. "Preliminary" stamp rotated in the corner. Revisions policy
// + GST# in the footer.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS, LOGO_URL } from './styles.js';
import type { InvoiceOrder } from './InvoicePdf.js';

const e = React.createElement;

function fmtMoney(n: number | undefined): string {
	if (n === undefined || n === null || !Number.isFinite(n)) return '';
	return '$' + n.toFixed(2);
}

function pageFooter() {
	return e(
		View,
		{ style: styles.footer, fixed: true },
		e(Text, { style: styles.footerLight }, 'Sula Indian Catering · Vancouver since 2010 · sulacatering.com'),
		e(
			Text,
			{
				style: styles.footerLight,
				render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
					`${pageNumber} of ${totalPages}`
			}
		)
	);
}

export function renderPage2(order: InvoiceOrder) {
	const q = order.quote;
	const lineItems = q && q.line_items ? q.line_items : [];
	const guestStr = order.guestCount === undefined ? '' : String(order.guestCount);
	const eventTypeDisplay = order.eventType ? order.eventType.charAt(0).toUpperCase() + order.eventType.slice(1).replace('-', ' ') : 'Catering';

	const subStr = fmtMoney(q?.subtotal);
	const taxStr = fmtMoney(q?.tax_amount);
	const totalStr = fmtMoney(q?.total);
	const taxLabel = q?.tax_label || 'GST 5%';

	return e(
		Page,
		{ size: 'LETTER', style: styles.pageDark },

		// Smaller hero band (logo + reference)
		e(
			View,
			{ style: styles.hero2Band },
			e(
				View,
				{ style: styles.hero2Left },
				e(Image as unknown as React.ComponentType<Record<string, unknown>>, { src: LOGO_URL, style: styles.hero2Logo }),
				e(Text, { style: styles.hero2BrandText }, 'Sula Indian Catering')
			),
			e(
				View,
				{ style: styles.hero2RefBox },
				e(Text, { style: styles.hero2RefLabel }, 'Reference'),
				e(Text, { style: styles.hero2RefValue }, order.reference)
			)
		),

		// Cream content card with menu-style line items
		e(
			View,
			{ style: styles.creamCard },
			e(View, { style: styles.creamCardAccent }),
			e(Text, { style: styles.sectionEyebrow }, eventTypeDisplay + (guestStr ? ' for ' + guestStr + ' guests' : '')),
			e(
				Text,
				{ style: styles.estimateTitle },
				'Your ',
				e(Text, { style: styles.estimateTitleGold }, 'Estimate')
			),
			e(Text, { style: styles.estimateSub }, order.eventDate ? 'For your event on ' + order.eventDate : ''),

			// Line items as menu rows
			...lineItems.map((li) =>
				e(
					View,
					{ style: styles.menuRow, key: li.label },
					e(Text, { style: styles.menuItem }, li.label),
					e(View, { style: styles.menuLeader }),
					e(Text, { style: styles.menuPrice }, fmtMoney(li.amount))
				)
			),

			// Total card (right-aligned)
			(subStr || taxStr || totalStr) && e(
				View,
				{ style: styles.totalCard },
				subStr && e(View, { style: styles.totalRow },
					e(Text, { style: styles.totalLabel }, 'Subtotal'),
					e(Text, { style: styles.totalValue }, subStr)
				),
				taxStr && e(View, { style: styles.totalRow },
					e(Text, { style: styles.totalLabel }, taxLabel),
					e(Text, { style: styles.totalValue }, taxStr)
				),
				totalStr && e(View, { style: styles.totalRowFinal },
					e(Text, { style: styles.totalLabelFinal }, 'Total'),
					e(Text, { style: styles.totalValueFinal }, totalStr)
				)
			),

			// Revisions policy
			e(
				View,
				{ style: styles.revisions },
				e(
					Text,
					{ style: styles.revisionsText },
					q?.disclaimer || 'Preliminary estimate based on what you\'ve shared. Final quote in writing from the events team.'
				),
				e(
					Text,
					{ style: styles.revisionsText },
					'Revisions welcome up to 72 hours before the event · 2 included · $25 each thereafter.'
				),
				e(Text, { style: styles.gstLine }, 'GST# 874529506 RT0001')
			)
		),

		// Preliminary stamp (rotated, top-right of cream card)
		e(
			View,
			{ style: styles.stamp },
			e(Text, { style: styles.stampText }, 'Preliminary · final quote from events team')
		),

		pageFooter()
	);
}
