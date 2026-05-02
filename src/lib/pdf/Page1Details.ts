// Page 1, Catering Details (customer-facing).
// Matches the format Sula's catering ops already uses: brand block with
// tagline + 4 locations + contact line, then a label/value field grid.
// Black-on-white, no full-bleed colour, no letter-spacing tricks.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles } from './styles.js';
import type { InvoiceOrder, MenuLine } from './InvoicePdf.js';

const e = React.createElement;

const LOCATIONS = 'Commercial Drive  ·  Main Street  ·  Davie Street  ·  Sula Cafe';
const CONTACT_LINE = 'events.sula@gmail.com  ·  sulaindianrestaurant.com';
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

// Group menu items by kind so we can render them as Veg Curry #1, Veg Curry #2,
// Vegan Curry #1, Non-Veg Curry #1 etc. Returns the list of label/value pairs
// to slot into the field grid.
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

function fieldRow(label: string, value: string | undefined, opts: { bold?: boolean; diet?: string } = {}) {
	if (!value) return null;
	return e(
		View,
		{ style: styles.fieldRow, key: label },
		e(Text, { style: styles.fieldLabel }, label),
		e(
			Text,
			{ style: opts.bold ? styles.fieldValueBold : styles.fieldValue },
			value,
			opts.diet ? e(Text, { style: styles.dietBadge }, '  (', opts.diet, ')') : null
		)
	);
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

	const rows: React.ReactNode[] = [];
	rows.push(fieldRow('Name', order.contact?.name, { bold: true }));
	if (order.contact?.phone) rows.push(fieldRow('Phone', order.contact.phone));
	if (order.contact?.email) rows.push(fieldRow('Email', order.contact.email));
	rows.push(fieldRow('Event Date (dd/mm/yyyy)', eventDateText, { bold: true }));
	rows.push(fieldRow('Delivery Time', deliveryTimeText));
	rows.push(fieldRow('Event Address', addressText));
	rows.push(fieldRow('Event Type', eventTypeText));
	if (guestStr) rows.push(fieldRow('Number of Guests', guestStr));
	for (const r of curryRows) {
		rows.push(fieldRow(r.label, r.value, { diet: r.diet }));
	}
	if (curryRows.length === 0 && order.menuTier) {
		rows.push(fieldRow('Menu', order.menuTier));
	}
	if (order.spiceLevel) rows.push(fieldRow('Spice Level', order.spiceLevel));
	rows.push(fieldRow('Includes', STANDARD_INCLUDES));
	if (order.additionalMenuItems) {
		rows.push(fieldRow('Additional Menu Items', order.additionalMenuItems));
	} else if (order.addOns && order.addOns.length) {
		rows.push(fieldRow('Additional Menu Items', order.addOns.join(', ')));
	}
	if (order.paymentMethod) rows.push(fieldRow('Method of Payment', order.paymentMethod));

	const filteredRows = rows.filter(Boolean);

	return e(
		Page,
		{ size: 'LETTER', style: styles.page },

		// Brand block
		e(
			View,
			{ style: styles.brandBlock },
			opts.logoBuffer && e(Image as unknown as React.ComponentType<Record<string, unknown>>, { src: opts.logoBuffer, style: styles.brandLogo }),
			e(Text, { style: styles.brandName }, 'Sula Indian Restaurant'),
			e(Text, { style: styles.brandTagline }, 'Bold spices. Warm hospitality.'),
			e(Text, { style: styles.brandEst }, 'Est. 2010')
		),

		e(Text, { style: styles.docTitle }, 'CATERING INVOICE'),

		e(Text, { style: styles.locationsLine }, LOCATIONS),
		e(Text, { style: styles.cityLine }, 'Vancouver, BC'),
		e(Text, { style: styles.contactLine }, CONTACT_LINE),

		e(View, { style: styles.headerRule }),

		// Section: Catering Details
		e(Text, { style: styles.section }, 'Catering Details'),

		// Field grid
		e(View, null, ...filteredRows),

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
		),

		// Optional sample watermark
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}
