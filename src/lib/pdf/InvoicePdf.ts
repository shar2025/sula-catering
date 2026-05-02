// Top-level Sula PDF document. Composes Page1 (Catering Details), Page2
// (formal Invoice with line-item table), and Page3 (Kitchen Order Sheet),
// filtered by audience.
//
//   audience='customer' → page 1 ONLY (Catering Submission Record).
//                         The initial confirmation we send right after Neela
//                         captures the order, no prices, just "we got it".
//   audience='internal' → pages 1 + 2 ONLY (catering details + formal invoice
//                         with prices). NO kitchen sheet. NOTE: despite the
//                         name, this is also the CUSTOMER-FINAL invoice that
//                         the events team sends to the customer after they
//                         review and adjust the quote. Both team review and
//                         customer-final use this same document because the
//                         team's edits go straight into the order before the
//                         customer copy is sent. Kept as 'internal' for
//                         backwards compatibility with the email pipeline and
//                         the chat "View Invoice" link.
//   audience='kitchen'  → page 3 only (Kitchen Order Sheet, prep workflow).
//   audience='all'      → all 3 pages (legacy/diagnostic only).
//   default             → all 3 pages.
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

// A single curry / appetizer / vegan dish on the menu. The diet badge (e.g.
// "Gluten Free", "Dairy Free") renders in italic muted next to the name.
export interface MenuLine {
	kind: 'veg' | 'vegan' | 'nonveg' | 'appetizer';
	name: string;
	diet?: string;
}

// A single line on the formal invoice (Page 2). qty + unit_price are
// optional, when omitted only `amount` renders under the Price column.
export interface InvoiceLineItem {
	label: string;
	amount: number;
	qty?: number;
	unit_price?: number;
}

export interface InvoiceOrder {
	reference: string;
	createdAt: string;
	mode: string;
	eventType?: string;
	eventDate?: string;
	guestCount?: number | string;
	serviceType?: string;
	location?: { city?: string; venueOrAddress?: string };
	deliveryAddress?: string;
	deliveryTime?: string;
	timeWindow?: string;
	deliveryKm?: number;          // distance for delivery zone (Page 3 needs it)
	spiceLevel?: string;          // 'Mild' | 'Medium' | 'Hot' | 'Extra Hot' free-text
	paymentMethod?: string;       // 'Cash', 'Card', 'E-transfer', etc.
	dietary?: {
		vegetarianPct?: number;
		hasJain?: boolean;
		hasVegan?: boolean;
		hasGlutenFree?: boolean;
		hasNutAllergy?: boolean;
		hasShellfishAllergy?: boolean;
		hasDairyFree?: boolean;
		// halal omitted by design; kitchen is halal-certified by default since 2010.
		notes?: string;
	};
	menuTier?: string;
	addOns?: string[];
	menuItems?: MenuLine[];       // structured curries / apps / vegan / non-veg
	additionalMenuItems?: string; // free-text "Additional Menu Items" line for Page 1
	setupStyle?: string;
	setupType?: string;
	rentalsRequired?: boolean;
	platesAndCutlery?: 'required' | 'not_required';
	servingSpoons?: 'required' | 'not_required';
	dinnerwarePerGuest?: number;  // typically $6.90/person (only when plates required)
	customMenuDetails?: string;
	contact: { name: string; email: string; phone?: string };
	notes?: string;
	quote?: {
		line_items: InvoiceLineItem[];
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
	watermark?: string;
	logoBuffer?: Buffer | null;
	// Set true after `await loadCormorant()` succeeds, so the wordmark in the
	// brand band uses Cormorant Garamond italic. When false / absent, Pages 1
	// and 2 fall back to Helvetica-Oblique with tracking.
	cormorantRegistered?: boolean;
}) {
	ensureFonts();
	const e = React.createElement;
	const { order, sheet, audience, watermark, logoBuffer, cormorantRegistered } = opts;
	const pageOpts = { watermark, logoBuffer, cormorantRegistered };

	const children: React.ReactNode[] = [];
	// 'customer'  = Catering Details ONLY. No prices, no kitchen sheet. The
	//                formal quote follows by email from the events team.
	// 'kitchen'   = Kitchen sheet ONLY. Goes to the kitchen recipient (set via
	//                KITCHEN_EMAIL) so prep cooks don't have to flip past the
	//                customer-facing pages.
	// 'internal'  = Customer details + formal invoice (pages 1 + 2). The events
	//                team copy. Excludes the kitchen sheet so back-office
	//                discussions don't accidentally surface prep notes.
	// 'all'       = All 3 pages, legacy/diagnostic only.
	if (audience === 'customer') {
		children.push(renderPage1(order, { ...pageOpts, forCustomer: true }));
	} else if (audience === 'kitchen') {
		children.push(renderPage3(order, sheet, { logoBuffer }));
	} else if (audience === 'internal') {
		children.push(renderPage1(order, pageOpts));
		children.push(renderPage2(order, pageOpts));
	} else {
		// 'all' / default → full 3-page diagnostic copy
		children.push(renderPage1(order, pageOpts));
		children.push(renderPage2(order, pageOpts));
		children.push(renderPage3(order, sheet, { logoBuffer }));
	}

	return e(
		Document,
		{
			title: `Sula Catering ${order.reference}`,
			author: 'Sula Indian Catering',
			subject: 'Catering Invoice',
			creator: 'Neela',
			producer: 'Sula Catering Vancouver'
		} as Record<string, unknown>,
		...children
	);
}
