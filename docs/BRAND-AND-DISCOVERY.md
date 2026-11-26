# DE DON: Brand, Design System & Discovery

## 1. Positioning

**DE DON is a private residence in the capital that happens to be a hotel.**

The brand's promise is *belonging*: the confidence of being expected, understood and looked after, in a city where most guests arrive with something important to do.

| Audience | What they need from DE DON | How the site speaks to them |
|---|---|---|
| Government officials, diplomats, delegations | Discretion, security, reliability | "Discretion" as a core value; group/delegation CTA; quiet, unshowy tone |
| Business executives, corporate organisations | Efficient stays, workspace, meetings | Executive room positioning, business centre, meetings & events |
| International travellers | Trust, clear information, easy booking | Clean booking flow, transparent "request, then confirmation" model |
| Luxury leisure, couples and families | Comfort, beauty, experiences | Editorial photography, dining, wellness |
| Event organisers | Capacity, flexibility, a team that delivers | Venue table, event enquiry form |

**Tone of voice:** calm, precise, warm. Short sentences. Facts over superlatives. No "world-class", "unparalleled" or invented claims.

**Brand line:** *An Exceptional Stay. An Extraordinary Experience.*
**Hero line:** *A World of Comfort. A Sense of Belonging.*

## 2. Visual identity

### Mark

An **arch within an arch**, a doorway, with a keystone point above. It stands for the threshold of a home, the moment of arrival and being welcomed in. It is drawn as a single fine line so it works in gold foil, embossing, signage and as a favicon.

Files: `public/assets/img/logo.svg` (horizontal lockup) and `public/assets/img/favicon.svg` (mark on midnight).

**Wordmark:** DE DON in Cormorant Garamond Medium, tracked +340, with ABUJA beneath in Manrope SemiBold, tracked +580.

### Colour

| Name | Hex | Use |
|---|---|---|
| Deep Midnight | `#101B1B` | Primary dark: footer, dark sections, primary buttons, text on light |
| Warm Ivory | `#F4F0E8` | Primary background |
| Champagne Gold | `#B99A64` | Accent only: labels, hairlines, the mark, one CTA per view |
| Stone Grey | `#77746D` | Secondary text, captions |
| Rich Charcoal | `#202322` | Body text |
| Paper | `#FAF8F3` | Raised panels |
| Sand | `#EBE5D9` | Alternate section background |

Rule: gold is never a gradient and never a large fill behind text, except primary booking buttons.

### Typography

- **Display and headings:** Cormorant Garamond 300/400, with *italic* for emphasis words. Large sizes, tight leading.
- **Body and UI:** Manrope 400/500/600.
- **Labels:** Manrope 600, 11px, uppercase, tracked +300, in gold, preceded by a 36px hairline.

### Layout and motion principles

- A 12-column asymmetric grid: text in 4–5 columns, images in 7, alternating sides.
- Generous space: section padding scales up to 200px on large screens.
- Square corners everywhere. Hairline dividers instead of boxes and cards.
- **Motion:** headlines rise line by line, images reveal behind a mask, slow parallax, a curtain transition between pages, and a one-time monogram loader. Everything is turned off for visitors who prefer reduced motion.

### Extending to print and signage

- Stationery: ivory stock, midnight text, the mark foil-blocked in gold.
- Menus: Cormorant for dish names, Manrope small caps for sections, gold hairlines.
- Signage: the mark alone in brushed brass on dark stone; room numbers in Cormorant.
- Social: midnight or ivory tiles, one photograph, one line of Cormorant. Avoid busy templates.

## 3. Sitemap

```
/                     Home
├── /accommodation    Rooms & suites
│   └── /rooms/<slug> Individual room (one per room category)
├── /dining           Restaurants, signature dishes, private dining, table enquiry
├── /experiences      Experiences & amenities, concierge
├── /meetings-events  Venues, capacities, occasions, event enquiry
├── /gallery          Filterable photo gallery with lightbox
├── /about            Philosophy, story, values
├── /contact          Details, map, directions, contact form
├── /reservations     4-step reservation request · Manage a reservation (#manage)
├── /privacy  /terms  Legal templates
└── /admin/           Staff dashboard (not indexed)
```

## 4. Information the hotel must supply

Nothing below has been invented. The site shows a clear placeholder until each item is provided.

**Identity and legal**
- [ ] Registered company name and RC number
- [ ] Final logo approval (or the hotel's existing logo files)
- [ ] Privacy contact and data retention period
- [ ] Cancellation, deposit, no-show and child policies

**Location and contact**
- [ ] Full street address, district, postcode
- [ ] GPS coordinates (for the map)
- [ ] Reservations phone, WhatsApp, emails (reservations, events)
- [ ] Verified travel time from Nnamdi Azikiwe International Airport
- [ ] Distances to landmarks; parking and directions
- [ ] Social media accounts

**Accommodation**
- [ ] Room categories and names
- [ ] For each: size (m²), bed types, max adults/children, view, amenities, number of rooms
- [ ] Rates per night (and whether taxes and service charge are included)
- [ ] Check-in and check-out times

**Food and beverage**
- [ ] Restaurant and bar names, concepts, cuisine, opening hours, dress code
- [ ] Signature dishes (names, descriptions, photos)
- [ ] Whether in-room and private dining are offered

**Facilities and events**
- [ ] Confirmed list of facilities (pool, spa, gym, transfers, business centre…)
- [ ] Event venues with capacities by layout, sizes and photos

**Social proof**
- [ ] Genuine guest reviews, with permission and source
- [ ] Any awards or ratings, with proof

**Photography**
- [ ] Professional photography of exterior, lobby, every room category, bathrooms, dining, facilities, events, details. Ideally a 20–40 second hero video.

**Operations**
- [ ] Who handles reservation requests and the response-time target
- [ ] Payment provider preference (Paystack / Flutterwave / Stripe / bank transfer)
- [ ] Whether a PMS or channel manager is used
- [ ] Domain name and email provider

## 5. Design references (philosophy, not copied)

- **Aman**: restraint, silence, very little interface.
- **Rosewood**: "a sense of place", with local culture woven into the storytelling.
- **The Peninsula**: service precision and heritage.
- **Six Senses**: wellness storytelling, calm pacing.
- **Four Seasons / Ritz-Carlton**: clear booking paths and trust signals.

DE DON takes from them: editorial pacing, photography-led pages, minimal navigation, and an obvious but understated path to booking.
