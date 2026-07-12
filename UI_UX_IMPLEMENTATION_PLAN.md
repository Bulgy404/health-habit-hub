# Health Habit Hub — UI/UX Implementation Plan

_Derived from [`docs/archive/UI_UX_REVIEW.md`](docs/archive/UI_UX_REVIEW.md) (2026-07-09, archived). Organised as discrete tickets grouped into three phases by effort/impact. Each ticket lists the files to touch, the change, and acceptance criteria. Phases are independently shippable._

_Status as of 2026-07-12: Phase 1 (T1–T6) and T14 are done — see ✅ markers below. T7–T13, T15–T16 remain open._

## Shared foundation: the "action green" token

Several tickets depend on one decision, so make it first.

- **New brand tokens** (use everywhere white text sits on green):
  - `actionGreen = #2E8C00` (hover/pressed `#256F00`) — 4.31:1 on white; pair with a slightly larger/bolder label, or go one step darker to
  - `actionGreenStrong = #15803D` (5.02:1) if you want full AA on normal text.
  - Keep `#45B700` as `accentGreen` for icons, graphs, focus rings, indicators — never as a background under white text.
- Decision to confirm before starting: **`#2E8C00` (keeps the vivid brand look, AA for large/bold text) vs `#15803D` (fully AA, slightly more muted).** Recommendation: `#2E8C00` for buttons with the existing `w800` bold labels, `#15803D` only if design wants AA on everything.

---

## Phase 1 — Quick wins (est. ~1 day total)

### T1. ✅ Done — Mobile: darken primary green for buttons + nav
**Files:** `mobile/lib/app.dart`
- Add `const _kAction = Color(0xFF2E8C00);` and use it as `backgroundColor` in `elevatedButtonTheme`, `filledButtonTheme`, and as `indicatorColor` + selected icon/label colour in `navigationBarTheme` (both light and dark builders).
- Leave `_kPrimary`/`_kAccent` as the seed and accent.
**Acceptance:** every filled/elevated button and the selected nav destination render on `#2E8C00`; contrast of white label ≥ 4.3:1; no visual regression in dark mode.

### T2. ✅ Done — Admin: darken primary green for buttons + active nav
**Files:** `admin/src/app/globals.css`, `admin/src/components/sidebar.module.css`
- In `:root`, split the token: keep `--color-primary: #45b700` for accents, add `--color-primary-action: #2e8c00` and `--color-primary-action-hover: #256f00`.
- Point `.addButton`, `.saveBtn`, `.saveButton`, `.defaultBtn` backgrounds and `.navLinkActive` background at `--color-primary-action`.
**Acceptance:** active sidebar item and primary buttons use the darker green; white text ≥ 4.3:1; accent uses (focus ring, sliders, bar fills) still use `#45b700`.

### T3. ✅ Done — Admin: replace `opacity` hover with real colour states
**Files:** `admin/src/components/admin-page.module.css`, `admin/src/app/(admin)/studies/page.module.css` (and other page modules sharing the pattern)
- Replace `:hover { opacity: 0.9 }` on `.addButton`, `.saveBtn`, `.defaultBtn`, etc. with `background: var(--color-primary-action-hover)`.
**Acceptance:** no interactive element dims via opacity on hover; hover contrast never drops below the resting state.

### T4. ✅ Done — Admin: global `:focus-visible` ring
**Files:** `admin/src/app/globals.css`
- Add a global rule: `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: 4px; }` and remove any `outline: none` that isn't paired with a replacement.
**Acceptance:** keyboard Tab through sidebar links, buttons, table action buttons, and the language `<select>` shows a visible ring on each.

### T5. ✅ Done — Admin: remove the hard desktop lock
**Files:** `admin/src/app/(admin)/layout.module.css`
- Remove `min-width: 1280px` from `.shell`; add a breakpoint (e.g. `@media (max-width: 1024px)`) that reduces `.main` padding and prepares for the collapsible sidebar in T12.
**Acceptance:** at 1024px width there is no horizontal scroll of the whole app; content reflows.

