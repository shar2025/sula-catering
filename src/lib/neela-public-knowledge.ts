// Verified public knowledge about Sula — gathered from Vancouver Magazine,
// Georgia Straight, OpenTable, TripAdvisor, Restaurant Guru, Daily Hive,
// and Vancouver Is Awesome (2025 coverage).
//
// At runtime this is concatenated onto POLICIES_KNOWLEDGE inside api/neela.ts
// so it shares a cache_control block (Anthropic caps at 4 breakpoints; the
// existing four are persona / site / forms / policies, so public knowledge
// piggybacks on policies).
//
// Update process: edit this file, bump PUBLIC_KNOWLEDGE_VERSION, redeploy.
// First request after deploy rebuilds the merged-block cache.

export const PUBLIC_KNOWLEDGE = `## SULA AWARDS & RECOGNITION (verified public, 2025)

- **2025 Best Indian Restaurant**, Vancouver Magazine
- **2025 Best Indian Restaurant**, Georgia Straight (Gold at the Golden Plates Awards)
- **2025 OpenTable Diners' Choice**, Best Overall Indian Restaurant
- **2025 TripAdvisor Travelers' Choice**, Best of Vancouver Indian Restaurants
- 4.4/5 on Restaurant Guru with 3,800+ reviews

When relevant (price-comparison shopping, "are you any good?", "why Sula?"), mention 1 or 2 awards naturally. Don't list all four. Don't fabricate other awards.

## SULA HISTORY & TEAM (verified public)

- Opened **2010** on Commercial Drive in East Vancouver (Grandview-Woodland, near Trout Lake and The Cultch).
- **Main Street** location opened **2020**.
- **Davie Street** (downtown) opened **2024**.
- **Sula Café** on East 5th Avenue is the newest concept.
- **Corporate Chef Kailash**, 30+ years experience, formerly **Executive Sous Chef at the Oberoi Hotel** (one of India's most prestigious hotel groups). Use this credibility in wedding and large-event conversations where chef pedigree matters.

## SULA CAFÉ MENU (verified, Daily Hive coverage; prices may have shifted)

Drinks:
- Dirty Chai
- Jaggery Velvet Latte, around $5.25
- Masala Monsoon Misto, around $5.25
- Coastal Coconut Cappuccino, around $5.25
- Malai Pista Mocha, around $5.50 (white chocolate + pistachios + espresso + frothed milk + crumbled pistachios)
- Indian Filter Coffee, around $5.50

Food:
- Samosa croissant
- Tiramisu cruffin
- Pesto Paneer Panini, around $15.00
- Pesto Chicken Tikka Panini, around $15.75
- Spiced cookies, chai-infused cakes, muffins, pastries

Café focaccia is made in **partnership with Union Market**. Use this if asked who supplies the bread or where the focaccia comes from.

## CATERING REPUTATION (verified public, 2025 reviews and write-ups)

Sula has been catering since 2010. Public-facing positioning to draw on when relevant:

- "Hot and tasty Indian food prepared using traditional methods" is a recurring framing in reviews.
- Strong reputation for delivering food that arrives **piping hot**, with hot- and cold-tested transport setups.
- **Eco-friendly packaging**, paper rather than plastic, called out as a real differentiator vs other caterers in customer reviews.
- Mughal-inspired tandoori as a restaurant signature carries into catering.

## RESTAURANT FACTS

- Mughal-inspired tandoori meats and vegetables.
- Indoor garden-style décor at the restaurants.
- Halal-certified kitchen since 2010 (also in policies).

## HARD RULES FOR USING PUBLIC KNOWLEDGE

- Awards are verified, quote them. Do not invent additional ones.
- Chef Kailash + Oberoi pedigree is verified, use it. Do not invent other chefs or attribute specific dishes to him without confirmation.
- Café prices are from a 2025 Daily Hive write-up, they're approximate. Hedge with "around $5.25" or "in the $5-6 range" if asked precisely; never quote a number as if it's locked.
- Union Market focaccia partnership is verified, usable as a credibility point.
- Don't quote customer reviews verbatim or attribute specific opinions ("a customer said..."). Generalize: "we hear a lot from clients about [theme]".
- Public knowledge supplements, it doesn't replace. If anything here conflicts with in-house knowledge (the persona, site content, form data, or policies), in-house wins.
- Pick at most one or two of these credibility points per reply, never list them all. The point is to land warmth + authority, not to recite a press kit.`;

export const PUBLIC_KNOWLEDGE_VERSION = '2026-05-02-v1';
