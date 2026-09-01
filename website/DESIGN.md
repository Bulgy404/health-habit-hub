---
name: Health Habit Hub Website
description: The public marketing and information site for a TU Dresden health-habit research platform
colors:
  living-leaf: "#45b700"
  living-leaf-action: "#2e8c00"
  living-leaf-deep: "#256f00"
  living-leaf-soft: "#4ec600"
  living-leaf-tint: "#f0fdf4"
  research-ember: "#f97316"
  research-ember-action: "#ea580c"
  research-ember-deep: "#c2410c"
  research-ember-soft: "#fb923c"
  research-ember-tint: "#fff7ed"
  ink: "#0f172a"
  midnight-slate: "#1e293b"
  soft-slate: "#64748b"
  hairline: "#e2e8f0"
  paper: "#f8fafc"
  surface: "#ffffff"
  surface-alt: "#f1f5f9"
typography:
  display:
    fontFamily: "Fraunces Variable, Georgia, serif"
    fontSize: "clamp(2.5rem, 5.6vw, 4.125rem)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Fraunces Variable, Georgia, serif"
    fontSize: "clamp(1.75rem, 3.6vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.022em"
  body:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    letterSpacing: "0.09em"
rounded:
  sm: "9px"
  md: "13px"
  lg: "16px"
  xl: "20px"
  xxl: "22px"
  pill: "999px"
spacing:
  gutter: "28px"
  gap-sm: "14px"
  gap-md: "20px"
  gap-lg: "28px"
  section-y: "84px"
components:
  button-primary:
    backgroundColor: "{colors.living-leaf-action}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "11px 19px"
  button-primary-hover:
    backgroundColor: "{colors.living-leaf-deep}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 19px"
  button-ghost-hover:
    textColor: "{colors.living-leaf-deep}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "26px"
  chip:
    backgroundColor: "{colors.living-leaf-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
---

# Design System: Health Habit Hub Website

## Overview

**Creative North Star: "The Two-Sided Ledger"**

This site keeps an honest, dual-accounted book: green for what participants get, orange for what researchers get, structurally equal but never visually mixed. Most of the site runs on green, the resting default; the moment a visitor commits to the researcher path, an entire subtree remaps its accent to orange via a single `.rtheme` scope, and nothing else changes. It's the same typographic voice, the same cards, the same spacing, just re-tinted for the other side of the ledger.

The overall register is calm and credible, never flashy: a serif display face (Fraunces) for headlines gives it editorial warmth without tipping into "creative agency" theatrics, set against a plain-spoken sans (Figtree) for everything functional. Depth comes from large, softly blurred, ink-tinted shadows rather than borders or color blocking, and motion is restrained, entrance reveals and hover lifts, never loops or attention-grabbing loops. Confirmed rejections from prior iterations: hand-drawn illustration that reads as crude rather than considered (the participant/researcher profile mark was rebuilt for this reason), and abstract data-visualization filler (a flying-particle cluster) in place of real, readable content.

**Key Characteristics:**
- Editorial serif display (Fraunces) over a plain sans body (Figtree)
- One resting accent (green), one earned accent (orange), swapped by scope, never mixed on one surface
- Flat surfaces at rest; depth only from soft ink-tinted shadow on cards, brand-tinted glow only on hover
- Generous whitespace, large rounded corners (16-22px) on containers, full-pill only for compact interactive tags
- Real, honest content: real screenshots, real legal copy, illustrative data clearly labeled as illustrative, zero em dashes anywhere in copy

## Colors

The palette is two confident, moderate-saturation accents on a cool, near-white neutral base, never both accents on the same screen at once.

### Primary
- **Living Leaf Green** (`#45b700`, action `#2e8c00`, deep `#256f00`, soft `#4ec600`): the participant-facing accent and the site's resting default. Used for primary CTAs, links, the logo mark, eyebrows, and hover states across every surface that hasn't opted into the researcher scope.

### Secondary
- **Research Ember** (`#f97316`, action `#ea580c`, deep `#c2410c`, soft `#fb923c`): the researcher-facing accent. Never appears alongside Living Leaf Green in the same section; it takes over an entire subtree at once via the `.rtheme` class, which remaps the green custom properties to their orange equivalents.

### Neutral
- **Ink** (`#0f172a`): primary text color everywhere on light surfaces.
- **Midnight Slate** (`#1e293b`): background for the handful of intentionally dark sections (footer, the "fork" CTA block, the "how it works" block, the contact section). White/light text sits on this, never the reverse.
- **Soft Slate** (`#64748b`): secondary/muted text on light surfaces; becomes `#94a3b8` on Midnight Slate sections to keep the same relative contrast.
- **Hairline** (`#e2e8f0`): the only border color on light surfaces; becomes `#334155` on Midnight Slate sections.
- **Paper** (`#f8fafc`): page background.
- **Surface** (`#ffffff`): card and panel background on light sections.
- **Surface Alt** (`#f1f5f9`): the background of sections that need to sit one shade back from Paper without becoming a card (e.g. the architecture diagram section).

