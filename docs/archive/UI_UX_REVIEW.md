> **Archived 2026-07-12.** This is the source review that
> [`UI_UX_IMPLEMENTATION_PLAN.md`](../../UI_UX_IMPLEMENTATION_PLAN.md) was
> derived from; several findings are already implemented (contrast, focus
> states, responsiveness — see that plan's ticket status). Kept here for
> historical context; track open UI/UX work in the implementation plan, not
> here.

# Health Habit Hub — UI/UX Review

_Scan date: 2026-07-09. Covers the two frontends: the Flutter participant app (`mobile/`) and the Next.js researcher admin panel (`admin/`). Recommendations are grounded in WCAG 2.2, current mobile-UX practice, and 2026 data-dashboard guidance (sources at the end)._

## TL;DR

The foundations are good. The mobile app already runs Material 3, a single Figtree type family, a coherent green brand, pill buttons, rounded cards, and both light and dark themes. The admin is cleanly structured with CSS variables, sectioned navigation, and consistent table/modal patterns. Neither is broken — the wins here are about **consistency, accessibility, and perceived polish**, not a redesign.

The single most important finding affects both apps: **white text on the brand green `#45B700` measures 2.62:1 contrast — it fails WCAG AA (needs 4.5:1).** This colour is used on nearly every primary button and the active nav item. Fixing it is a small change with outsized impact.

---

## The one cross-cutting issue: brand-green contrast

Measured contrast ratios (white foreground):

| Colour                  | Used for                                   | Ratio      | WCAG AA            |
| ----------------------- | ------------------------------------------ | ---------- | ------------------ |
| `#45B700` (primary)     | Primary buttons, active nav, FilledButtons | **2.62:1** | ❌ Fail            |
| `#2E8C00` (primaryDark) | SRHI card title, some accents              | 4.31:1     | ⚠️ Large text only |
| `#15803D` (green 700)   | "Copy all" button in admin                 | 5.02:1     | ✅ Pass            |

The bright green is beautiful as an **accent** (graphs, indicators, icons, focus rings) but should not carry white label text. Recommendation: introduce a darker "action green" around `#2E8C00`–`#15803D` for filled buttons and the active nav item, and keep `#45B700` for accents and data visualisation. This is a token change, not a visual overhaul — the brand still reads as green.

---

## Perspective 1 — The participant (mobile Flutter app)

### What's already strong

Material 3 with `ColorScheme.fromSeed`, a consistent Figtree type family via `google_fonts`, pill-shaped primary buttons with a generous 52px min height (meets the 44px touch-target minimum), rounded 20px cards, pull-to-refresh, an onboarding walkthrough with animated page dots, and offline-queue handling. This is a solid baseline.

### Improvements, highest impact first

**1. Fix the primary-button/nav contrast (see above).** In `mobile/lib/app.dart`, the `elevatedButtonTheme`, `filledButtonTheme`, and `navigationBarTheme` all pair white on `#45B700`.

**2. Stop hardcoding hex colours in screens; use the theme.** Screens re-declare brand colours inline — `Color(0xFF45B700)`, `Color(0xFF111827)`, `Color(0xFF6B7280)` appear in `welcome_screen.dart`, `my_habits_screen.dart`, and others rather than reading `Theme.of(context).colorScheme`. This is why the dark theme is at risk: any inline `Color(0xFF111827)` text stays near-black on a dark card. Centralise brand tokens (a `ThemeExtension` or a `colors.dart`) and reference `colorScheme.primary` / `onSurface` everywhere.

**3. Reconcile the two themes — they diverge in ways that read as inconsistency.**

- Card radius: light theme uses 20, but the SRHI prompt card hardcodes 12.
- Button radius: light theme is a 100px pill; dark theme drops to 20px — the same button changes shape by mode.
- Dark cards carry a **2px solid green border** and elevation 4, which looks heavier and more dated than the borderless light cards. Prefer a subtle surface elevation (`#2A2A2A` on `#1A1A1A`) over a coloured outline.

**4. Upgrade empty and loading states.** `MyHabitsScreen`'s empty state is a single centered grey sentence (`noHabitsYet`); loading is a bare `CircularProgressIndicator`. Current practice: skeleton screens (they read as faster than spinners) and empty states that include an illustration/icon plus a primary CTA ("Create your first habit"). You already have the icon-in-rounded-tile motif from onboarding — reuse it.

**5. Add microinteractions and haptics.** Logging a habit is the app's core loop; right now it shows a SnackBar. A short haptic tap (`HapticFeedback.lightImpact`) plus a checkmark/scale animation on "Log today" would make the primary action feel rewarding — this is exactly where microinteractions pay off in habit apps.

**6. Tighten the bottom nav labels.** "Recs" and "Share" are abbreviated/ambiguous; five destinations with terse labels raises cognitive load. Consider clearer labels ("Recommend", "Contribute") or icon+label pairs that are self-evident, and confirm the labels are localised (they're currently hardcoded English strings in `_allTabs`, unlike the rest of the app).

**7. Respect dynamic type.** Several screens use fixed `fontSize: 36 / 26 / 15`. Deriving sizes from `textTheme` lets the OS text-scaling setting work — a WCAG 2.2 and accessibility expectation.

---

## Perspective 2 — The researcher (Next.js admin panel)

### What's already strong

Clean CSS-variable token base, logically sectioned sidebar (Research / Operations / Configuration / Monitoring), consistent table and modal patterns, role-gated nav items, locale switching, and a proper input focus ring (`box-shadow: 0 0 0 3px rgba(69,183,0,.1)`). It's a competent, information-first admin.

### Improvements, highest impact first

**1. Make it responsive — the layout is hard-locked to desktop.** `layout.module.css` sets `min-width: 1280px` on the shell and the sidebar is a fixed 240px with no collapse. On a 13" laptop or a split screen this forces horizontal scrolling of the whole app. Add a breakpoint where the sidebar collapses to icons (or a drawer) and drop the hard min-width. Researchers increasingly review studies on smaller screens.

**2. Same green-contrast fix as mobile.** `.addButton`, `.saveBtn`, and `.navLinkActive` put white text on `#45B700` (2.62:1). The active nav item is the most visible offender — the item the user most needs to locate is the least legible. Use the darker action green.

**3. Replace `opacity: 0.9` hover states with real colour states.** Buttons hover by fading (`.addButton:hover { opacity: 0.9 }`), which lowers contrast further and looks cheap. Define explicit hover/active shades as tokens (e.g. `--color-primary-hover`).

**4. Add global `:focus-visible` styling.** Only inputs have a focus ring; buttons, nav links, table action buttons, and the language `<select>` have none. For a keyboard-driven admin handling participant data this is both an accessibility gap and a daily-usability one. One global `:focus-visible` rule covers it.

**5. Introduce a real design-token scale.** The CSS uses dozens of one-off values — font sizes at 0.7/0.75/0.78/0.8/0.82/0.85/0.875/0.9/0.95rem and spacings at 0.2/0.25/0.35/0.375/0.4rem — plus many hardcoded hexes (`#1d4ed8`, `#dc2626`, `#f1f5f9`) that duplicate or bypass the existing variables. Collapse to a small type scale, a spacing scale, and a fuller colour-token set. This is the biggest lever for making the admin feel consistent across its ~20 pages.

**6. Give tables the density tools researchers need.** Tables (participants especially) have no sticky header, no zebra striping, and no column sorting affordance in the shared styles; loading/empty are centered text. For dense data: sticky `thead`, subtle row striping, sort indicators, and skeleton rows on load. 2026 dashboard guidance is explicit that table-heavy research tools should be sortable/filterable/paginated with compact density and progressive disclosure (which your drill-down panels already do well).

**7. Consolidate the two chart systems.** `recharts` is a dependency, yet analytics hand-rolls SVG bar/line charts in CSS. Hand-rolled charts are harder to make accessible and keep visually consistent. Pick one (recharts is fine) and theme it once, so every chart shares colours, fonts, and tooltip styling.

**8. Consider a dark mode.** The participant app has one; the admin has none. 2026 guidance specifically recommends dark mode for data-dense, long-session monitoring work — which is what audit logs, system, and analytics are. Your token architecture makes this mostly a variable-swap. Nice-to-have, not urgent.

**9. Unify modal behaviour.** Backdrops vary (`rgba(0,0,0,.4)` vs `rgba(15,23,42,.45)`), and there's no shared focus-trap / ESC-to-close / scroll-lock contract visible in the styles. Standardise one modal primitive.

---

## Suggested sequencing

**Quick wins (hours, high impact):** action-green token for buttons + active nav (both apps); global `:focus-visible` in admin; remove the admin `min-width: 1280px`; reconcile mobile card/button radii.

**Medium (a few days):** design-token scales in admin; skeleton + illustrated empty states in mobile; table density improvements; haptics/microinteraction on habit logging; move inline mobile colours onto the theme.

**Larger / optional:** admin dark mode; consolidate onto recharts; responsive sidebar collapse; shared modal primitive.

---

## Sources

- [Mobile UX Best Practices 2026 — DevEntia](https://deventiatech.com/blogs/mobile-ux-best-practices-every-app-must-follow)
- [UI/UX Design Principles for Mobile Apps 2026 — GitNexa](https://www.gitnexa.com/blogs/ui-ux-design-principles-mobile)
- [Best Practices for Mobile App UX Design 2026 — Fora Soft](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices)
- [Dashboard Design Principles: The Definitive Guide 2026 — UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [Dashboard Design in 2026: Do's and Don'ts — Think Design](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/)
- [Dark Mode Dashboard Design Examples 2026 — AdminLTE](https://adminlte.io/blog/dark-dashboard-templates/)
- WCAG 2.2 (contrast 4.5:1 normal text; 44×44px touch targets) — W3C
