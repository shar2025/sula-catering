// Server-side portioning calculator for the kitchen sheet (Page 3 of the PDF).
// Pure deterministic function. Input: order with guestCount + selected items.
// Output: KitchenSheet with portioning numbers, scaled chutney quantities,
// and per-item notes explaining the math.
//
// Formulas verbatim from the Phase B brief:
//   - Appetizers: 50% of guests ÷ N appetizers, rounded up
//   - Curries:    75% of guests ÷ N curries, with non-veg DOUBLE WEIGHT
//                 if the menu has fewer non-veg curries than veg
//   - Naan:       75% of guests ÷ 2 (split between Tandoori + Garlic), rounded up
//   - Rice:       50% of guests, rounded up
//   - Wafers:     50% of guests, rounded up
//   - Mango chutney: 24 oz scales linearly with 30-guest baseline
//   - Hot sauce:     16 oz at 30-guest baseline
//   - Mint+Cilantro / Tamarind+Date chutney: included only if any appetizer
//     selected; 12 oz at 15-guest baseline
//
// Reference test (15 guests, 1 appetizer Onion Bhajia, 2 veg curries
// Paneer Butter Masala + Dal Makhani, 0 non-veg) must produce:
//   Onion Bhajia            8.0
//   Paneer Butter Masala    5.6
//   Dal Makhani             5.6
//   Tandoori Naan           6
//   Garlic Naan             6
//   Basmati Rice            8
//   Lentil Wafers           8
//   Mango Chutney          12 oz
//   Hot Sauce               8 oz
//   Mint & Cilantro        12 oz
//   Tamarind & Date        12 oz

export interface MenuItem {
	name: string;
	isNonVeg?: boolean;
}

export interface PortioningInput {
	guestCount: number;
	appetizers?: MenuItem[];
	curries?: MenuItem[];
	includeStarches?: boolean; // defaults to true; false for chai-only / cafe orders
}

export interface KitchenLine {
	item: string;
	portions: string;
	notes: string;
}

export interface KitchenSheet {
	guestCount: number;
	lines: KitchenLine[];
	nonVegDoubleWeightApplied: boolean;
}