### Named Rules
**The Ledger Rule.** Green and orange never appear as competing accents in the same section. A component is either in the resting (green) world or has been scoped into `.rtheme` (orange) entirely; there is no per-element mixing.

## Typography

**Display Font:** Fraunces Variable (with Georgia, serif fallback)
**Body Font:** Figtree Variable (with system-ui, sans-serif fallback)

**Character:** An editorial serif for anything that carries the voice of the page (headlines, section titles, large numerals like architecture-step markers) against a clean, low-drama sans for everything the visitor reads to get something done (body copy, labels, buttons, form fields). The pairing does the "considered, not corporate" work without leaning on color or ornament to do it.

### Hierarchy
- **Display** (weight 500, `clamp(40px, 5.6vw, 66px)` on the home hero, tighter on interior heroes, line-height 1.06, letter-spacing -0.022em): page-defining `h1`s, one per page.
- **Headline** (weight 500, `clamp(28px, 3.6vw, 40px)`, same line-height/tracking): section titles (`.sec-title`), used once per section, never doubled with a body-sized subhead in the same visual weight.
- **Body** (weight 400, ~16-19px depending on context, line-height 1.6, max-width in the 60-78ch range): lead paragraphs and running copy.
- **Label** (weight 600, 12.5px, letter-spacing 0.09em, uppercase, colored `living-leaf-deep` or its orange equivalent): the small eyebrow tags above section headlines. Used sparingly, roughly once every 2-3 sections, never on every section.

### Named Rules
**The One Serif Rule.** Fraunces is reserved for display-weight moments (h1/h2/h3 and the occasional large numeral). It never appears in body copy, labels, or UI chrome; Figtree carries all of that.

## Layout

Content is contained by a single `.wrap` (`max-width: 1160px`, centered, `28px` horizontal padding) reused on every page. Sections default to `84px` of vertical padding (`section { padding: 78px 0 }` as the base, most sections override to 80-90px), which is the site's primary rhythm device rather than internal component spacing.

Hero sections use an asymmetric split (roughly `1.02fr / .98fr` or `.85fr / 1.15fr`, content one side, a visual asset or illustration the other), never a centered hero. Feature grids use either a 2-column bento (participant mockups) or a 2x2 grid (the shared habit-graph cluster), and 3-column card rows for shorter, more uniform content (capabilities, architecture explainer cards, "how it works" steps).

Breakpoints in active use: `900px` (the main tablet collapse: nav links hide, asymmetric heroes and multi-column grids go single-column), `820px` and `700px` (component-specific bento/grid collapses), `560px` (form rows stack), `480px` (nav chrome compacts: brand wordmark hides to just the logo mark, buttons and the language switch shrink).

### Named Rules
**The Single-Column Floor Rule.** Every multi-column layout in this system, regardless of its desktop shape, collapses to one column on narrow viewports. No layout is allowed to overflow horizontally; this was a real, shipped bug (the nav overflowed below ~480px) and is now a hard floor, not a suggestion.

## Elevation & Depth

