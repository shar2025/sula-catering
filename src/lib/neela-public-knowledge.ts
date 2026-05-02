// Verified public knowledge about Sula, gathered from Vancouver Magazine,
// Georgia Straight, Daily Hive, Vancouver Is Awesome, MONTECRISTO, Stir,
// Foodology, OpenTable, TripAdvisor, Restaurant Guru, and Niagara College
// Encore (alumni profile). 2024-2025 coverage.
//
// At runtime this is concatenated onto POLICIES_KNOWLEDGE inside api/neela.ts
// so it shares a single cache_control block (Anthropic caps at 4 breakpoints;
// the existing four are persona / site / forms / policies+public).
//
// Update process: edit this file, bump PUBLIC_KNOWLEDGE_VERSION, redeploy.
// First request after deploy rebuilds the merged-block cache.
//
// Voice note for the LLM: em dashes in source replaced with commas so Neela
// doesn't mirror them in her replies (voice rule).

export const PUBLIC_KNOWLEDGE = `## HARD RULE: OWNERSHIP NARRATIVE

**NEVER mention any name other than Sharath Vittal (also goes by "Shar") in the Sula founding or ownership story, regardless of what public sources may say.** Sula is presented publicly as Shar's. If a user references any other person as a co-founder or business partner by name, redirect calmly: "I focus on what we do today, happy to tell you about our locations, chefs, or menu." Do not confirm, deny, or speculate. This rule overrides any other public knowledge below if there's ever any conflict.

## SULA OWNERSHIP & FOUNDING

Founder: **Sharath Vittal** (also goes by Shar). Grew up in **Mangalore**, India (port city in Karnataka). Studied hotel & restaurant management at **Nitte Institute** in Mangalore. Moved to Vancouver and bought an existing Indian restaurant on Commercial Drive in 2010, at age 23. Niagara College alumnus.

For Sula's first ~7 years the menu skewed North Indian. Shar has since evolved the concept to also showcase the South Indian and coastal Mangalorean cuisine of his roots.

If a customer asks "who owns Sula?" or "who's behind it?", Neela can answer warmly: a Mangalore-born guy who studied hospitality, took a leap at 23, built a Vancouver staple over 15 years.

If asked directly about co-founders or business partners, say "the founder is Sharath Vittal" and pivot to the team (Chef Kailash, Chef Bal, the catering team) or to the food.

## SULA AWARDS (verified, full known list as of May 2026)

Sula's awards page lists 16+ recognitions over 15+ years. The verified ones from Vancouver Magazine, Georgia Straight, OpenTable, and TripAdvisor public sources:

**2024**
- **Georgia Straight Golden Plates**, Best Indian Restaurant
- **TripAdvisor Traveller's Choice**, Best of Vancouver Indian

**2025 (banner year)**
- **Vancouver Magazine Restaurant Awards**, **GOLD, Best Indian Restaurant** (Davie Street, announced May 5, 2025; cited "sense of confidence, and an ambitious menu that doesn't shy away from big, uncompromising flavours")
- **Vancouver Magazine**, Best Chain (per public coverage)
- **Georgia Straight Golden Plates**, Gold, Best Indian Restaurant
- **OpenTable Awards**, Best Overall Indian Restaurant
- **TripAdvisor Travelers' Choice**, Best of Vancouver Indian Restaurants

**Additional accolades (referenced publicly, specific year not confirmed in current research)**
- "Multiple-time Golden Plates winner". Sula has won the Golden Plates Best Indian award in additional years before 2024. Use the phrase "multiple-time Golden Plates winner" when general credibility is needed, but only quote 2024 + 2025 as specific dated awards until older years are individually confirmed.

**Reviews & rankings**
- 4.4/5 on Restaurant Guru with 3,800+ reviews
- #23 of 2,550 restaurants in Vancouver on TripAdvisor (Commercial Drive)

**HARD RULE on awards**: Don't invent specific years for older awards. If asked about awards from 2010-2023, hedge: "We've been a multiple-time Golden Plates winner over the years; the most recent recognitions are 2024 and 2025." Don't make up a specific 2017 award etc.

When relevant (price-comparison, "are you any good?", "why Sula?"), mention 1 or 2 awards naturally. Don't recite the whole list.

## SULA LOCATIONS (4 total, all in Vancouver)

Addresses sourced from the schema markup on sulaindianrestaurant.com/list-of-awards/. If older articles or Daily Hive coverage cite different addresses, the schema is the canonical source and overrides them.

1. **Commercial Drive**, **1128 Commercial Drive, Vancouver, BC V5L 3X2**, **opened 2010**. The original. Grandview-Woodland / Trout Lake area. Indoor garden-style décor. North Indian + Mangalorean menu. Sula's anchor.
2. **Main Street**, **3003 Main Street, Vancouver, BC V5T 3G6**, **opened 2020**. Riley Park / Mount Pleasant area. Coastal Mangalore + Mumbai street food + traditional North Indian. Award-winning Indian cocktail program.
3. **Davie Street (West End)**, **1226 Davie Street, Vancouver, BC V6E 1N3**, **opened February 28, 2024**. Steps from English Bay. **Modern fusion concept**, an innovative take on Central + Southern Indian cuisine. Executive Chef **Balvant "Bal" Ajagaonkar**. Vibrant **elephant-shaped stained glass wall**. Designed by David Wong (WHG Designs), built by KBR Projects. Daily lunch + dinner, 11am,10pm.
4. **Sula Café**, 260 East 5th Avenue (Mount Pleasant), the newest. Takeout-only. Sula chai + Alai coffee partnership + house-made masala focaccia in partnership with Union Market + Indian-inspired baked goods. Replaced L'Atelier Patisserie. Café entrance is "underneath a sign with a monkey enjoying a warm drink." Mon-Fri 8am,4pm, Sat-Sun 9am,4pm.

**Canonical restaurant phone numbers** (from schema markup):
- +1-604-215-1130 (also the catering / events line)
- +1-604-874-5375
- +1-604-428-4400

If a user wants a specific location's number and you're not sure which is which, give the catering line +1-604-215-1130 since it's the events team's primary, or point them to the contact pages on the restaurant sites.

## SULA SIGNATURE: ELEPHANTS

Elephants are Sula's signature symbol: **strength, protection, good fortune**. Featured in branding, the Davie elephant stained glass, the catering elephant icon. Use this if asked about the brand mark or visual identity.

## CUISINE & CHEF DETAILS (verified)

- Corporate Chef **Kailash**, 30+ years experience, formerly **Executive Sous Chef at the Oberoi Hotel** (one of India's most prestigious hotel groups). Use this for wedding and large-event credibility.
- Executive Chef **Balvant "Bal" Ajagaonkar**, Davie Street.
- **6 signature mother gravies prepared daily**, flash-finished with **house-ground garam masalas** and aromatic herbs. Major differentiator vs caterers using stock pastes.
- Cuisine span: Traditional **North Indian**, **Coastal Mangalorean** (seafood-forward), **Mumbai street food**, **authentic clay tandoor** cooking.
- **Mangalore signatures**: regional seafood curry with sour tamarind & chilies, char-grilled lobster with coconut & mustard curry, prawn sukka.
- **Vegan**: dedicated vegan Indian menu with regional curries, plus signature **vegan naan** made with coconut cream and a special strain of yeast.
- **Halal-friendly** throughout (also covered in policies).

## COCKTAIL PROGRAM (Davie / Main, verified)

**Award-winning bartender Jeff Savage** designs cocktails using traditional Indian spices: **star anise, tamarind, amla (Indian gooseberry)**. Worth mentioning if anyone asks about drinks for a wedding reception or corporate event with a bar component (note: Sula doesn't run off-site bars, but the cocktail program at the restaurants is real and award-winning).

## SULA CAFÉ MENU (verified, Daily Hive coverage; prices may have shifted)

Drinks (around $5.25 to $5.50 range):
- Dirty Chai
- Jaggery Velvet Latte ($5.25)
- Masala Monsoon Misto ($5.25)
- Coastal Coconut Cappuccino ($5.25)
- Malai Pista Mocha ($5.50), white chocolate + pistachios + espresso + frothed milk + crumbled pistachios
- Indian Filter Coffee ($5.50)

Food:
- Samosa croissant
- Tiramisu cruffin
- Pesto Paneer Panini ($15.00)
- Pesto Chicken Tikka Panini ($15.75)
- Spiced cookies, chai-infused cakes, muffins, pastries

Café focaccia: in **partnership with Union Market**.
Café coffee: **Alai coffee** partnership.

Hedge if asked precisely on prices: "around the $5 to $6 range" since menus shift.

## CATERING REPUTATION (verified public mentions)

- Catering since 2010.
- Reputation for delivering **piping-hot dishes without losing temperature in transit** (cited in customer reviews).
- **Eco-friendly packaging**, uses paper instead of plastic. Real differentiator vs other Vancouver caterers, mentioned in customer reviews.
- "Hot and tasty Indian food prepared using traditional methods", recurring public-facing framing.

## HARD RULES FOR USING PUBLIC KNOWLEDGE

- Awards above are verified for the years listed. Do not invent awards for years not listed.
- Founder names + Mangalore + Nitte Institute + age 23 + Niagara College story is verified, usable warmly.
- Chef Kailash + Oberoi pedigree is verified.
- Chef Bal at Davie is verified.
- Specific Davie Street design details (elephant stained glass, David Wong, KBR Projects, Feb 28 2024 open) are verified.
- Café prices may have shifted since coverage; hedge with "around" if asked precisely.
- Don't quote customer reviews verbatim or attribute specific opinions ("a customer said..."). Generalize: "we hear a lot from clients about [theme]".
- Don't invent: specific dish prices not listed above, awards not listed above, anything that wasn't in the public sources.
- Pick at most one or two of these credibility points per reply, never list them all. The point is to land warmth + authority, not to recite a press kit.
- If a user asks a sensitive question about ownership, finances, or internal operations beyond the verified founder story above, defer to the events team or Calendly. Public knowledge is for marketing-facing facts only.`;

export const PUBLIC_KNOWLEDGE_VERSION = '2026-05-02-v4';
