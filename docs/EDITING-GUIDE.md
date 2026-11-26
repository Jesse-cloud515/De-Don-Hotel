# Editing the Website Text and Photos

All the writing on the website lives in plain HTML files in the **`public/`** folder. Open them in any text editor; [VS Code](https://code.visualstudio.com) is free and highlights the code for you. Save, then refresh the browser to see your change.

## Which file is which

| Page | File |
|---|---|
| Home | `public/index.html` |
| Rooms & suites | `public/accommodation.html` |
| Each room's page | `public/room.html` (one template for every room) |
| Dining | `public/dining.html` |
| Experiences & amenities | `public/experiences.html` |
| Meetings & events | `public/meetings-events.html` |
| Gallery | `public/gallery.html` |
| About | `public/about.html` |
| Contact | `public/contact.html` |
| Booking page | `public/reservations.html` |
| Privacy / Terms | `public/privacy.html`, `public/terms.html` |
| Menu at the top of every page | `public/partials/header.html` |
| Footer at the bottom of every page | `public/partials/footer.html` |

Every file starts with a short note explaining what can be edited, and each section is marked with a banner like this:

```html
<!-- ═══════════ 2 · INTRODUCTION ═══════════ -->
```

## Changing text

Change only the words **between** the tags:

```html
<h2 data-split>More Than a Stay.<br>A Place to Belong.</h2>
              └──────────── edit this text ────────────┘
```

- `<br>` starts a new line inside a heading.
- `<em>…</em>` makes words *italic*, the gold-accent style in headings.
- `&amp;` is how HTML writes **&**. You can also simply type "and".
- `<p>…</p>` is one paragraph. To add a paragraph, copy a whole `<p>…</p>` line.

## Changing a photo

```html
<img src="https://images.unsplash.com/photo-...?auto=format&fit=crop&w=1400&q=78"
     alt="The lobby lounge with deep sofas">
```

1. Upload your photo in the dashboard (**Admin → Media library → Upload**) and click **Copy URL**. You get an address like `/uploads/lobby-a1b2c3.jpg`.
2. Paste it between the quotes of `src="…"`.
3. Describe the photo in `alt="…"`. Screen readers and Google use this text, and the gallery uses it as the caption.

You can also put image files straight into `public/uploads/` and use `src="/uploads/your-photo.jpg"`.

**Tip:** use landscape photos at least 2000 px wide, saved as JPG or WebP, under 1 MB if possible.

## Adding or removing items

Lists are built from repeated blocks. Copy a whole block to add an item; delete a whole block to remove one.

| What | Block to copy |
|---|---|
| Dining venue | `<article class="venue-row"> … </article>` |
| Signature dish / event venue photo | `<figure class="dish"> … </figure>` |
| Experience (experiences page) | `<article id="…"> … </article>` |
| Experience (home page list) | `<li class="xp__item"> … </li>` **plus** one matching `<img>` in `xp__media` (same position) |
| Guest review | `<div class="quote__slide"> … </div>` (they rotate automatically) |
| Gallery photo | one `<button data-cat="Rooms"> … </button>` line; `data-cat` is its filter category |
| Event venue row | one `<tr> … </tr>` in the table |
| Menu link | one `<a … href="/page">Name</a>` in `partials/header.html` (desktop **and** mobile list) |

## Things to leave alone

These attributes only make the animations and booking work. Keep them, even though you can change the text around them:

- `data-reveal`, `data-split`, `data-parallax`: animations
- `class="…"`: styling
- `id="…"` and `name="…"` on forms and booking elements
- Empty containers such as `<div id="home-rooms"></div>` and `<div id="room-list"></div>`: rooms are filled in here automatically

## What is NOT in the HTML

| Item | Where to change it | Why |
|---|---|---|
| Room names, descriptions, photos, prices, sizes, amenities, policies | **Admin → Rooms & availability** | The booking system uses the same data for availability and prices |
| Announcement bar at the top of the pages | **Admin → Website settings → Announcements** | Can be switched on and off without editing files |
| Hotel details used in emails | **Admin → Website settings → Hotel information** | Used in confirmation emails |

> **Contact details appear in several places.** When the phone, email or address changes, update `partials/header.html`, `partials/footer.html`, `contact.html`, the location section of `index.html`, and *Hotel information* in the dashboard. Use your editor's **Find in files** (Ctrl+Shift+F in VS Code) to find them all, e.g. search for `809 000 0000`.

## Page titles for Google

At the top of each file:

```html
<title>Dining · DE DON · Luxury Hotel in Abuja</title>
<meta name="description" content="A one- or two-sentence summary shown in Google results.">
```

Keep titles under about 60 characters and descriptions under about 155.

## Colours and fonts

All colours and fonts are defined once, at the top of `public/assets/css/style.css`, in the `:root { … }` block. Change `--gold: #B99A64;` and every gold detail on the site changes with it.

## About the demo content

Everything currently on the site is **sample content**: the address, phone numbers, venue names, chef, capacities, reviews, prices and all Unsplash photos. Replace each item with the hotel's real information before launch, and switch off the demo announcement in **Admin → Website settings → Announcements**.
