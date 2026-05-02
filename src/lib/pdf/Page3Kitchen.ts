// Page 3, Kitchen Order Sheet (internal).
// Operational sheet for the line cooks: customer + event header fields,
// portioning table, setup + delivery details, pre-delivery checklist.
// Same brand band as the other pages so the kitchen copy reads as part of the
// document set, with a gold INTERNAL USE ONLY subhead inside the band so it
// can't be mistaken for a customer-facing page.

import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS } from './styles.js';
import type { InvoiceOrder } from './InvoicePdf.js';
import type { KitchenSheet } from '../portioning.js';

const e = React.createElement;

function pageFooter() {
	return e(
		View,
		{ style: styles.footer, fixed: true },
		e(
			Text,
			{ style: styles.footerTextConfidential },
			'Sula Indian Restaurant ',
			e(Text, { style: { color: COLORS.gold } }, ' · '),
			' Kitchen Order Sheet ',
			e(Text, { style: { color: COLORS.gold } }, ' · '),
			' CONFIDENTIAL'
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

function locationLine(order: InvoiceOrder): string {
	if (order.deliveryAddress) return order.deliveryAddress;
	const loc = order.location;
	if (!loc) return '';
	if (loc.venueOrAddress && loc.city) return `${loc.venueOrAddress}, ${loc.city}`;
	return loc.venueOrAddress || loc.city || '';
}

function formatEventDate(s: string | undefined): string {
	if (!s) return '';
	const d = new Date(s);
	if (isNaN(d.getTime())) return s;
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const yyyy = d.getFullYear();
	return `${dd}/${mm}/${yyyy}`;
}

function shortOption(menuTier: string | undefined): string {
	if (!menuTier) return '';
	const t = menuTier.toLowerCase();
	if (t.includes('vegetarian') || t.includes('vegan')) return 'Veg/Vegan';
	const m = menuTier.match(/option\s*\d/i);
	if (m) return m[0].replace(/\s+/g, ' ');
	if (t.includes('meat lovers')) return 'Meat Lovers';
	return menuTier;
}

function kitchenField(label: string, value: string | undefined) {
	if (!value) return null;
	return e(
		View,
		{ style: styles.kitchenFieldRow, key: label },
		e(Text, { style: styles.kitchenFieldLabel }, label),
		e(Text, { style: styles.kitchenFieldValue }, value)
	);
}

function deliveryZoneNote(km: number | undefined | null): string {
	if (km === undefined || km === null || !Number.isFinite(km)) return 'Distance to be confirmed';
	if (km <= 10) return `${km.toFixed(1)} KM  ·  Free zone (0-10 KM)`;
	if (km <= 15) return `${km.toFixed(1)} KM  ·  $5 zone (10-15 KM)`;
	if (km <= 30) return `${km.toFixed(1)} KM  ·  $15 zone (15-30 KM)`;
	return `${km.toFixed(1)} KM  ·  Manual review (30+ KM)`;
}

function kitchenBand(logoBuffer: Buffer | null | undefined) {
	return e(
		React.Fragment,
		null,
		e(
			View,
			{ style: styles.brandBandCompact },
			e(View, { style: styles.brandBandShade }),
			logoBuffer && e(
				Image as unknown as React.ComponentType<Record<string, unknown>>,
				{ src: logoBuffer, style: styles.brandLogoSmall }
			),
			e(Text, { style: styles.kitchenHeader }, 'KITCHEN ORDER SHEET'),
			e(Text, { style: styles.kitchenSubhead }, 'INTERNAL USE ONLY  ·  DO NOT SHARE WITH CUSTOMER')
		),
		e(View, { style: styles.brandBandRule })
	);
}

// Helper: render a plum-accented section header with leading gold diamond.
function sectionHeader(label: string) {
	return e(
		View,
		{ style: styles.sectionGold },
		e(Text, { style: styles.sectionGoldOrnament }, '◆'),
		e(Text, { style: styles.sectionGoldText }, label)
	);
}

export function renderPage3(order: InvoiceOrder, sheet: KitchenSheet, opts: { logoBuffer?: Buffer | null } = {}) {
	const guests = typeof order.guestCount === 'number' ? order.guestCount : parseInt(String(order.guestCount || '0'), 10) || sheet.guestCount;
	const address = locationLine(order) || 'To be confirmed with customer';
	const payment = order.paymentMethod || '';
	const paymentNote = /cash/i.test(payment) ? 'Bring payment machine as backup' : '';

	// Header field block (2-col)
	const left: React.ReactNode[] = [];
	left.push(kitchenField('Customer', order.contact?.name || ''));
	left.push(kitchenField('Guests', String(guests || sheet.guestCount)));
	left.push(kitchenField('Event Date', formatEventDate(order.eventDate)));
	left.push(kitchenField('Delivery', order.deliveryTime || order.timeWindow));

	const right: React.ReactNode[] = [];
	right.push(kitchenField('Option', shortOption(order.menuTier)));
	right.push(kitchenField('Spice', order.spiceLevel));
	right.push(kitchenField('Address', address));
	right.push(kitchenField('Payment', payment));

	const checklist = [
		'All items packed & counted',
		'Chutneys & sauces sealed',
		'Dinnerware loaded',
		'Payment machine charged',
		'Delivery address confirmed',
		'Customer notified'
	];

	// Setup line
	const setupLabel = order.setupStyle || (order.setupType ? order.setupType.replace(/_/g, ' ') : 'Aluminium Trays');
	const setupIsAlumi = /alum/i.test(setupLabel);
	const dinnerwarePerGuest = order.dinnerwarePerGuest ?? 6.9;

	return e(
		Page,
		{ size: 'LETTER', style: styles.page },

		kitchenBand(opts.logoBuffer),

		// Faint elephant watermark behind the body
		opts.logoBuffer && e(
			Image as unknown as React.ComponentType<Record<string, unknown>>,
			{ src: opts.logoBuffer, style: styles.pageWatermark, fixed: true }
		),

		// Inner padded content
		e(
			View,
			{ style: styles.contentInner },

			// Header field block (2-col)
			e(
				View,
				{ style: { ...styles.twoColRow, marginTop: 6 } },
				e(View, { style: styles.twoColCell }, ...left.filter(Boolean)),
				e(View, { style: styles.twoColCell }, ...right.filter(Boolean))
			),

			// Portioning section
			sectionHeader(`PORTIONING (${guests || sheet.guestCount} Guests)`),

			// Portioning table header
			e(
				View,
				{ style: styles.portTableHeaderRow },
				e(Text, { style: styles.portHeaderItem }, '   Item'),
				e(Text, { style: styles.portHeaderPortions }, 'Portions'),
				e(Text, { style: styles.portHeaderNotes }, 'Notes')
			),

			// Portioning rows
			...sheet.lines.map((line, i) =>
				e(
					View,
					{ style: i % 2 === 1 ? { ...styles.portRow, ...styles.portRowAlt } : styles.portRow, key: `port-${i}` },
					e(
						View,
						{ style: styles.portCellItem },
						e(Text, { style: styles.portBullet }, '■'),
						e(Text, { style: styles.portCellItemText }, line.item)
					),
					e(Text, { style: styles.portCellPortions }, line.portions),
					e(Text, { style: styles.portCellNotes }, line.notes)
				)
			),

			// Footnote
			e(
				Text,
				{ style: styles.portFootnote },
				'Specific dishes confirmed by chef based on tier and dietary requirements.'
			),

			// Setup & Equipment
			sectionHeader('SETUP & EQUIPMENT'),
			e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Aluminium Trays'),
				e(Text, { style: styles.threeColCellValue }, setupIsAlumi ? 'Yes' : 'No'),
				e(Text, { style: styles.threeColCellNote }, setupIsAlumi ? 'Free' : setupLabel)
			),
			order.platesAndCutlery === 'required' && e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Dinnerware'),
				e(Text, { style: styles.threeColCellValue }, `${guests || sheet.guestCount} sets`),
				e(Text, { style: styles.threeColCellNote }, `$${dinnerwarePerGuest.toFixed(2)}/person`)
			),
			order.servingSpoons && e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Serving Spoons'),
				e(Text, { style: styles.threeColCellValue }, order.servingSpoons === 'required' ? 'Required' : 'Not required'),
				e(Text, { style: styles.threeColCellNote }, '')
			),

			// Delivery
			sectionHeader('DELIVERY'),
			e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Address'),
				e(Text, { style: { ...styles.threeColCellValue, flex: 3.5 } }, address)
			),
			e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Distance'),
				e(Text, { style: styles.threeColCellValue }, deliveryZoneNote(order.deliveryKm)),
				e(Text, { style: styles.threeColCellNote }, order.deliveryTime || order.timeWindow || '')
			),
			payment && e(
				View,
				{ style: styles.threeColRow },
				e(Text, { style: styles.threeColCellLabel }, 'Payment'),
				e(Text, { style: styles.threeColCellValue }, payment),
				e(Text, { style: styles.threeColCellNote }, paymentNote)
			),

			// Pre-delivery checklist
			sectionHeader('PRE-DELIVERY CHECKLIST'),
			...checklist.map((item, i) =>
				e(
					View,
					{ style: styles.checklistItem, key: `chk-${i}` },
					e(View, { style: styles.checkbox }),
					e(Text, { style: styles.checklistText }, item)
				)
			)
		),

		pageFooter()
	);
}
