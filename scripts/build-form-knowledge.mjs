/**
 * build-form-knowledge.mjs — converts the Gravity Forms full JSON export
 * into a natural-language rule book that Neela can use during chat.
 *
 * One-shot generator. Re-run when Shar provides an updated form export:
 *   1. Drop the new export at  data/gravity-forms.json
 *   2. node scripts/build-form-knowledge.mjs
 *   3. git commit src/lib/neela-form-knowledge.ts
 *
 * Output: src/lib/neela-form-knowledge.ts (committed, not gitignored —
 * unlike the site scrape, the form data is static input from Shar,
 * not auto-refreshed on every build).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.join('data', 'gravity-forms.json');
const OUT = path.join('src', 'lib', 'neela-form-knowledge.ts');
const APPROX_CHARS_PER_TOKEN = 4;

// Forms Neela needs context on. Backups, employee, feedback, mailing list,
// and per-restaurant issue forms are intentionally excluded.
const RELEVANT_FORM_IDS = ['1', '3', '4', '8', '18', '25', '27'];

function decode(s) {
	if (s == null) return '';
	return String(s)
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

function formatPrice(p) {
	if (!p) return '';
	const stripped = String(p).replace(/^\$+/, '');
	return ` (+$${stripped})`;
}

function listChoices(field, indent = '  ') {
	if (!field.choices || !field.choices.length) return '';
	return field.choices
		.map((c) => {
			const text = decode(c.text);
			return `${indent}- ${text}${formatPrice(c.price)}`;
		})
		.join('\n');
}

function explainConditional(field, allFieldsById) {
	const cl = field.conditionalLogic;
	if (!cl) return '';
	const action = cl.actionType === 'show' ? 'Shown when' : 'Hidden when';
	const joiner = cl.logicType === 'all' ? ' AND ' : ' OR ';
	const parts = cl.rules.map((r) => {
		const dep = allFieldsById[r.fieldId];
		const depName = dep ? `"${decode(dep.label)}"` : `field ${r.fieldId}`;
		const op = r.operator === 'is' ? '=' : r.operator === 'isnot' ? '≠' : r.operator;
		return `${depName} ${op} "${decode(r.value)}"`;
	});
	return `${action} ${parts.join(joiner)}`;
}

function summarizeForm(form, includeConditionals = true, maxChoiceList = 14) {
	const allFieldsById = Object.fromEntries(form.fields.map((f) => [f.id, f]));
	const lines = [];
	lines.push(`### Form: ${decode(form.title)}`);
	if (form.description) lines.push(`*${decode(form.description).trim()}*`);
	lines.push('');
	lines.push(`**Fields (${form.fields.length}):**`);

	for (const field of form.fields) {
		if (field.type === 'hidden' || field.type === 'section' || field.type === 'consent') {
			continue;
		}
		const label = decode(field.label || '');
		if (!label) continue;
		const required = field.isRequired ? ' (required)' : '';
		const typeNote =
			field.type === 'product' ? ' [pricing field]' :
			field.type === 'date' ? ' [date]' :
			field.type === 'number' || field.type === 'quantity' ? ' [number]' :
			field.type === 'address' ? ' [address]' :
			field.type === 'textarea' ? ' [free text]' :
			field.type === 'checkbox' ? ' [multi-select checkbox]' :
			field.type === 'multiselect' ? ' [multi-select]' :
			field.type === 'phone' ? ' [phone]' :
			field.type === 'email' ? ' [email]' :
			'';
		lines.push('');
		lines.push(`- **${label}**${required}${typeNote}`);

		if (field.choices && field.choices.length) {
			const slice = field.choices.slice(0, maxChoiceList);
			lines.push(listChoices({ choices: slice }, '    '));
			if (field.choices.length > maxChoiceList) {
				lines.push(`    - …and ${field.choices.length - maxChoiceList} more`);
			}
		}
		if (field.placeholder) {
			lines.push(`    Placeholder: "${decode(field.placeholder)}"`);
		}
		if (field.description) {
			const desc = decode(field.description).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
			if (desc) lines.push(`    Note: ${desc}`);
		}
		if (includeConditionals && field.conditionalLogic) {
			const explained = explainConditional(field, allFieldsById);
			if (explained) lines.push(`    ${explained}.`);
		}
		if (field.basePrice) {
			lines.push(`    Base price: $${field.basePrice}`);
		}
	}

	return lines.join('\n');
}

function notificationsBlock(form) {
	const notifs = Object.values(form.notifications || {});
	if (!notifs.length) return '';
	const lines = [`**Notifications (where the form sends submissions):**`];
	for (const n of notifs) {
		let to = n.to || '';
		if (typeof to === 'string' && /^\d+$/.test(to.trim())) {
			to = `(field ${to.trim()} value)`;
		}
		lines.push(`- ${decode(n.name)} → ${to}`);
	}
	return lines.join('\n');
}

function buildHeader() {
	return `# SULA FORM KNOWLEDGE BASE

Neela uses this section to walk visitors through the same logic Sula's quote and reservation forms enforce on the WordPress site. Use it to answer pricing questions, walk through what we'd need to give a quote, and explain which form path fits a given event.

If a visitor wants to actually submit a quote, point them at the live form on the WordPress site (Catering Inquiry, Custom Order, Group Reservations, etc.) or offer the Calendly call.

## How to choose a form path

| Situation | Form to use |
| --- | --- |
| Off-site catering (delivery to office, home, venue) with menu picks | **Catering Inquiry** (form 27) |
| Off-site catering with a fully custom menu request | **Catering Custom Order** (form 4) |
| Wedding catering with multi-tier menu options ($33–$60/guest) | **Menu Selector** (form 18) |
| Dining inside a Sula restaurant with 7–30 guests | **Group Reservations** (form 8) |
| Renting a Sula restaurant patio for a private event | **Patio Buy Out** (form 25) |
| General contact / unclear path | **General Enquiry** (form 1) |

`;
}

function buildBody(forms) {
	const parts = [];
	for (const form of forms) {
		parts.push(`---\n\n${summarizeForm(form)}`);
		const n = notificationsBlock(form);
		if (n) parts.push('\n' + n);
		parts.push('\n');
	}
	return parts.join('\n');
}

function buildPricingDigest(catering) {
	// Distill the most important pricing/decision rules from form 27 in one place.
	const f = catering;
	const byId = Object.fromEntries(f.fields.map((x) => [x.id, x]));
	const lines = [];
	lines.push(`---\n\n## QUICK PRICING DIGEST (Catering Inquiry, form 27)\n`);
	lines.push(`**Per-guest menu tiers** (all + tax):`);
	const opt = byId[49];
	if (opt) {
		opt.choices.forEach((c) => {
			lines.push(`- ${decode(c.text)}${c.price ? ` — $${c.price}/guest` : ''}`);
		});
	}
	lines.push('');
	lines.push(`**Standard inclusions** (with most tiers): Tandoori Naan, Garlic Naan, Basmati Rice, Mango Chutney, Hot Sauce, Lentil Wafers.`);
	lines.push('');
	lines.push(`**Per-person add-ons:**`);
	lines.push(`- Extra veg appetizer: +$5/person`);
	lines.push(`- Extra non-veg appetizer: +$6/person`);
	lines.push(`- Extra veg curry: +$5/person`);
	lines.push(`- Extra non-veg curry: +$6/person`);
	lines.push(`- Tandoori veg / paneer: +$7/person`);
	lines.push(`- Tandoori grilled chicken: +$7.50 to +$8.50/person`);
	lines.push(`- Desserts (Gulab Jamun / Rasmalai): +$1.50 to +$4.50/person`);
	lines.push('');
	lines.push(`**Setup options (food container):**`);
	const setup = byId[73];
	if (setup) {
		setup.choices.forEach((c) => lines.push(`- ${decode(c.text)}`));
	}
	lines.push('');
	lines.push(`**Dinnerware:**`);
	const dw = byId[76];
	if (dw) {
		dw.choices.forEach((c) => lines.push(`- ${decode(c.text)}`));
	}
	lines.push('');
	lines.push(`**Delivery fees by distance:**`);
	const df = byId[150];
	if (df) {
		df.choices.forEach((c) => lines.push(`- ${decode(c.text)}`));
	}
	lines.push('');
	lines.push(`**Early-delivery surcharge:** 11:30 AM delivery slot has a +$35 fee.`);
	lines.push('');
	lines.push(`**Spice levels:** Mild, Med, Med-hot, Hot, Extra Hot.`);
	lines.push('');
	lines.push(`**Payment:** cash or credit/debit on delivery.`);
	lines.push('');
	lines.push(`**What changes by tier (which menu fields the form shows):**`);
	lines.push(`- *Option 1 ($23.95)*: 2 veg curries + 1 non-veg curry. No appetizers.`);
	lines.push(`- *Option 2 ($25.95)*: 2 veg curries + 2 non-veg curries. No appetizers.`);
	lines.push(`- *Option 3 ($27.95)*: 1 veg appetizer + 2 veg + 2 non-veg curries.`);
	lines.push(`- *Option 4 ($28.95)*: 1 non-veg appetizer + 2 veg + 2 non-veg curries.`);
	lines.push(`- *Vegetarian/Vegan ($24.95)*: 2 veg curries + 2 vegan curries. No meat.`);
	lines.push(`- *Appetizer/Street Food ($26.95)*: 1 veg appetizer + 1 second appetizer + 2 street food picks.`);
	lines.push(`- *Meat Lovers ($31.95)*: 2 chicken curries + 2 lamb curries. No vegetarian unless added.`);
	return lines.join('\n');
}

function buildWeddingDigest(menuSelector) {
	const f = menuSelector;
	const byId = Object.fromEntries(f.fields.map((x) => [x.id, x]));
	const lines = [];
	lines.push(`---\n\n## WEDDING CATERING DIGEST (Menu Selector, form 18)\n`);
	lines.push(`Per-guest tiers (price varies by number of dishes and inclusions):`);
	const opt = byId[73];
	if (opt) {
		opt.choices.forEach((c) => lines.push(`- ${decode(c.text)}${c.price ? ` — $${c.price}/guest` : ''}`));
	}
	lines.push('');
	lines.push(`Higher-tier options (5 and 6) include extra appetizers, multiple non-veg curries, and tandoori grill items. Option 6 is the most extensive ($60/guest).`);
	lines.push('');
	lines.push(`All wedding tiers come with: Salad Spread, Tandoori Naan, Garlic Naan, Basmati Rice, Tamarind & Date Chutney, Mint & Cilantro Chutney, Mango Chutney, Spicy Tomato Chutney, Lentil Wafers.`);
	return lines.join('\n');
}

function buildGroupDiningDigest(group) {
	const lines = [];
	lines.push(`---\n\n## GROUP DINING DIGEST (in-restaurant, form 8)\n`);
	lines.push(`For dining inside a Sula restaurant with 7 to 30 guests (40 to 120 for private events).`);
	lines.push('');
	lines.push(`**Locations:** Sula Commercial Drive, Sula Main Street, Sula Davie Street.`);
	lines.push('');
	lines.push(`**Two paths:**`);
	lines.push(`- *A la Carte / Set Menu Option* — pick from preset family-style menus, fits 7 to 30 guests.`);
	lines.push(`- *Custom Menu / Private Event Request* — for fully bespoke menus, fits 7 to 120 guests.`);
	lines.push('');
	lines.push(`**Set menus by group size:**`);
	lines.push(`- 7-12 guests: A la carte with a $39/guest minimum spend.`);
	lines.push(`- 12-20 guests: Family Style. Three menu prices: $39 (vegetarian/vegan), $45 (Family Style 2), $60 (Family Style 3).`);
	lines.push(`- 20-30 guests: Family Style at the same prices, OR Chef-Tailored at $60 ("Sweet Memories of Karnataka"), $75 ("Visit to Maharashtra"), or $120 ("All India Trip").`);
	lines.push('');
	lines.push(`**Lunch/dinner time slots vary by location.** Sula Davie has more slots than Main. Reservation policy must be agreed to.`);
	return lines.join('\n');
}

function buildPatioDigest(patio) {
	const f = patio;
	const byId = Object.fromEntries(f.fields.map((x) => [x.id, x]));
	const lines = [];
	lines.push(`---\n\n## PATIO BUY OUT DIGEST (form 25)\n`);
	lines.push(`Rent a Sula patio for a private event.`);
	lines.push('');
	const choice = byId[12];
	if (choice) {
		lines.push(`**Patio choices and capacity:**`);
		choice.choices.forEach((c) => lines.push(`- ${decode(c.text)}`));
		lines.push('');
	}
	const slot = byId[13];
	if (slot) {
		lines.push(`**Booking slots:**`);
		slot.choices.forEach((c) => lines.push(`- ${decode(c.text)}`));
	}
	return lines.join('\n');
}

function main() {
	const raw = readFileSync(SOURCE, 'utf8');
	const data = JSON.parse(raw);
	const forms = RELEVANT_FORM_IDS.map((id) => data[id]).filter(Boolean);
	const byId = Object.fromEntries(forms.map((f) => [String(f.id), f]));

	let out = buildHeader();
	out += buildBody(forms);
	if (byId['27']) out += '\n' + buildPricingDigest(byId['27']);
	if (byId['18']) out += '\n' + buildWeddingDigest(byId['18']);
	if (byId['8']) out += '\n' + buildGroupDiningDigest(byId['8']);
	if (byId['25']) out += '\n' + buildPatioDigest(byId['25']);

	const approxTokens = Math.round(out.length / APPROX_CHARS_PER_TOKEN);
	console.log(`[forms] ${forms.length} forms processed`);
	console.log(`[forms] knowledge: ${out.length} chars, ~${approxTokens} tokens`);

	mkdirSync(path.dirname(OUT), { recursive: true });
	const ts = `// AUTO-GENERATED by scripts/build-form-knowledge.mjs from data/gravity-forms.json
// Do not edit by hand — re-run the script when Shar provides a new export.
//
// Generated: ${new Date().toISOString()}
// Forms: ${forms.length} (1, 3, 4, 8, 18, 25, 27)
// Approx tokens: ${approxTokens}

export const FORM_KNOWLEDGE = ${JSON.stringify(out)};
export const FORM_KNOWLEDGE_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};
`;
	writeFileSync(OUT, ts);
	console.log(`[forms] wrote ${OUT}`);
}

main();
