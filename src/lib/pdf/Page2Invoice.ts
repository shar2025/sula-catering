// Page 2, formal Invoice (customer-facing).
// 4-column line-item table (Product | Qty | Unit Price | Price), GST as a
// separate row, Total at the bottom. Subtotal floats above the table on the
// right. Matches the existing Sula catering invoice format.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles } from './styles.js';
import type { InvoiceOrder, InvoiceLineItem } from './InvoicePdf.js';

const e = React.createElement;

const LOCATIONS = 'Commercial Drive  ·  Main Street  ·  Davie Street  ·  Sula Cafe';
const CONTACT_LINE = 'events.sula@gmail.com  ·  sulaindianrestaurant.com';

function fmtMoney(n: number | undefined): string {
	if (n === undefined || n === null || !Number.isFinite(n)) return '';
	return '$' + n.toFixed(2);
}

function fmtQty(n: number | undefined): string {
	if (n === undefined || n === null || !Number.isFinite(n)) return '';
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function pageFooter() {
	return e(
		View,
		{ style: styles.footer, fixed: true },
		e(Text, { style: styles.footerText }, 'Sula Indian Catering  ·  Vancouver since 2010'),
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

// If the order has a menuTier with a $ amount and a guest count but the
// frontend didn't pass a structured `quote`, derive one. Keeps the Invoice
// page populated for real orders even when Neela hasn't computed pricing.
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

		// Brand block
		e(
			View,
			{ style: styles.brandBlock },
			opts.logoBuffer && e(Image as unknown as React.ComponentType<Record<string, unknown>>, { src: opts.logoBuffer, style: styles.brandLogo }),
			e(Text, { style: styles.brandName }, 'Sula Indian Restaurant'),
			e(Text, { style: styles.brandTagline }, 'Bold spices. Warm hospitality.')
		),
		e(Text, { style: styles.docTitle }, 'CATERING INVOICE'),
		e(Text, { style: styles.locationsLine }, LOCATIONS),
		e(Text, { style: styles.cityLine }, 'Vancouver, BC'),
		e(Text, { style: styles.contactLine }, CONTACT_LINE),
		e(Text, { style: styles.gstLine }, 'GST: 874529506 RT0001'),

		e(View, { style: styles.headerRule }),

		// Section + subtotal chip
		e(Text, { style: styles.section }, 'Order'),
		subStr && e(
			View,
			{ style: styles.subtotalChip },
			e(Text, { style: styles.subtotalChipText }, `SUBTOTAL  ${subStr}`)
		),

		// Table header
		e(
			View,
			{ style: styles.tableHeaderRow },
			e(Text, { style: { ...styles.tableHeaderCell, ...styles.colProduct } }, 'Product'),
			e(Text, { style: { ...styles.tableHeaderCell, ...styles.colQty } }, 'Qty'),
			e(Text, { style: { ...styles.tableHeaderCell, ...styles.colUnit } }, 'Unit Price'),
			e(Text, { style: { ...styles.tableHeaderCell, ...styles.colPrice } }, 'Price')
		),

		// Line item rows
		...items.map((li, i) =>
			e(
				View,
				{ style: i % 2 === 1 ? { ...styles.tableRow, ...styles.tableRowAlt } : styles.tableRow, key: `li-${i}` },
				e(Text, { style: { ...styles.cellText, ...styles.colProduct } }, li.label),
				e(Text, { style: { ...styles.cellText, ...styles.colQty } }, fmtQty(li.qty)),
				e(Text, { style: { ...styles.cellText, ...styles.colUnit } }, fmtMoney(li.unit_price)),
				e(Text, { style: { ...styles.cellText, ...styles.colPrice } }, fmtMoney(li.amount))
			)
		),

		// GST row (rendered as part of the table so it sits inside the line-item flow)
		taxStr && e(
			View,
			{ style: { ...styles.tableRow, ...(items.length % 2 === 1 ? styles.tableRowAlt : {}) } },
			e(Text, { style: { ...styles.cellText, ...styles.colProduct } }, taxLabel),
			e(Text, { style: { ...styles.cellText, ...styles.colQty } }, '1'),
			e(Text, { style: { ...styles.cellText, ...styles.colUnit } }, taxStr),
			e(Text, { style: { ...styles.cellText, ...styles.colPrice } }, taxStr)
		),

		// Total row (heavy rule above)
		totalStr && e(
			View,
			{ style: styles.totalRow },
			e(Text, { style: styles.totalLabel }, 'Total'),
			e(Text, { style: styles.totalValue }, totalStr)
		),

		// Closing block
		e(Text, { style: styles.thankYou }, 'Thank you for choosing Sula'),
		e(
			Text,
			{ style: styles.revisionsLine },
			'Revisions accepted up to 72 hours before the event  ·  2 free revisions  ·  $25 each thereafter'
		),
		e(Text, { style: styles.closingEmail }, 'events.sula@gmail.com'),

		// Optional sample watermark
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}
