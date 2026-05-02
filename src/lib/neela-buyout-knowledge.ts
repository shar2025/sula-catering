// In-restaurant group reservations + private buyouts knowledge.
//
// This is DISTINCT from off-site catering. Customers asking about hosting
// AT a Sula restaurant (birthday, office party, holiday dinner) need this.
// Source: sulaindianrestaurant.com/group-reservations-and-restaurant-buy-out/
//
// Concatenated onto POLICIES_KNOWLEDGE + PUBLIC_KNOWLEDGE inside api/neela.ts
// (same cache_control block; Anthropic caps at 4 breakpoints).

export const BUYOUT_KNOWLEDGE = `## IN-RESTAURANT GROUP RESERVATIONS & BUYOUTS

For groups eating IN-RESTAURANT (not catered off-site), Sula offers three tiers based on group size. All require advance notice. This is a different product from off-site catering. Don't conflate the two.

### KEY DISTINCTION (say this clearly when relevant)

- **Catering** = we bring the food TO YOU (off-site, drop-off or full-service, $24.95 to $31.95+ per person base, 15-guest minimum).
- **Buyout / Group Reservation** = YOU come to one of our three restaurants (in-house dining, minimum-spend model, family-style or chef-tailored menus).

If a customer says "I want to host my birthday at Sula", that's a BUYOUT. If they say "I want Sula food at my office", that's CATERING.

### 12-30 guests, Partial Buyout

- Family-style Set Menu (default)
- Chef-tailored menus available on request
- **72 hours advance notice required**
- A la carte and pre-order options based on in-house availability (send enquiry to confirm)
- No published minimum spend at this tier; depends on the day

### 30-40 guests, Partial Buyout

- Family-style Set Menu OR Chef-tailored menus (on request)
- 72 hours advance notice
- **Minimum spend (verified, plus tax):**
  - Mon-Thurs lunch (11 AM to 3 PM): **$2,400**
  - Mon-Thurs dinner: **$3,800**
  - Fri-Sun lunch (11 AM to 3 PM): **$2,800**
  - Fri-Sun dinner: **$4,200**

### 40-120 guests, Full Buyout

Three setup options:
- **Self-serve buffet OR family-style mini buffet (seated)**: up to 75 guests
- **Chef-tailored seated menu**: up to 75 guests
- **Cocktail banquet with dance floor (standing)**: 60 to 120 guests

**Minimum spend (verified, plus tax):**
- Mon-Thurs lunch (11 AM to 3 PM): **$3,300**
- Mon-Thurs dinner: **$6,600**
- Fri-Sun lunch (11 AM to 3 PM): **$3,900**
- Fri-Sun dinner: **$9,900**

### Restaurant capacities (verified)

- **Commercial Drive**: 2,600 sq ft, 75 seated / 120 standing
- **Main Street**: 2,400 sq ft, 65 seated / 100 standing
- **Davie Street**: 2,200 sq ft, 50 seated / 100 standing

### Menu options for buyouts and groups

- Family-Style Menus, ~$39 to $60 per person tiers (see form knowledge for specifics)
- Chef-Tailored Menus, ~$60 / $75 / $120 per person (also in form knowledge)
- Daily Specials

### Booking flow

- Group requests page: **/group-reservations-and-restaurant-buy-out/** on sulaindianrestaurant.com
- Booking form: Form 8 (Group Reservations) in the Gravity Forms suite
- Or Calendly 30-min discovery call: **calendly.com/sula-catering/30min**

### Routing rules (how Neela picks the right tier)

- **7 to 12 guests**: regular reservation, or Family-Style group dining at the lower end
- **12 to 30 guests**: 12-30 partial buyout, no published minimum, encourage sending an enquiry
- **30 to 40 guests**: 30-40 partial buyout, quote the minimum spend for their day/time slot
- **40 to 120 guests**: 40-120 full buyout, quote the minimum spend AND ask which setup style (seated buffet, chef-tailored, cocktail standing) so the right capacity matches
- **120+ guests**: doesn't fit any single location, suggest off-site catering OR splitting across two locations OR a dedicated event venue (Sula doesn't book those, refer to Calendly)

### Quote calculation for buyouts (different from catering)

- Minimum spend is the FLOOR (per the matrix above). Actual bill = minimum or higher based on what's actually ordered. The minimum is met by total bill, not per-head.
- Per-person family-style ($39 / $45 / $60) and chef-tailored ($60 / $75 / $120) help estimate whether a group will hit the minimum naturally.
- **Example arithmetic to model in your head**: 30-guest dinner Mon-Thurs at $45/pp family-style = $1,350. That's below the $3,800 minimum. Be honest with the customer: "At 30 guests on a Tuesday dinner, our $45 per person family-style would come in around $1,350, which is below the $3,800 minimum. You'd want either more guests, a higher menu tier, or to add drinks and extras to get there." Don't pretend the math works when it doesn't.

### Buyout fields in mode='full' order capture

When a customer signals in-restaurant booking ("birthday at your restaurant", "host my office at Sula", "private dinner"), capture:
- Location (Commercial / Main / Davie)
- Date + time slot (lunch 11 AM to 3 PM / dinner / specific time)
- Guest count, which maps to the tier (12-30 / 30-40 / 40-120)
- Setup style if 40-120 (seated buffet / chef-tailored / cocktail standing)
- Menu preference (family-style / chef-tailored / daily specials)
- Contact info (name, email, phone)
- Notes (occasion, decor, allergies, anything else)

Use mode='full' for buyout intent the same way as off-site catering. The events team handles both. The order JSON's eventType can be 'private' or 'corporate' as fits the occasion; in the customer-visible summary be explicit it's an in-restaurant booking.

### What Neela should NEVER do for buyouts

- Quote a buyout minimum that isn't on the matrix above. Don't make up a number for a tier or day combo not listed.
- Promise a date is available without confirming through the events team. Capacities are real, but date availability isn't something you can see.
- Conflate buyout pricing with catering pricing. They're separate menus and separate billing models.
- Quote a buyout for less than 12 guests; below 12 is a regular reservation, not a buyout.`;

export const BUYOUT_KNOWLEDGE_VERSION = '2026-05-02-v1';
