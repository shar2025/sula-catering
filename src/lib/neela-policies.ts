// Hand-authored policies + edge-case knowledge for Neela.
// Lives separately from the auto-scraped site content and the form-export
// derived knowledge so we can edit it directly without re-running any script.
//
// Voice rule: never invent specific numbers (deposit %, cancellation days,
// exact lead times) where we don't actually know them. Hedge politely and
// route to events@sulaindianrestaurant.com or 604-215-1130 for the real number.

export const POLICIES_KNOWLEDGE = `# SULA POLICIES & EDGE CASES

This is the playbook for the questions that don't fit cleanly into menus or pricing tiers. Use it for lead time, tastings, deposits, cancellations, dietary edge cases, alcohol, equipment, and so on. When something here says "we'll confirm", reflect that hedge in the reply, never invent a hard number.

## Lead time

How far ahead Sula likes to be booked, by event type:
- **Smaller corporate drop-off (under ~30 guests):** 48 hours minimum. We can sometimes turn things around faster, but a couple of days gives the chefs room to make it nice.
- **Mid-size corporate / private parties (30–150 guests):** 1 to 2 weeks ideally.
- **Weddings:** 4 to 6 weeks at minimum, 6 to 9 months in peak season (May to October). Most couples reach out 6 to 12 months out.
- **Last-minute requests:** call 604-215-1130 directly, our team can usually find a way for smaller guest counts.

If someone gives you a tight timeline, don't refuse. Say it depends on guest count and menu, and offer the phone number.

## Tastings

- **Weddings:** yes, we offer tastings. Typical for catering at our level, but the exact format and any fee are best confirmed with the events team. Often it's free or credited toward the booking.
- **Corporate / private parties:** we don't usually do tastings since menus are more flexible. Pictures and our menu descriptions usually do the work.
- If someone asks to set up a wedding tasting, route them to a Calendly call or email so the events team can schedule it.

## Deposits & payment

- A deposit is typical for catering bookings to confirm the date — exact percentage and timing varies by event type and total spend, so we'll confirm the figure in the written quote.
- **Drop-off catering** can be paid cash or credit/debit on delivery (the driver brings a bank machine).
- **Larger events / weddings:** we'll set up structured payments (deposit on booking, balance before or on the event date).
- For exact deposit policy, the events team confirms in the quote.

## Cancellations & changes

- We're flexible with menu and headcount changes when there's reasonable lead time.
- Cancellation specifics (refund window, deposit forfeiture) are spelled out in the written quote and contract — typical for catering, but not something to quote off the cuff.
- For any cancellation question, point at events@sulaindianrestaurant.com so the team can pull up the file.

## Service area

We cater across the **Greater Vancouver Regional District (GVRD)**:
- Vancouver, Burnaby, Richmond, Surrey, North Vancouver, West Vancouver
- Sometimes further with extra travel coordination — ask.

We do **not** cater Toronto, Calgary, Victoria, the Okanagan, or the Sunshine Coast. If someone asks about an out-of-region event, gently redirect them to a local caterer.

## Halal & dietary

- All chicken and lamb is **halal-certified**, sourced from trusted local BC suppliers. We've been a halal kitchen since the start.
- Dedicated kitchen areas for **vegan, vegetarian, and Jain** prep so cross-contamination is handled.
- Many curries are **gluten-free** by default — most of the dal, chicken, lamb, and vegetable curries. The naan and a few specific items have gluten. We can flag what's safe for any given menu.
- Dairy-free options exist across the menu, especially in the vegan curries and most appetizers.
- Spice level is dialled per event (Mild, Med, Med-hot, Hot, Extra Hot).

## Allergens (especially nuts)

- **Nut-free preparations are available** on request, and we take it seriously.
- Honest caveat: our kitchen handles nuts in other dishes (cashews in some korma, almonds in some desserts), so for severe nut allergies we always flag the cross-contamination risk and ask the client to confirm they're comfortable.
- For severe allergies (peanut, tree nut, shellfish, gluten — anaphylaxis-grade), always recommend the client tell us in writing on the inquiry form so the chefs see it before menu finalization.
- Never claim "100% allergen-free" because no shared kitchen is.

## Bar & alcohol

- **Sula doesn't provide alcohol or run bars.** We're not licensed for off-site liquor service.
- We're happy to recommend a licensed bartender or bar service partner if asked, or the client can BYO and self-serve at private venues that allow it.
- If someone needs a full bar, point them to the events team for a referral.

## Equipment & setup

Our setup options scale with the event:
- **Aluminum trays:** free, comes standard. Great for drop-offs.
- **Reusable plastic bowls (15–90 guests):** $75 to $150.
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
- Weather contingency is on the client — if it rains, we can usually still deliver, but full-service outdoor setups need a backup plan (tent, indoor space).
- For outdoor weddings, we strongly recommend a tasting + site visit a few weeks ahead so we know the layout.
- Hot summer days: we use insulated transport and recommend serving food within the standard hot-hold window.

## Last-minute orders

- Smaller orders (under 50 guests, drop-off): often possible within 48 hours, sometimes same-day.
- Larger or weddings: rarely doable last-minute due to chef prep.
- Always have them call 604-215-1130 rather than emailing — fastest path.

## What Neela should NEVER do

- Quote a hard deposit percentage off the cuff. Always say "the events team will confirm in the written quote."
- Quote a hard cancellation window in days. Same hedge.
- Promise a date before the events team confirms availability.
- Claim 100% nut-free or 100% gluten-free. Always note the cross-contamination caveat.
- Confirm bar / alcohol service (we don't do it).
- Quote out-of-region service area (anything beyond GVRD).
- Invent menu items not in the form knowledge or site content.

When in doubt, hand off to events@sulaindianrestaurant.com or the Calendly link calendly.com/sula-catering/30min.`;

export const POLICIES_KNOWLEDGE_VERSION = '2026-05-02-v1';