Flat by default. Cards and panels sit on the page with a `1px solid` hairline border and, where they need to visually lift off the page, a large, heavily-blurred, negative-spread shadow tinted toward ink-navy (`rgba(15,23,42,.24)` to `rgba(15,23,42,.34)`), never a tight, dark, default-looking drop shadow. On hover, interactive cards add a second, brand-tinted glow (green `rgba(46,140,0,...)` or orange `rgba(234,88,12,...)`, matching whichever accent scope they're in) on top of a small `translateY` lift.

### Shadow Vocabulary
- **Ambient card** (`box-shadow: 0 30px 60px -30px rgba(15,23,42,.24)`): resting elevation for feature cards and figures (the growth-graph card, the habit-cluster card).
- **Deep card** (`box-shadow: 0 40px 80px -40px rgba(15,23,42,.34)`): resting elevation for the largest showcase panels (the admin-portal screenshot frame).
- **Brand hover glow** (`box-shadow: 0 12px 28px -12px rgba(46,140,0,.4)` in the green scope, `rgba(234,88,12,.4)` in the orange scope): added only on `:hover`/`:focus`, paired with a small lift.

### Named Rules
**The Earned Shadow Rule.** A shadow's color is either neutral ink (resting state) or the active accent (hover/interaction state). It is never the opposite accent, and it is never pure black.

## Shapes

Two radius families, used consistently by role. Containers (cards, tiles, panels, the shot-frame) use a soft, generous radius between 16px and 22px, larger for bigger panels. Buttons and badges use a tighter 11-13px radius. Compact interactive tags (the habit-cluster's example-habit chips) are the one place the system uses a full pill (999px), which reads as "small, tappable, categorical" against the otherwise soft-square language of everything else.

### Named Rules
**The Pill-Is-For-Tags Rule.** Full-radius pill shapes are reserved for small, individual, categorical tags. Cards, panels, and buttons never go full-pill; that would blur the one visual cue that tells a visitor "this is a compact, filterable unit" from "this is a container."

## Components

### Buttons
- **Shape:** 11px radius by default, 13px for the large (`btn-lg`) variant used in hero CTAs and the contact form.
- **Primary:** `Living Leaf Green` action fill (`#2e8c00`) with white text; on hover, deepens to `#256f00` and gains a brand-tinted glow. In the researcher scope, the same button is Research Ember instead, no other change.
- **Ghost/Secondary:** white/surface fill, `hairline` border, ink text; on hover the border and text shift to the active accent's deep shade. Used for secondary CTAs sitting beside a primary button.
- **Tactile feedback:** `:active` scales to `0.97`.

### Chips
- **Habit-cluster chips:** pill-shaped, tinted to a 9% mix of their category's color over transparent, ink text, a subtle alternating rotation (-1deg to +1.2deg) for an organic, hand-placed feel. On hover, the border solidifies to the category color and the chip lifts and de-rotates. Hovering one chip also dims every chip outside its category to 45% opacity, a lightweight way of showing "these are grouped" without a real force-directed layout.
- **App/language badges:** rounded-rectangle (13px), not pill; carry a two-line label (small caption over a bold primary label), used for the App Store badge and the "coming soon" Google Play placeholder.

### Cards / Containers
- **Corner style:** 16-22px depending on size (see Shapes).
- **Background:** `surface` (white) on light sections, `#243044` on Midnight Slate sections.
- **Shadow strategy:** see Elevation & Depth; ambient at rest, brand-glow plus lift on hover.
- **Border:** 1px `hairline` on light surfaces, 1px `#334155` on dark surfaces.
- **Internal padding:** 24-30px is the working range for card bodies.

### Inputs / Fields
- **Style:** white/surface fill, `hairline` border, 11px radius, label sits above the field (never a placeholder-as-label).
- **Focus:** border shifts to the active accent, plus a soft 4px accent-tinted glow ring (no default browser outline).
- **On dark sections** (the researcher contact form): fill becomes `#1a2536`, border `#334155`, text white, focus ring re-tints to Research Ember.

### Navigation
- Sticky, translucent (`backdrop-filter: blur(20px) saturate(180%)`), 68px tall, single row.
- Primary links hide below 900px (no hamburger substitute is currently implemented; only the brand mark, language switch, and portal CTA remain).
- Below 480px, the brand wordmark hides to just the logo mark and the language switch/CTA compact their padding, so the row never overflows regardless of viewport width.

### Profile Illustration (signature component)
A hand-authored SVG bust-profile silhouette (no photography, no icon library) that dynamically recolors between Living Leaf Green and Research Ember depending on which path option (`participant`/`researcher`) the visitor is hovering, via a `data-face` attribute swap and two CSS custom properties (`--face-a`/`--face-b`). Carries a soft, low-opacity halo behind it and a subtle white rim-light stroke along its front edge for dimensionality. This is the system's one deliberate hand-drawn mark; it exists because the brief explicitly called for a dynamically-recoloring illustration, not because hand-rolled SVG is a general pattern here.

## Do's and Don'ts

### Do:
- **Do** keep green and orange scoped to entire subtrees (`.rtheme`), never mixed within one section.
- **Do** use Fraunces only for display-weight headlines and large standalone numerals; everything else is Figtree.
- **Do** tint shadows to ink-navy at rest and to the active brand accent on hover; never ship a pure-black or untinted shadow.
- **Do** collapse every multi-column layout to a single column below its breakpoint, and verify it at a true narrow viewport, not just a resized desktop window.
- **Do** label illustrative or example content as illustrative in the copy itself (see the growth graph's "illustrative example" caption and the habit-cluster's "not real entries" note); never present invented data as real.
- **Do** write zero em dashes in any visible copy, in either language.

### Don't:
- **Don't** introduce a third accent color; the palette is Living Leaf Green, Research Ember, and neutrals, nothing else.
- **Don't** go full-pill on anything larger than a compact tag; cards, panels, and buttons keep the 11-22px soft-radius family.
- **Don't** hand-roll a decorative SVG illustration by default; the profile mark is a named, deliberate exception, not a precedent for more illustration.
- **Don't** stack more than one small-caps "eyebrow" label every 2-3 sections; it's a rationed device, not a default header pattern.
- **Don't** add a fourth data-visualization attempt without direction from the product owner first; two prior illustrative-graph concepts were already rejected before the current one shipped.