function ceil(n: number): number {
	return Math.ceil(n);
}
function fmtDecimal(n: number): string {
	// One decimal, drop trailing .0 for whole numbers (matches reference PDF rounding cues)
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function calculatePortions(input: PortioningInput): KitchenSheet {
	const g = Math.max(1, Math.floor(input.guestCount || 0));
	const apps = (input.appetizers || []).filter((a) => a && a.name);
	const curries = (input.curries || []).filter((c) => c && c.name);
	const includeStarches = input.includeStarches !== false;

	const numApps = apps.length;
	const vegCurries = curries.filter((c) => !c.isNonVeg);
	const nonVegCurries = curries.filter((c) => c.isNonVeg);
	const numCurries = curries.length;
	const nonVegDouble = nonVegCurries.length > 0 && nonVegCurries.length < vegCurries.length;

	const lines: KitchenLine[] = [];

	// Appetizers — 50% of guests ÷ N appetizers, rounded up
	for (const app of apps) {
		const portions = numApps > 0 ? ceil((g * 0.5) / numApps) : 0;
		lines.push({
			item: app.name,
			portions: fmtDecimal(portions),
			notes: `50% of ${g} guests ÷ ${numApps} appetizer${numApps === 1 ? '' : 's'}`
		});
	}

	// Curries — 75% of guests ÷ N curries, with non-veg double-weighting if applicable
	if (numCurries > 0) {
		const totalWeight =
			vegCurries.length + (nonVegDouble ? nonVegCurries.length * 2 : nonVegCurries.length);
		const basePerWeight = (g * 0.75) / totalWeight;
		for (const c of curries) {
			const weight = c.isNonVeg && nonVegDouble ? 2 : 1;
			const portions = basePerWeight * weight;
			const note =
				nonVegDouble && c.isNonVeg
					? `2× weight (more non-veg eaters when both offered)`
					: `75% of ${g} guests ÷ ${numCurries} curr${numCurries === 1 ? 'y' : 'ies'}`;
			lines.push({
				item: c.name,
				portions: fmtDecimal(Math.round(portions * 10) / 10),
				notes: note
			});
		}
	}

	if (includeStarches) {
		// Naan — 75% of guests ÷ 2 (split between Tandoori + Garlic), rounded up
		const naanEach = ceil((g * 0.75) / 2);
		lines.push({
			item: 'Tandoori Naan',
			portions: String(naanEach),
			notes: `75% of ${g} guests ÷ 2 naan types`
		});
		lines.push({
			item: 'Garlic Naan',
			portions: String(naanEach),
			notes: `75% of ${g} guests ÷ 2 naan types`
		});

		// Basmati Rice — 50% of guests, rounded up
		lines.push({
			item: 'Basmati Rice',
			portions: String(ceil(g * 0.5)),
			notes: `50% of ${g} guests`
		});

		// Lentil Wafers / Papadum — 50% of guests, rounded up
		lines.push({
			item: 'Lentil Wafers (Papadum)',
			portions: String(ceil(g * 0.5)),
			notes: `50% of ${g} guests`
		});

		// Mango Chutney — 24 oz scales from 30-guest baseline
		const mangoOz = Math.round((24 * g) / 30);
		lines.push({
			item: 'Mango Chutney',
			portions: `${mangoOz} oz`,
			notes: `Scaled from 24 oz / 30 guests`
		});

		// Hot Sauce — 16 oz at 30-guest baseline
		const hotOz = Math.round((16 * g) / 30);
		lines.push({
			item: 'Hot Sauce',
			portions: `${hotOz} oz`,
			notes: `Scaled from 16 oz / 30 guests`
		});

		// Appetizer-paired chutneys — only included when appetizers are on the menu
		if (numApps > 0) {
			const mintOz = Math.round((12 * g) / 15);
			const tamarindOz = Math.round((12 * g) / 15);
			lines.push({
				item: 'Mint & Cilantro Chutney',
				portions: `${mintOz} oz`,
				notes: `Has appetizers, scaled from 12 oz / 15 guests`
			});
			lines.push({
				item: 'Tamarind & Date Chutney',
				portions: `${tamarindOz} oz`,
				notes: `Has appetizers, scaled from 12 oz / 15 guests`
			});
		}
	}

	return {
		guestCount: g,
		lines,
		nonVegDoubleWeightApplied: nonVegDouble
	};
}

// ---------- Delivery fee logic (corrected per Phase B spec) ----------

export interface DeliveryFee {
	amount: number | null; // null = manual review (>30km)
	label: string;
	zoneText: string; // human-readable zone, e.g. "0 to 10 km, free"
	requiresManualReview: boolean;
}

export function calculateDeliveryFee(km: number | null | undefined, opts: { earlyDelivery?: boolean } = {}): DeliveryFee {
	const surcharge = opts.earlyDelivery ? 35 : 0;
	if (km === null || km === undefined || !Number.isFinite(km)) {
		return {
			amount: null,
			label: 'Delivery (distance unknown)',
			zoneText: 'distance unknown, the events team will confirm',
			requiresManualReview: true
		};
	}
	if (km <= 10) {
		return {
			amount: 0 + surcharge,
			label: surcharge ? `Delivery (0-10 km, free) + early-delivery $35` : 'Delivery (0-10 km, free)',
			zoneText: '0 to 10 km, free',
			requiresManualReview: false
		};
	}
	if (km <= 15) {
		return {
			amount: 5 + surcharge,
			label: surcharge ? `Delivery (10-15 km zone) + early-delivery $35` : 'Delivery (10-15 km zone)',
			zoneText: '10 to 15 km, $5',
			requiresManualReview: false
		};
	}
	if (km <= 30) {
		return {
			amount: 15 + surcharge,
			label: surcharge ? `Delivery (15-30 km zone) + early-delivery $35` : 'Delivery (15-30 km zone)',
			zoneText: '15 to 30 km, $15',
			requiresManualReview: false
		};
	}
	return {
		amount: null,
		label: 'Delivery (30+ km, manual review)',
		zoneText: '30+ km, the events team will confirm the rate',
		requiresManualReview: true
	};
}
