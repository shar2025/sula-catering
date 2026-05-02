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

export const PUBLIC_KNOWLEDGE = `## SULA OWNERSHIP & FOUNDING (verified, MONTECRISTO, Stir, Niagara College Encore)

Founders: **Sharath Vittal and Nitesh Shetty**. Both grew up in **Mangalore**, India (the port city in Karnataka). They met at **Nitte Institute** in Mangalore at age 19, studying hotel & restaurant management. They moved to Vancouver, found employment with an Indian restaurant for sale on Commercial Drive, and bought it in 2010, when they were 23 years old. Both are also Niagara College alumni.

For their first ~7 years they served the existing North Indian menu. They've since evolved the concept to also showcase the South Indian and coastal Mangalorean cuisine of their childhood.

If a customer asks "who owns Sula?" or "who's behind it?", Neela can answer warmly with the founder story: two Mangalore guys who met at hospitality school at 19, took a leap at 23, built a Vancouver staple over 15 years.

## SULA AWARDS (verified; list grows over time)

**2024:**
- Georgia Straight Golden Plates, Best Indian Restaurant
- TripAdvisor Traveller's Choice

**2025 (banner year, lots of recognition):**
- Vancouver Magazine Restaurant Awards, **GOLD in Best Indian category** for Davie Street (announced May 5, 2025; cited "sense of confidence, and an ambitious menu that doesn't shy away from big, uncompromising flavours")
- Georgia Straight Golden Plates, Gold for Best Indian Restaurant
- OpenTable Awards, Best Overall Indian Restaurant
- TripAdvisor Travelers' Choice, Best of Vancouver Indian Restaurants

When relevant (price-comparison, "are you any good?", "why Sula?"), mention 1 or 2 awards naturally. Don't recite the whole list. Don't fabricate awards from years not above (e.g., don't claim a 2018 award unless it's added later).

Reviews: 4.4/5 on Restaurant Guru with 3,800+ reviews. #23 of 2,550 restaurants in Vancouver on TripAdvisor (Commercial Drive).

## SULA LOCATIONS (4 total, all in Vancouver)

1. **Commercial Drive**, 1128 Commercial Drive, **opened 2010**. The original. Grandview-Woodland / Trout Lake area. Indoor garden-style décor. North Indian + Mangalorean menu. Sula's anchor.
2. **Main Street**, 4172 Main Street, **opened 2020**. Riley Park / Mount Pleasant area. Coastal Mangalore + Mumbai street food + traditional North Indian. Award-winning Indian cocktail program. Daily Hive called it "must-try" at launch.
3. **Davie Street (West End)**, 1708 Davie Street, **opened February 28, 2024**. Steps from English Bay. **Modern fusion concept**, an innovative take on Central + Southern Indian cuisine. Executive Chef **Balvant "Bal" Ajagaonkar**. Vibrant **elephant-shaped stained glass wall**. Designed by David Wong (WHG Designs), built by KBR Projects. Daily lunch + dinner, 11am–10pm.
4. **Sula Café**, 260 East 5th Ave (Mount Pleasant), the newest. Takeout-only. Sula chai + Alai coffee partnership + house-made masala focaccia in partnership with Union Market + Indian-inspired baked goods. Replaced L'Atelier Patisserie. Café entrance is "underneath a sign with a monkey enjoying a warm drink." Mon-Fri 8am–4pm, Sat-Sun 9am–4pm.

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

export const PUBLIC_KNOWLEDGE_VERSION = '2026-05-02-v2';
