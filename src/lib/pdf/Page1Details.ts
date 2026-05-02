// Page 1, Catering Details, fine-dining-confirmation aesthetic.
//
// Audience-aware title:
//   forCustomer=true  -> "CATERING SUBMISSION RECORD"
//                       (the customer's record of their request, the events
//                        team will follow up with the formal quote in writing)
//   forCustomer=false -> "CATERING INVOICE"
//                       (page 1 of the formal events-team copy)
//
// Layout philosophy: a wedding invitation, not an invoice template. Generous
// whitespace, no row dividers, no column borders, no alt-row tints, no
// "Catering Details" section header. Plum small caps labels, midnight body
// values. Reference number sits at the bottom centered, italic, muted.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder, MenuLine } from './InvoicePdf.js';

const e = React.createElement;

function formatEventDate(s: string | undefined): string {
	if (!s) return '';
	const d = new Date(s);
	if (isNaN(d.getTime())) return s;
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const yyyy = d.getFullYear();
	return `${dd}/${mm}/${yyyy}`;
}

function locationLine(order: InvoiceOrder): string {
	if (order.deliveryAddress) return order.deliveryAddress;
	const loc = order.location;
	if (!loc) return '';
	if (loc.venueOrAddress && loc.city) return `${loc.venueOrAddress}, ${loc.city}`;
	return loc.venueOrAddress || loc.city || '';
}

function eventTypeLabel(order: InvoiceOrder): string {
	if (!order.eventType) return '';
	const raw = order.eventType.replace(/[-_]+/g, ' ');
	return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const STANDARD_INCLUDES = 'Tandoori Naan, Garlic Naan, Basmati Rice, Mango Chutney, Hot Sauce & Lentil Wafers';

function menuItemRows(items: MenuLine[] | undefined): { label: string; value: string; diet?: string }[] {
	if (!items || items.length === 0) return [];
	const groups: Record<MenuLine['kind'], MenuLine[]> = { veg: [], vegan: [], nonveg: [], appetizer: [] };
	for (const it of items) {
		if (groups[it.kind]) groups[it.kind].push(it);
	}
	const rows: { label: string; value: string; diet?: string }[] = [];
	for (const [i, m] of groups.veg.entries()) {
		rows.push({ label: `Veg Curry #${i + 1}`, value: m.name, diet: m.diet });
	}
	for (const [i, m] of groups.vegan.entries()) {
		rows.push({ label: `Vegan Curry #${i + 1}`, value: m.name, diet: m.diet });
	}
	for (const [i, m] of groups.nonveg.entries()) {
		rows.push({ label: `Non-Veg Curry #${i + 1}`, value: m.name, diet: m.diet });
	}
	for (const [i, m] of groups.appetizer.entries()) {
		rows.push({ label: groups.appetizer.length === 1 ? 'Appetizer' : `Appetizer #${i + 1}`, value: m.name, diet: m.diet });
	}
	return rows;
}

// Plum small caps label (uppercased), midnight value, no border, no bg.
function fieldRow(label: string, value: string | undefined, opts: { bold?: boolean; diet?: string; index: number } = { index: 0 }) {
	if (!value) return null;
	return e(
		View,
		{ style: styles.fieldRow, key: `${label}-${opts.index}` },
		e(Text, { style: styles.fieldLabel }, label.toUpperCase()),
		e(
			Text,
			{ style: opts.bold ? styles.fieldValueBold : styles.fieldValue },
			value,
			opts.diet ? e(Text, { style: styles.dietBadge }, '  (', opts.diet, ')') : null
		)
	);
}

// Brand band: midnight->navy panel with logo, wordmark, italic gold tagline.
// No "Est. 2010", no ornament glyphs (those substitute as garbage in
// Helvetica/WinAnsi).
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

export function renderPage1(
	order: InvoiceOrder,
	opts: { watermark?: string; logoBuffer?: Buffer | null; forCustomer?: boolean } = {}
) {
	const guestStr = order.guestCount === undefined ? '' : String(order.guestCount);
	const eventTypeText = eventTypeLabel(order);
	const addressText = locationLine(order) || (opts.forCustomer ? 'To be confirmed with the events team' : '');
	const deliveryTimeText = order.deliveryTime || order.timeWindow || '';
	const eventDateText = formatEventDate(order.eventDate) || order.eventDate || '';

	const curryRows = menuItemRows(order.menuItems);

	const rawRows: { label: string; value: string | undefined; bold?: boolean; diet?: string }[] = [];
	rawRows.push({ label: 'Name', value: order.contact?.name, bold: true });
	if (order.contact?.phone) rawRows.push({ label: 'Phone', value: order.contact.phone });
	if (order.contact?.email) rawRows.push({ label: 'Email', value: order.contact.email });
	rawRows.push({ label: 'Event Date', value: eventDateText, bold: true });
	rawRows.push({ label: 'Delivery Time', value: deliveryTimeText });
	rawRows.push({ label: 'Event Address', value: addressText });
	rawRows.push({ label: 'Event Type', value: eventTypeText });
	if (guestStr) rawRows.push({ label: 'Guests', value: guestStr });
	for (const r of curryRows) {
		rawRows.push({ label: r.label, value: r.value, diet: r.diet });
	}
	if (curryRows.length === 0 && order.menuTier) {
		rawRows.push({ label: 'Menu', value: order.menuTier });
	}
	if (order.spiceLevel) rawRows.push({ label: 'Spice Level', value: order.spiceLevel });
	rawRows.push({ label: 'Includes', value: STANDARD_INCLUDES });
	if (order.additionalMenuItems) {
		rawRows.push({ label: 'Additional Items', value: order.additionalMenuItems });
	} else if (order.addOns && order.addOns.length) {
		rawRows.push({ label: 'Additional Items', value: order.addOns.join(', ') });
	}
	if (order.paymentMethod) rawRows.push({ label: 'Payment', value: order.paymentMethod });

	const visible = rawRows.filter((r) => r.value);
	const fieldRows = visible.map((r, i) =>
		fieldRow(r.label, r.value, { bold: r.bold, diet: r.diet, index: i })
	);

	const docTitle = opts.forCustomer ? 'CATERING SUBMISSION RECORD' : 'CATERING INVOICE';

	return e(
		Page,
		{ size: 'LETTER', style: styles.page },

		brandBand(opts.logoBuffer),

		// Inner padded content (wide margins, generous whitespace)
		e(
			View,
			{ style: styles.contentInnerWide },

			// Single thin gold rule (eyebrow), then the title centered with whitespace
			e(View, { style: styles.docTitleEyebrowRule }),
			e(Text, { style: styles.docTitleSerif }, docTitle),

			// Field grid: clean two-column, no borders, no tints
			e(View, null, ...fieldRows),

			// Reference number, centered, italic, muted, at the bottom of the field block
			e(
				Text,
				{ style: styles.customerReference },
				`Reference  ${order.reference}`
			)
		),

		// Optional sample watermark
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}
