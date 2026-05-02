// Top-level Sula PDF document. Composes Page1 (catering details), Page2
// (estimate / invoice), and Page3 (kitchen sheet) — filtered by audience.
//
//   audience='customer' → pages 1 + 2 only (no kitchen sheet)
//   audience='kitchen'  → page 3 only
//   default             → all 3
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

export type Audience = 'all' | 'customer' | 'kitchen';

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
		halal?: boolean;
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
}) {
	ensureFonts();
	const e = React.createElement;
	const { order, sheet, audience } = opts;

	const children: React.ReactNode[] = [];
	if (audience !== 'kitchen') {
		children.push(renderPage1(order));
		children.push(renderPage2(order));
	}
	if (audience !== 'customer') {
		children.push(renderPage3(order, sheet));
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
