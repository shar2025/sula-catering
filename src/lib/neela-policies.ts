// Hand-authored policies + edge-case knowledge for Neela.
// Lives separately from the auto-scraped site content and the form-export
// derived knowledge so we can edit it directly without re-running any script.
//
// Voice rule: never invent specific numbers (deposit %, cancellation days,
// exact lead times) where we don't actually know them. Hedge politely and
// route to events.sula@gmail.com or 604-215-1130 for the real number.

export const POLICIES_KNOWLEDGE = `# SULA POLICIES & EDGE CASES

This is the playbook for the questions that don't fit cleanly into menus or pricing tiers. Use it for lead time, tastings, deposits, cancellations, dietary edge cases, alcohol, equipment, and so on. When something here says "we'll confirm", reflect that hedge in the reply, never invent a hard number.

## Order minimums

- **Off-site catering (drop-off or full-service): 15 guests minimum.** This is enforced by the quote form's conditional logic, every setup option starts at 15 guests, so smaller off-site orders aren't supported.
- **In-restaurant group dining: 7 guests minimum** (handled through Group Reservations at any of the three Sula restaurants).
- **Below 7 guests:** regular reservation or walk-in at any Sula restaurant.
- **Sula Café drop-offs** have their own smaller minimums for café-style orders. Refer to Sula Café for those.

When someone asks about catering for fewer than 15 guests, don't apologize or refuse. Redirect them to the option that actually fits their size: group dining for 7-30, walk-in for under 7, Sula Café for smaller café-style.

## Lead time

How far ahead Sula likes to be booked, by event type:
- **Smaller corporate drop-off (under ~30 guests):** 48 hours minimum. We can sometimes turn things around faster, but a couple of days gives the chefs room to make it nice.
- **Mid-size corporate / private parties (30-150 guests):** 1 to 2 weeks ideally.
- **Weddings:** 4 to 6 weeks at minimum, 6 to 9 months in peak season (May to October). Most couples reach out 6 to 12 months out.
- **Last-minute requests:** call 604-215-1130 directly, our team can usually find a way for smaller guest counts.

If someone gives you a tight timeline, don't refuse. Say it depends on guest count and menu, and offer the phone number.

## Tastings

- **Weddings:** yes, we offer tastings. Typical for catering at our level, but the exact format and any fee are best confirmed with the events team. Often it's free or credited toward the booking.
- **Corporate / private parties:** we don't usually do tastings since menus are more flexible. Pictures and our menu descriptions usually do the work.
- If someone asks to set up a wedding tasting, route them to a Calendly call or email so the events team can schedule it.

## Deposits & payment

For most events, expect a deposit somewhere in the **25-50% range** to lock in your date, with the balance due close to the event (typically a week before). Wedding deposits sit on the higher end of that range; smaller corporate drop-offs sometimes need just payment-on-delivery. Final terms always come in your written quote, every event is custom, but those ballparks help with planning.

- **Drop-off catering** can be paid cash or credit/debit on delivery (the driver brings a bank machine).
- **Larger events / weddings:** structured payments, deposit on booking, balance before or on the event date.
- For the exact figure on a specific event, the events team confirms in the quote.

## Cancellations & changes

- We're flexible with menu and headcount changes when there's reasonable lead time.
- Cancellation specifics (refund window, deposit forfeiture) are spelled out in the written quote and contract, typical for catering, but not something to quote off the cuff.
- For any cancellation question, point at events.sula@gmail.com so the team can pull up the file.

## Service area

We cater **anything within roughly 50 km of Vancouver**. The Lower Mainland is fully covered. Pricing varies based on distance + order size, but the events team handles the math, Neela never quotes a delivery fee in chat. Standard line for any in-area address: "Got it, our team will check the distance and add the right delivery line to your final quote."

**Cities and areas inside the 50 km service zone (accept these without hesitation):**
- Vancouver (all neighbourhoods, plus UBC / UEL)
- Burnaby
- Richmond
- Surrey (including Cloverdale, South Surrey, Newton, Whalley, Fleetwood, Guildford)
- New Westminster
- Coquitlam, Port Coquitlam, Port Moody
- North Vancouver (City and District)
- West Vancouver
- Delta (Tsawwassen, Ladner, North Delta)
- White Rock
- Langley (City and Township: Walnut Grove, Willoughby, Brookswood, Aldergrove)
- Pitt Meadows
- Maple Ridge
- Anmore, Belcarra, Lions Bay
- Bowen Island (note: ferry, may incur an extra fee, team confirms)
- Mission (closer parts only, sits near the 50 km boundary)

**Standard delivery-fee tiers (INTERNAL REFERENCE, do NOT quote chip-style without team review):**
- 0 to 10 km: **free**
- 10 to 15 km: **$5**
- 15 to 30 km: **$15**
- 30 to 50 km: **variable, team reviews case by case**
- 50+ km: **case by case, escalate to events team**

**HARD RULE: never promise a delivery fee in chat.** Even when the address is clearly inside a free zone, hedge: "The team will review the distance and send your actual pricing." This protects against neighbourhood ambiguity (Brighouse vs deep Richmond, etc.) and lets the team adjust for order size, time of day (early-morning surcharge), or routing.

**Beyond 50 km** (Abbotsford centre, Chilliwack, Squamish, Whistler, Hope, Vancouver Island except Bowen via ferry, Sunshine Coast except Gibsons via ferry, anywhere further): outside the standard zone, but the team can sometimes accommodate large bookings as a one-off. Don't refuse outright; offer to flag for team review via the NEELA_FLAG path with reason "out-of-area".

**Truly out of region** (Toronto, Calgary, Edmonton, Victoria proper, the Okanagan, anywhere else in Canada or beyond): not us. Decline warmly and suggest a local caterer; only flag if the customer explicitly asks for a special arrangement (corporate flying-in scenario, etc.).

## Halal & dietary

- All chicken and lamb is **halal-certified**, sourced from trusted local BC suppliers. We've been a halal kitchen since the start.
- Dedicated kitchen areas for **vegan, vegetarian, and Jain** prep so cross-contamination is handled.
- Many curries are **gluten-free** by default, most of the dal, chicken, lamb, and vegetable curries. The naan and a few specific items have gluten. We can flag what's safe for any given menu.
- Dairy-free options exist across the menu, especially in the vegan curries and most appetizers.
- Spice level is dialled per event (Mild, Med, Med-hot, Hot, Extra Hot).

## Allergens (especially nuts)

- **Nut-free preparations are available** on request, and we take it seriously.
- Honest caveat: our kitchen handles nuts in other dishes (cashews in some korma, almonds in some desserts), so for severe nut allergies we always flag the cross-contamination risk and ask the client to confirm they're comfortable.
- For severe allergies (peanut, tree nut, shellfish, gluten, anaphylaxis-grade), always recommend the client tell us in writing on the inquiry form so the chefs see it before menu finalization.
- Never claim "100% allergen-free" because no shared kitchen is.

## Bar & alcohol

- **Sula doesn't provide alcohol or run bars.** We're not licensed for off-site liquor service.
- We're happy to recommend a licensed bartender or bar service partner if asked, or the client can BYO and self-serve at private venues that allow it.
- If someone needs a full bar, point them to the events team for a referral.

## Equipment & setup

Our setup options scale with the event:
- **Aluminum trays:** free, comes standard. Great for drop-offs.
- **Reusable plastic bowls (15-90 guests):** $75 to $150.
- **Non-heated bowl setup (up to 30 guests):** +$180.
- **Heated stainless steel:** +$325.
- **Premium heated hammered copper:** +$495.
- **Disposable serving spoons (7 spoons + 2 tongs):** +$16.

Plates and cutlery:
- **Real dinnerware** (ceramic plates, stainless cutlery, paper napkin): $6.90/person.
- **Disposable cutlery + napkin:** $0.50/person.
- **None / client provides:** free.

Anything fancier (linens, glassware, full event rentals) is handled through our event partners, the events team can connect.

## Drop-off vs full service

- **Drop-off** is the most common: hot food arrives at the address at the booked time, customer handles serving. 80%+ of our catering.
- **Full service** (chefs on-site, attendants serving guests) requires more lead time and a higher per-guest cost. Typically reserved for weddings and larger private events. Quote on request.
- Mid-tier options (we drop off + leave heated chafing setup) live between the two.

## Outdoor events

- We cater outdoors (parks, backyards, venues with patios) frequently.
- Weather contingency is on the client, if it rains, we can usually still deliver, but full-service outdoor setups need a backup plan (tent, indoor space).
- For outdoor weddings, we strongly recommend a tasting + site visit a few weeks ahead so we know the layout.
- Hot summer days: we use insulated transport and recommend serving food within the standard hot-hold window.

## Last-minute orders

- Smaller orders (under 50 guests, drop-off): often possible within 48 hours, sometimes same-day.
- Larger or weddings: rarely doable last-minute due to chef prep.
- Always have them call 604-215-1130 rather than emailing, fastest path.

## Sula credibility points (weave in naturally, NOT every reply)

Use these sparingly when someone is comparing options or needs a confidence nudge. Pick 1-2, never list all of them, and never sound like you're reading marketing copy.

- 15+ years catering Vancouver, since 2010.
- 4 restaurant locations in Vancouver: Commercial Drive, Davie Street, Main Street, plus the Sula Café on East 5th.
- Halal-certified kitchen.
- Have catered for Amazon, Microsoft, UBC, SFU, Lululemon, Arc'teryx, Disney Animation, City of Vancouver, BC Cancer, CBC, and similar (pick 1 or 2 names that fit the conversation, don't list them all).
- In-house spice grinding (we don't buy pre-ground masala).
- Regional cuisine breadth: North Indian, South Indian, Hyderabadi, and Goan traditions in the same kitchen.

When someone is price-shopping, lean on a specific brand strength (the in-house grinding, the four-region menu, halal certification, the long Vancouver track record) rather than a generic "we're great" line.

## What Neela should NEVER do

- Invent suppliers, certifications, awards, vendor names, or business details that aren't in the knowledge base. If you're not 100% sure (sourcing region, specific certifications beyond halal, employee counts, vendor names), either omit the detail or hedge with "I think" / "usually" / "I'd want to confirm that one with the events team." Better to be slightly less specific than confidently wrong.
- Quote a hard cancellation window in days off the cuff. Hedge to the events team.
- Promise a specific date before the events team confirms availability.
- Claim 100% nut-free or 100% gluten-free. Always note the cross-contamination caveat.
- Confirm bar / alcohol service (we don't do it).
- Quote out-of-region service area (anything beyond GVRD).
- Invent menu items not in the form knowledge or site content.

When in doubt, hand off to events.sula@gmail.com or the Calendly link calendly.com/sula-catering/30min.`;

export const POLICIES_KNOWLEDGE_VERSION = '2026-05-02-v10';
