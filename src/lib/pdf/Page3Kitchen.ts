// Page 3 — Kitchen Order Sheet (back of house drama).
// Full plum #25042d background with cream type. Inverted cream card for
// customer info, navy-band table headers with gold portion column in giant
// Cormorant italic, gold-outlined cards for setup + delivery, gold checkbox
// pre-delivery checklist in 2 columns. Chef's prep sheet aesthetic.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder } from './InvoicePdf.js';
import type { KitchenSheet } from '../portioning.js';

const e = React.createElement;

function pageFooterDark() {
	return e(
		View,
		{ style: styles.footer, fixed: true },
		e(Text, { style: styles.footerDark }, 'Sula Indian Restaurant · Kitchen · Confidential'),
		e(
			Text,
			{
				style: styles.footerDark,
				render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
					`${pageNumber} of ${totalPages}`
			}
		)
	);
}

function locationLine(loc: InvoiceOrder['location']): string {
	if (!loc) return '';
	if (loc.venueOrAddress && loc.city) return `${loc.venueOrAddress}, ${loc.city}`;
	return loc.venueOrAddress || loc.city || '';
}

function dietaryFlags(d: InvoiceOrder['dietary']): string[] {
	if (!d) return [];
	const flags: string[] = [];
	if (d.halal) flags.push('HALAL');
	if (d.hasJain) flags.push('JAIN PREP');
	if (d.hasVegan) flags.push('VEGAN');
	if (d.hasGlutenFree) flags.push('GLUTEN-FREE');
	if (d.hasNutAllergy) flags.push('⚠ NUT ALLERGY');
	if (typeof d.vegetarianPct === 'number') flags.push(`VEG ${d.vegetarianPct}%`);
	return flags;
}

export function renderPage3(order: InvoiceOrder, sheet: KitchenSheet, opts: { logoBuffer?: Buffer | null } = {}) {
	const guestStr = order.guestCount === undefined ? 'TBD' : String(order.guestCount);
	const flags = dietaryFlags(order.dietary);
	const flagsLine = flags.length ? flags.join(' · ') : 'No special dietary flags';
	const dietaryNotes = order.dietary?.notes;

	const checklist = [
		'Confirm guest count with client (24h before)',
		'Halal / Jain / allergy flags reviewed by lead chef',
		'Setup gear loaded (trays / heated / copper)',
		'Dinnerware + serving spoons packed',
		'Chutneys + sides portioned per sheet',
		'Hot food temped at departure (>74°C)',
		'Cold food temped at departure (<4°C)',
		'Delivery contact + address confirmed',
		'Spice level dialed for the room',
		'Driver briefed on access notes (loading dock, parking)'
	];

	return e(
		Page,
		{ size: 'LETTER', style: styles.pageDark },

		// Plum hero (no separate band — page is already plum)
		e(
			View,
			{ style: styles.kitchenHero },
			opts.logoBuffer && e(Image as unknown as React.ComponentType<Record<string, unknown>>, { src: opts.logoBuffer, style: styles.kitchenLogo }),
			e(
				View,
				{ style: styles.kitchenHeroText },
				e(Text, { style: styles.kitchenHeroEyebrow }, 'Internal · do not share'),
				e(Text, { style: styles.kitchenHeroTitle }, 'KITCHEN ORDER'),
				e(Text, { style: styles.kitchenHeroSub }, 'Reference ' + order.reference + ' · ' + (order.eventDate || 'TBD'))
			)
		),

		// Body
		e(
			View,
			{ style: styles.kitchenBody },

			// Inverted cream card: customer info + event facts
			e(
				View,
				{ style: styles.invertedCard },
				e(
					View,
					{ style: styles.invertedCol },
					e(Text, { style: styles.invertedColTitle }, 'Customer'),
					e(Text, { style: styles.invertedColLineHero }, order.contact?.name || ''),
					e(Text, { style: styles.invertedColLine }, order.contact?.email || ''),
					order.contact?.phone && e(Text, { style: styles.invertedColLine }, order.contact.phone)
				),
				e(
					View,
					{ style: styles.invertedCol },
					e(Text, { style: styles.invertedColTitle }, 'Event'),
					e(Text, { style: styles.invertedColLineHero }, guestStr + ' guests · ' + (order.eventType || 'event')),
					e(Text, { style: styles.invertedColLine }, order.eventDate || 'Date TBD'),
					order.timeWindow && e(Text, { style: styles.invertedColLine }, order.timeWindow),
					locationLine(order.location) && e(Text, { style: styles.invertedColLine }, locationLine(order.location))
				)
			),

			// Dietary flags strip
			e(
				View,
				{ style: styles.plumCard },
				e(Text, { style: styles.plumCardLabel }, 'Dietary flags'),
				e(Text, { style: styles.plumCardLine }, flagsLine),
				dietaryNotes && e(Text, { style: styles.plumCardLineMuted }, 'Notes: ' + dietaryNotes)
			),

			// Portioning table title
			e(Text, { style: styles.portTitle }, 'Portioning'),

			// Table header
			e(
				View,
				{ style: styles.portTableHeader },
				e(Text, { style: styles.portCellHeaderItem }, 'Item'),
				e(Text, { style: styles.portCellHeaderQty }, 'Qty'),
				e(Text, { style: styles.portCellHeaderNotes }, 'Notes')
			),

			// Table rows
			...sheet.lines.map((line, i) =>
				e(
					View,
					{ style: i % 2 === 1 ? styles.portRowAltMerged : styles.portRow, key: String(i) },
					e(Text, { style: styles.portCellItem }, line.item),
					e(Text, { style: styles.portCellPortions }, line.portions),
					e(Text, { style: styles.portCellNotes }, line.notes)
				)
			),

			// Setup & Delivery cards
			e(
				View,
				{ style: styles.plumCard },
				e(Text, { style: styles.plumCardLabel }, 'Setup'),
				e(Text, { style: styles.plumCardLine }, order.setupStyle || 'Aluminum trays (default)'),
				order.menuTier && e(Text, { style: styles.plumCardLineMuted }, 'Menu tier: ' + order.menuTier)
			),
			e(
				View,
				{ style: styles.plumCard },
				e(Text, { style: styles.plumCardLabel }, 'Delivery / Service'),
				e(Text, { style: styles.plumCardLine }, locationLine(order.location) || 'Address TBD'),
				order.timeWindow && e(Text, { style: styles.plumCardLineMuted }, 'Time: ' + order.timeWindow),
				order.serviceType && e(Text, { style: styles.plumCardLineMuted }, 'Service: ' + order.serviceType)
			),

			// Pre-delivery checklist
			e(Text, { style: styles.checklistTitle }, 'Pre-delivery checklist'),
			e(
				View,
				{ style: styles.checklistGrid },
				...checklist.map((item, i) =>
					e(
						View,
						{ style: styles.checklistItem, key: String(i) },
						e(View, { style: styles.checkbox }),
						e(Text, { style: styles.checklistText }, item)
					)
				)
			)
		),

		pageFooterDark()
	);
}
