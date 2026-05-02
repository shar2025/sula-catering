// Top-level Sula PDF document. Composes Page1 (catering details), Page2
// (estimate / invoice), and Page3 (kitchen sheet), filtered by audience.
//
//   audience='customer' → page 1 ONLY (catering details, no pricing).
//                         The customer never sees Neela's preliminary line-item
//                         math, events team reviews and sends the official
//                         quote in writing. Page 1 ends with a "for your records"
//                         note to set the expectation.
//   audience='kitchen'  → page 3 only (kitchen sheet)
//   audience='internal' → all 3 pages (events team copy: details + estimate + kitchen)
//   audience='all'      → alias for 'internal' (back-compat with older callers)
//   default             → all 3 pages
//
// Uses React.createElement directly (no JSX) so we don't need to touch
// tsconfig or risk breaking Astro's compilation pipeline.

import React from 'react';
import { Document } from '@react-pdf/renderer';
import { ensureFonts } from './styles.js';
import { renderPage1 } from './Page1Details.js';
import { renderPage2 } from './Page2Invoice.js';
import { renderPage3 } from './Page3Kitchen.js';
import type { KitchenSheet } from '../portioning.js';

export type Audience = 'all' | 'internal' | 'customer' | 'kitchen';

export interface InvoiceOrder {
	reference: string;
	createdAt: string;
	mode: string;
	eventType?: string;
	eventDate?: string;
	guestCount?: number | string;
	serviceType?: string;
	location?: { city?: string; venueOrAddress?: string };
	timeWindow?: string;
	dietary?: {
		vegetarianPct?: number;
		hasJain?: boolean;
		hasVegan?: boolean;
		hasGlutenFree?: boolean;
		hasNutAllergy?: boolean;
		hasShellfishAllergy?: boolean;
		hasDairyFree?: boolean;
		// halal omitted by design, kitchen is halal-certified by default since 2010.
		notes?: string;
	};
	menuTier?: string;
	addOns?: string[];
	setupStyle?: string;
	contact: { name: string; email: string; phone?: string };
	notes?: string;
	quote?: {
		line_items: { label: string; amount: number }[];
		subtotal?: number;
		tax_label?: string;
		tax_amount?: number;
		total?: number;
		currency?: string;
		disclaimer?: string;
	};
}

export function buildInvoicePdf(opts: {
	order: InvoiceOrder;
	sheet: KitchenSheet;
	audience: Audience;
	watermark?: string; // optional rotated text behind the cream card on Page 1 (e.g. "SAMPLE")
	logoBuffer?: Buffer | null; // pre-fetched logo PNG; if null, pages render without the elephant glyph
}) {
	ensureFonts();
	const e = React.createElement;
	const { order, sheet, audience, watermark, logoBuffer } = opts;

	const children: React.ReactNode[] = [];
	// 'customer' = page 1 ONLY (no pricing). Events team controls when/how the
	// real quote goes out, so the customer's confirmation copy is just a record
	// of what was captured.
	if (audience === 'customer') {
		children.push(renderPage1(order, { watermark, logoBuffer, forCustomer: true }));
	} else if (audience === 'kitchen') {
		children.push(renderPage3(order, sheet, { logoBuffer }));
	} else {
		// 'all' / 'internal' / default → full 3-page events-team copy
		children.push(renderPage1(order, { watermark, logoBuffer }));
		children.push(renderPage2(order, { watermark, logoBuffer }));
		children.push(renderPage3(order, sheet, { logoBuffer }));
	}

	return e(
		Document,
		{
			title: `Sula Catering ${order.reference}`,
			author: 'Sula Indian Catering',
			subject: 'Catering Order',
			creator: 'Neela',
			producer: 'Sula Catering Vancouver'
		} as Record<string, unknown>,
		...children
	);
}
