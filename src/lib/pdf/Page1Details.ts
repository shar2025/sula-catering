// Page 1, Catering Details.
// Audience-aware title:
//   forCustomer=true  → "CATERING SUBMISSION RECORD"
//                       (at the customer stage it's neither an invoice nor a
//                       final quote, just a record of their request, the
//                       events team will follow up with the formal quote)
//   forCustomer=false → "CATERING INVOICE"
//                       (page 1 of the formal events-team copy)
//
// Layout: full-bleed midnight brand band at the top, gold dividing rule,
// document title block, label/value field grid, gold-accented footer.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder, MenuLine } from './InvoicePdf.js';

const e = React.createElement;

// Middle dot (·) is U+00B7. Avoid em/en dashes anywhere in the document.
const LOCATIONS = 'Commercial Drive  ·  Main Street  ·  Davie Street  ·  Sula Cafe';
const CONTACT_LINE_LEFT = 'events.sula@gmail.com';
const CONTACT_LINE_RIGHT = 'sulaindianrestaurant.com';
const STANDARD_INCLUDES = 'Tandoori Naan, Garlic Naan, Basmati Rice, Mango Chutney, Hot Sauce & Lentil Wafers';

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

function fieldRow(label: string, value: string | undefined, opts: { bold?: boolean; diet?: string; index: number } = { index: 0 }) {
	if (!value) return null;
	const baseStyle = opts.index % 2 === 1 ? { ...styles.fieldRow, ...styles.fieldRowAlt } : styles.fieldRow;
	return e(
		View,
		{ style: baseStyle, key: `${label}-${opts.index}` },
		e(Text, { style: styles.fieldLabel }, label),
		e(
			Text,
			{ style: opts.bold ? styles.fieldValueBold : styles.fieldValue },
			value,
			opts.diet ? e(Text, { style: styles.dietBadge }, '  (', opts.diet, ')') : null
		)
	);
}

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
			e(Text, { style: styles.brandTagline }, 'Bold spices. Warm hospitality.'),
			e(Text, { style: styles.brandEst }, 'Est. 2010'),
			// Gold ornament row: thin rule  ◆  thin rule
			e(
				View,
				{ style: styles.brandOrnamentRow },
				e(View, { style: styles.brandOrnamentRule }),
				e(Text, { style: styles.brandOrnamentGlyph }, '◆'),
				e(View, { style: styles.brandOrnamentRule })
			)
		),
		e(View, { style: styles.brandBandRule })
	);
}

function pageFooter() {
	return e(
		View,
		{ style: styles.footer, fixed: true },
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

	// Build the field rows. Pass an `index` into fieldRow so we can zebra-stripe
	// the visible (non-null) ones. We push in render order then re-index after
	// filtering nulls so the alternation reads cleanly.
	const rawRows: { label: string; value: string | undefined; bold?: boolean; diet?: string }[] = [];
	rawRows.push({ label: 'Name', value: order.contact?.name, bold: true });
	if (order.contact?.phone) rawRows.push({ label: 'Phone', value: order.contact.phone });
	if (order.contact?.email) rawRows.push({ label: 'Email', value: order.contact.email });
	rawRows.push({ label: 'Event Date (dd/mm/yyyy)', value: eventDateText, bold: true });
	rawRows.push({ label: 'Delivery Time', value: deliveryTimeText });
	rawRows.push({ label: 'Event Address', value: addressText });
	rawRows.push({ label: 'Event Type', value: eventTypeText });
	if (guestStr) rawRows.push({ label: 'Number of Guests', value: guestStr });
	for (const r of curryRows) {
		rawRows.push({ label: r.label, value: r.value, diet: r.diet });
	}
	if (curryRows.length === 0 && order.menuTier) {
		rawRows.push({ label: 'Menu', value: order.menuTier });
	}
	if (order.spiceLevel) rawRows.push({ label: 'Spice Level', value: order.spiceLevel });
	rawRows.push({ label: 'Includes', value: STANDARD_INCLUDES });
	if (order.additionalMenuItems) {
		rawRows.push({ label: 'Additional Menu Items', value: order.additionalMenuItems });
	} else if (order.addOns && order.addOns.length) {
		rawRows.push({ label: 'Additional Menu Items', value: order.addOns.join(', ') });
	}
	if (order.paymentMethod) rawRows.push({ label: 'Method of Payment', value: order.paymentMethod });

	const visible = rawRows.filter((r) => r.value);
	const fieldRows = visible.map((r, i) =>
		fieldRow(r.label, r.value, { bold: r.bold, diet: r.diet, index: i })
	);

	const docTitle = opts.forCustomer ? 'CATERING SUBMISSION RECORD' : 'CATERING INVOICE';

	return e(
		Page,
		{ size: 'LETTER', style: styles.page },

		brandBand(opts.logoBuffer),

		// Inner padded content
		e(
			View,
			{ style: styles.contentInner },

			// Document title block: thin gold rule  ◆  TITLE  ◆  thin gold rule
			e(
				View,
				{ style: styles.docTitleWrap },
				e(
					View,
					{ style: styles.docTitleRow },
					e(View, { style: styles.docTitleSideRule }),
					e(Text, { style: styles.docTitleOrnament }, '◆'),
					e(Text, { style: styles.docTitle }, docTitle),
					e(Text, { style: styles.docTitleOrnament }, '◆'),
					e(View, { style: styles.docTitleSideRule })
				)
			),

			e(Text, { style: styles.locationsLine }, LOCATIONS),
			e(Text, { style: styles.cityLine }, 'Vancouver, BC'),
			e(
				Text,
				{ style: styles.contactLine },
				CONTACT_LINE_LEFT,
				e(Text, { style: { color: COLORS.gold } }, '  ·  '),
				CONTACT_LINE_RIGHT
			),

			e(View, { style: styles.headerRule }),

			// Section: Catering Details (gold diamond ornament + plum text)
			e(
				View,
				{ style: styles.section },
				e(Text, { style: styles.sectionOrnament }, '◆'),
				e(Text, { style: styles.sectionText }, 'Catering Details')
			),

			// Field grid
			e(View, null, ...fieldRows),

			// Reference number (small, end of page 1)
			e(
				Text,
				{ style: { ...styles.contactLine, marginTop: 14, fontSize: 8.5 } },
				`Reference: ${order.reference}`
			),

			// Closing italic line
			e(
				Text,
				{ style: styles.page1Footer },
				'Visit Sula Cafe for Breakfast, Brunch & Finger Food Catering'
			)
		),

		// Optional sample watermark
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}
