// Verifies the dish-pick capture by walking the rendered React tree from
// renderPage1 and asserting every expected dish name + diet badge appears.
// Skips the encoded PDF text-extraction route since @react-pdf/renderer
// produces compressed streams that aren't trivially greppable on Node 24.

const { renderPage1 } = await import('../src/lib/pdf/Page1Details.ts');

function flatten(node, out) {
	if (node == null || typeof node === 'boolean') return;
	if (typeof node === 'string' || typeof node === 'number') {
		out.push(String(node));
		return;
	}
	if (Array.isArray(node)) {
		for (const c of node) flatten(c, out);
		return;
	}
	if (typeof node === 'object' && node.props) {
		flatten(node.props.children, out);
	}
}

function extractText(node) {
	const out = [];
	flatten(node, out);
	return out.join(' ');
}

function checkOrder(label, order, expected) {
	const tree = renderPage1(order, { forCustomer: true });
	const text = extractText(tree);
	console.log(`\n===== ${label} =====`);
	console.log(text.replace(/\s+/g, ' ').slice(0, 1400));
	console.log('--- assertions ---');
	let allPass = true;
	for (const tok of expected) {
		const ok = text.includes(tok);
		if (!ok) allPass = false;
		console.log(`  ${ok ? 'OK   ' : 'FAIL '} contains "${tok}"`);
	}
	if (!allPass) process.exitCode = 1;
}

const baseOrder = {
	reference: 'SC-9999-MENU',
	createdAt: new Date().toISOString(),
	mode: 'full',
	eventType: 'private',
	eventDate: '2026-10-12',
	deliveryTime: '5:30 PM',
	guestCount: 60,
	serviceType: 'drop-off',
	deliveryAddress: '2189 West 41st Avenue, Vancouver, BC',
	dietary: { hasNutAllergy: true, notes: '1 guest with severe peanut allergy' },
	menuTier: 'Option 4 ($28.95)',
	menuItems: [
		{ kind: 'appetizer', name: 'Wings from Hell', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Paneer Butter Masala', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Dal Makhani', diet: 'Gluten Free' },
		{ kind: 'nonveg', name: 'Butter Chicken', diet: 'Gluten Free' },
		{ kind: 'nonveg', name: 'Lamb Rogan Josh', diet: 'Dairy & Gluten Free' }
	],
	additionalMenuItems: '+ extra garlic naan, + 2 mango chutney sides',
	contact: { name: 'Marcus Tan', email: 'marcus@example.com' }
};

checkOrder('full picks', baseOrder, [
	'Wings from Hell',
	'Gluten Free',
	'Paneer Butter Masala',
	'Dal Makhani',
	'Butter Chicken',
	'Lamb Rogan Josh',
	'Dairy & Gluten Free',
	'extra garlic naan',
	'VEG CURRY #1',
	'VEG CURRY #2',
	'NON-VEG CURRY #1',
	'NON-VEG CURRY #2',
	'APPETIZER',
	'ALLERGIES / DIETARY NOTES'
]);

const chefOrder = {
	...baseOrder,
	reference: 'SC-9999-CHEF',
	menuItems: [
		{ kind: 'appetizer', name: "Chef's choice" },
		{ kind: 'veg', name: "Chef's choice" },
		{ kind: 'veg', name: "Chef's choice" },
		{ kind: 'nonveg', name: "Chef's choice" },
		{ kind: 'nonveg', name: "Chef's choice" }
	],
	additionalMenuItems: undefined
};

checkOrder("chef's choice", chefOrder, [
	"Chef's choice",
	'VEG CURRY #1',
	'VEG CURRY #2',
	'NON-VEG CURRY #1',
	'APPETIZER'
]);

const veganOrder = {
	...baseOrder,
	reference: 'SC-9999-VEG',
	menuTier: 'Vegetarian/Vegan ($24.95)',
	menuItems: [
		{ kind: 'veg', name: 'Paneer Butter Masala', diet: 'Gluten Free' },
		{ kind: 'veg', name: 'Shahi Paneer', diet: 'Gluten Free' },
		{ kind: 'vegan', name: 'Channa Masala', diet: 'Dairy & Gluten Free' },
		{ kind: 'vegan', name: 'Aloo Saag', diet: 'Dairy & Gluten Free' }
	],
	additionalMenuItems: undefined
};

checkOrder('vegetarian / vegan tier', veganOrder, [
	'Paneer Butter Masala',
	'Shahi Paneer',
	'Channa Masala',
	'Aloo Saag',
	'VEG CURRY #1',
	'VEG CURRY #2',
	'VEGAN CURRY #1',
	'VEGAN CURRY #2'
]);

const noPicksOrder = {
	...baseOrder,
	reference: 'SC-9999-NONE',
	menuItems: undefined,
	additionalMenuItems: undefined
};

checkOrder('no menuItems (legacy fallback to tier name only)', noPicksOrder, [
	'Option 4 ($28.95)',
	'MENU'
]);
