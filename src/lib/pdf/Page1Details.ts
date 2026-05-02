// Page 1, Catering Order welcome page.
// Plum-dominant page with midnight hero band, gold elephant logo, customer
// name set in giant Cormorant italic gold-shimmer, then a cream content card
// with two-column event details.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder } from './InvoicePdf.js';

const e = React.createElement;

function dietaryLine(d: InvoiceOrder['dietary']): string {
	if (!d) return '';
	const parts: string[] = [];
	if (typeof d.vegetarianPct === 'number') parts.push(`${d.vegetarianPct}% vegetarian`);
	if (d.hasJain) parts.push('Jain prep');
	if (d.hasVegan) parts.push('Vegan options');
	if (d.hasGlutenFree) parts.push('Gluten-free');
	if (d.hasDairyFree) parts.push('Dairy-free');
	if (d.hasNutAllergy) parts.push('Nut allergy flagged');
	if (d.hasShellfishAllergy) parts.push('Shellfish allergy flagged');
	if (d.notes) parts.push(d.notes);
	return parts.join(' · ');
}

function locationLine(loc: InvoiceOrder['location']): string {
	if (!loc) return '';
	if (loc.venueOrAddress && loc.city) return `${loc.venueOrAddress}, ${loc.city}`;
	return loc.venueOrAddress || loc.city || '';
}

function field(label: string, value: string | undefined, hero = false) {
	if (!value) return null;
	return e(
		View,
		null,
		e(Text, { style: styles.fieldLabel }, label),
		e(Text, { style: hero ? styles.fieldValue : styles.fieldValueSmall }, value)
	);
}

function diamondDivider() {
	return e(
		View,
		{ style: styles.diamondRow },
		e(View, { style: styles.diamondLine }),
		e(Text, { style: styles.diamondGlyph }, '◆'),
		e(View, { style: styles.diamondLine })
	);
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

export function renderPage1(
	order: InvoiceOrder,
	opts: { watermark?: string; logoBuffer?: Buffer | null; forCustomer?: boolean } = {}
) {
	const customerName = order.contact?.name || 'Your Order';
	const guestStr = order.guestCount === undefined ? 'TBD' : String(order.guestCount);
	const eventTypeDisplay = order.eventType
		? order.eventType.charAt(0).toUpperCase() + order.eventType.slice(1).replace('-', ' ')
		: 'Catering';

	const leftCol = [
		field('Event type', eventTypeDisplay, true),
		field('Date', order.eventDate, true),
		field('Time', order.timeWindow, true),
		field('Guests', guestStr, true),
		field('Service', order.serviceType, true),
		field('Location', locationLine(order.location), true)
	].filter(Boolean);

	const rightCol = [
		field('Menu tier', order.menuTier, true),
		order.addOns && order.addOns.length ? field('Add-ons', order.addOns.join(' · ')) : null,
		field('Setup style', order.setupStyle),
		field('Dietary', dietaryLine(order.dietary)),
		order.notes ? field('Customer notes', order.notes) : null
	].filter(Boolean);

	const heroEyebrowText = `CATERING ORDER · ${formatDateForEyebrow(order.eventDate || order.createdAt)}`;

	return e(
		Page,
		{ size: 'LETTER', style: styles.pageDark },
		// Hero band
		e(
			View,
			{ style: styles.heroBand },
			opts.logoBuffer && e(Image as unknown as React.ComponentType<Record<string, unknown>>, { src: opts.logoBuffer, style: styles.heroLogo }),
			e(Text, { style: styles.heroEyebrow }, heroEyebrowText),
			e(
				Text,
				{ style: styles.heroBrand },
				'Sula Indian',
				e(Text, { style: styles.heroBrandGold }, ' Catering')
			),
			e(Text, { style: styles.heroDiamond }, '◆'),
			e(Text, { style: styles.heroCustomerLabel }, 'Prepared for'),
			e(Text, { style: styles.heroCustomerName }, customerName)
		),

		// Cream content card
		e(
			View,
			{ style: styles.creamCard },
			e(View, { style: styles.creamCardAccent }),
			e(Text, { style: styles.sectionEyebrow }, opts.forCustomer ? 'For your records' : 'Your event'),
			e(
				Text,
				{ style: styles.sectionTitle },
				'The ',
				e(Text, { style: styles.sectionTitleGold }, 'details')
			),
			e(
				View,
				{ style: styles.twoCol },
				e(View, { style: styles.col }, ...leftCol),
				e(View, { style: styles.col }, ...rightCol)
			),
			diamondDivider(),
			e(Text, { style: styles.fieldLabel }, 'Reference'),
			e(Text, { style: styles.fieldValue }, order.reference),
			// Customer-copy-only note: sets expectations that pricing follows from
			// the events team in writing, NOT from this PDF. Renders as a quiet
			// italic line under the reference number.
			opts.forCustomer && e(
				Text,
				{ style: styles.forRecordsNote },
				'Quote request received. The events team will send your written quote within one business day. Booking confirms once you review and approve that quote, no charge or commitment until then.'
			)
		),

		// Optional rotated watermark behind the content (used by sample preview)
		opts.watermark && e(Text, { style: styles.sampleWatermark }, opts.watermark),

		pageFooter()
	);
}

function formatDateForEyebrow(s: string | undefined): string {
	if (!s) return '';
	const d = new Date(s);
	if (isNaN(d.getTime())) return s.toUpperCase();
	return d
		.toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Vancouver' })
		.toUpperCase();
}