### T6. ✅ Done — Mobile: reconcile theme divergences
**Files:** `mobile/lib/app.dart`, `mobile/lib/features/my_habits/my_habits_screen.dart`
- Unify card radius to 20 (fix the SRHI card's hardcoded `12`).
- Make dark-theme button radius the same 100px pill as light.
- Replace the dark `cardTheme` 2px green border with a borderless elevated surface (`#2A2A2A` on `#1A1A1A`, elevation 0–1).
**Acceptance:** buttons and cards have identical shape in light and dark; dark cards no longer show a green outline.

---

## Phase 2 — Consistency & polish (est. ~3–5 days)

### T7. Admin: design-token scale
**Files:** `admin/src/app/globals.css` + sweep of all `*.module.css`
- Define a type scale (`--fs-xs .75rem`, `--fs-sm .875rem`, `--fs-base .9375rem`, `--fs-lg 1.15rem`, `--fs-xl 1.75rem`) and a spacing scale (`--sp-1 .25rem` … `--sp-6 2rem`).
- Add missing colour tokens for the repeated one-off hexes (`#1d4ed8` → `--color-info`, `#dc2626` → `--color-error` already exists, `#f1f5f9` → `--color-surface-alt` already exists).
- Migrate modules to tokens, collapsing the ~10 near-duplicate font sizes and ~5 spacing values.
**Acceptance:** no raw `rem` font sizes or ad-hoc brand hexes remain in module CSS (grep clean); pages look unchanged or more consistent.

### T8. Mobile: move inline colours onto the theme
**Files:** `mobile/lib/screens/onboarding/welcome_screen.dart`, `mobile/lib/features/my_habits/my_habits_screen.dart`, and any screen using `Color(0xFF…)` literals
- Introduce a `ThemeExtension` (or `lib/theme/colors.dart`) exposing brand tokens; replace inline `Color(0xFF111827)/(0xFF6B7280)/(0xFF45B700)` with `colorScheme`/extension lookups.
**Acceptance:** `grep -r "Color(0xFF" lib/screens lib/features` returns only intentional data-viz colours; dark mode text is legible on every migrated screen.

### T9. Mobile: skeletons + illustrated empty states
**Files:** `mobile/lib/features/my_habits/my_habits_screen.dart` (loading + `noHabitsYet`), plus a reusable `lib/widgets/skeleton.dart` and `lib/widgets/empty_state.dart`
- Replace bare `CircularProgressIndicator` with skeleton cards; replace the centered grey sentence with the rounded-icon-tile motif + a primary "Create your first habit" CTA.
**Acceptance:** first load shows skeletons; empty habits screen shows icon, message, and a working CTA.

### T10. Mobile: haptics + microinteraction on habit logging
**Files:** `mobile/lib/features/my_habits/my_habits_screen.dart`
- On successful "Log today", call `HapticFeedback.lightImpact()` and animate the button to a checkmark/scale state before the SnackBar.
**Acceptance:** logging a habit produces a haptic tap and a visible success animation on a physical device.

### T11. Admin: table density tools
**Files:** `admin/src/components/admin-page.module.css`, `admin/src/app/(admin)/studies/page.module.css`, participants page
- Add sticky `thead` (`position: sticky; top: 0`), subtle zebra striping, sort-indicator affordance, and skeleton rows replacing the centered `loadingState` text.
**Acceptance:** long participant tables keep headers visible on scroll; loading shows skeleton rows; rows are visually scannable.

### T12. Mobile: nav labels + localisation
**Files:** `mobile/lib/screens/shell_screen.dart`, `mobile/lib/l10n/*.arb`
- Replace hardcoded English `_allTabs` labels with `l10n` keys; clarify "Recs"/"Share".
**Acceptance:** nav labels come from localisation and switch with locale; labels are unambiguous.

---

## Phase 3 — Larger / optional (scope before committing)

### T13. Admin: dark mode
**Files:** `admin/src/app/globals.css` (token swap under `[data-theme="dark"]`), a theme toggle in the sidebar footer, persistence
- Add dark values for every `--color-*` token; wire a toggle + `prefers-color-scheme` default. Use `#0f172a`-style surfaces, not pure black.
**Acceptance:** every admin page is legible in dark mode; toggle persists across reloads; charts remain readable.

### T14. ✅ Done (via a different path than originally scoped) — Admin: consolidate onto recharts
**Files:** ~~`admin/src/components/studies-analytics-tab.tsx`~~ (deleted — dead code, not migrated), `admin/src/app/(admin)/analytics/page.tsx`, `InsightsView.tsx`
- Replace hand-rolled SVG bar/line charts with themed recharts components sharing one colour/tooltip/font config.
- `studies-analytics-tab.tsx` turned out to be unreachable dead code (not wired into any route, found via static grep rather than actual usage), so the fix here was deletion rather than migration — the remaining live chart surfaces (`analytics/page.tsx`, `InsightsView.tsx`) already use recharts.
**Acceptance:** all admin charts use recharts; a single theme object controls their styling; keyboard/screen-reader accessible.

### T15. Admin: responsive sidebar collapse
**Files:** `admin/src/components/sidebar.tsx` + module, `layout.module.css`
- Below the T5 breakpoint, collapse the sidebar to an icon rail or off-canvas drawer with a hamburger toggle.
**Acceptance:** on a 13" laptop / split screen the nav collapses and content uses full width.

### T16. Admin: shared modal primitive
**Files:** new `admin/src/components/modal.tsx`, refactor `studies`, `admin-page` modals
- One modal component with a single backdrop token, focus trap, ESC-to-close, and body scroll-lock.
**Acceptance:** all modals share backdrop/behaviour; focus is trapped; ESC closes; background doesn't scroll.

---

## Sequencing & dependencies

- Do the **action-green decision** first — T1, T2, T3 depend on it.
- Phase 1 tickets are otherwise independent and can be parallelised.
- T7 (admin tokens) should land before or with T11/T13 so tables and dark mode consume the new scale.
- T8 (mobile tokens) should land before T9/T10 to avoid re-touching the same widgets.

## Verification per phase
- **Contrast:** re-run a contrast check on all white-on-green surfaces (target ≥ 4.3:1); confirm `#45B700` only appears as accent.
- **Keyboard:** Tab-through audit of the admin (every interactive element shows a focus ring).
- **Responsive:** admin at 1024px and 1280px with no whole-page horizontal scroll.
- **Mobile:** light/dark parity screenshot pass on the habits, onboarding, and settings screens.
- **Regression:** existing admin Jest tests (`admin/src/__tests__`) and mobile widget tests pass; add tests for new empty-state/skeleton widgets.
