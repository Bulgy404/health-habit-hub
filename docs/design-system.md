# Health Habit Hub — Mobile Design System

A short, definitive reference for the Flutter app's visual language: color
tokens, when to use which shade of green, the icon-style convention, and the
shared motion vocabulary. This exists because a real inconsistency shipped
without one — see [Background](#background) below — and the fix is to make
the rule explicit and easy to check against, not just fix the one screen that
violated it.

## Color tokens

Defined once in [`mobile/lib/theme/app_colors.dart`](../mobile/lib/theme/app_colors.dart)
as a `ThemeExtension<AppColors>`, registered on both the light and dark
`ThemeData` in [`mobile/lib/app.dart`](../mobile/lib/app.dart). Always read
colors through `context.appColors.*` (or `Theme.of(context).colorScheme`
where a token maps onto a standard Material slot) — never hardcode a hex
literal for one of these values, so dark mode and any future palette change
stay correct everywhere at once.

![Color tokens: primary #45B700, primaryDark #2E8C00, greenLight #EDF7E5 (dark #203A17), accent #E679AB, error #DC2626 (dark #F87171), text #111827 (dark #F0F0F0), border #E5E7EB (dark #3A3A3A) — with solid-fill button examples using primaryDark and accent examples (badge, link) using primary](assets/design-system/color-palette.svg)

| Token | Light | Dark | Use for |
| --- | --- | --- | --- |
| `primary` | `#45B700` | `#45B700` | Accents on a light/white surface: text links, icons inside a `greenLight` tint box, status/checkmark icons, borders. **Never** as a solid fill behind white text/icons. |
| `primaryDark` | `#2E8C00` | `#2E8C00` | Solid fills with white content on top: every button, filled badge, selected nav indicator. This is the `filledButtonTheme`/`elevatedButtonTheme` default — most buttons never need to touch color at all. |
| `greenLight` | `#EDF7E5` | `#203A17` | Background tint for hint/explainer cards and hero icon boxes. Always pair the *text/icon on top* with `onGreenLight`, not an alpha-blended `colorScheme.primaryContainer` (that produces unpredictable, low-contrast results in dark mode depending on what's behind it). |
| `onGreenLight` | `#111827` | `#DCF3D3` | Text/icon color for content sitting on `greenLight`. Fixed, pre-checked-for-contrast pairing — see the doc comment on `AppColors.greenLight`. |
| `accent` | `#E679AB` | `#E679AB` | Secondary brand accent (non-green highlights). |
| `error` | `#DC2626` | `#F87171` | Form validation errors, destructive-action confirmations. Distinct from the raw `Colors.red.shade400` used as the "quit habit" type-accent border on `my_habits_screen.dart` — that's a habit-type indicator, not an error state, and is intentionally not routed through this token. |
| `text` | `#111827` | `#F0F0F0` | Default body/heading text where the Material `colorScheme` default isn't used directly. |
| `muted` | `#6B7280` | `#A1A1AA` | Secondary/caption text. |
| `border` | `#E5E7EB` | `#3A3A3A` | Neutral card/divider borders, unselected states. |

## The rule: which green goes where

Everything above the fold reduces to one decision, and getting it backwards
is the exact bug this document exists to prevent:

- **Is this a solid-colored fill with white (or light) text/icons sitting on top of it?** → `primaryDark`. This is true for essentially every button in the app — `Get Recommendations`, `Create a habit`, `Log today`, etc. — which is why the theme sets it as the *default* `FilledButton`/`ElevatedButton` color and most call sites never override it at all.
- **Is this colored content — text, an icon, a border — sitting directly on a white/light surface?** → `primary`. Text links (`Read more about the project →`), status checkmarks, icons inside a `greenLight` box, card borders.

The reason isn't aesthetic preference: white text on `#45B700` measures **2.62:1**
contrast, below WCAG AA's 4.5:1 minimum for normal text; `#2E8C00` clears
**4.31:1+**. `primaryDark` was chosen specifically to pass accessibility
contrast for white-on-fill — reusing `primary` for the same job silently
reintroduces the failure it was created to fix.

## Icon style: outline for hero icons

Icon-in-a-tinted-box "hero" treatments (a 72–80px `greenLight` rounded square
with a centered icon — see `welcome_screen.dart`, `empty_state.dart`,
`goal_input_screen.dart`) consistently use the **outline** variant of a
Material icon (`Icons.lightbulb_outline`, not `Icons.lightbulb`), even though
plain inline icons elsewhere in the app freely use filled glyphs
(`Icons.check_circle`, `AppIcons.success`). A filled icon in this specific
treatment reads as heavier/more generic against the rest of the app's
lighter-weight visual language — check which variant a hero icon box is using
before adding a new one.

## Motion

Defined in [`mobile/lib/theme/motion.dart`](../mobile/lib/theme/motion.dart).
Use these instead of a fresh `Curves.easeOut`/`AnimatedContainer(duration: ...)`
pair for any new state-driven or gesture-driven animation, so the app's motion
stays governed by the same small vocabulary rather than drifting one call site
at a time.

- **`AppSpring.standard`** (damping `1.0`, response `0.35`) — the default for
  state changes a user can trigger repeatedly and interrupt mid-flight
  (selection, reveal). Critically damped: settles smoothly, never overshoots.
- **`AppSpring.momentum`** (damping `0.8`, response `0.35`) — only for motion
  that continues a gesture which already carried velocity (a drag/flick
  release, e.g. the bubble graph). Overshoot reads as physical there; it reads
  as wrong on anything that just appears.
- **`AppSpring.quick`** (damping `1.0`, response `0.15`) — high-frequency taps
  (the log checkbox, habit-type cards) where `standard`'s response is
  perceptibly slow if tapped repeatedly.
- **`PressableScale`** — wrap anything tappable that has no other press
  feedback (no `InkWell` ripple) in this instead of a bare `GestureDetector`;
  it scales to `0.97` instantly on press-down and springs back on release.
- **`reducedMotion(context)`** — check this before starting or continuing any
  `.repeat()`/infinite-loop `AnimationController`, and swap spring/slide
  transitions for a plain opacity cross-fade when it's `true`.
- **`AppShadows`** — the single source for card/glow shadow constants; don't
  redeclare a local `_kCardShadow`-style constant per file.

The admin portal (`admin/src/lib/motion.ts`) mirrors the same damping/response
values via the `motion` package's spring API (`defaultSpring`, `drawerSpring`,
`momentumSpring`) — reach for those there instead of a bare CSS `transition`.

## Admin portal accent (orange, not green)

The admin/researcher portal (`admin/`, Next.js + MUI) deliberately does
**not** share the mobile app's green above — it uses orange, matching the
same participant/green vs. researcher/orange split already established on
the marketing site's `.rtheme` CSS scope
([`website/src/layouts/Base.astro`](../website/src/layouts/Base.astro)).
Defined as CSS custom properties in
[`admin/src/app/globals.css`](../admin/src/app/globals.css) (and mirrored into
the MUI theme's `palette.primary` in
[`admin/src/lib/mui-theme.ts`](../admin/src/lib/mui-theme.ts)), with light and
dark-mode variants:

| Token | Light | Dark | Use for |
| --- | --- | --- | --- |
| `--color-primary` | `#f97316` | `#f97316` | Accent-only: icons, focus rings, charts. **Never** as a solid fill behind white text — only 2.80:1 against white, below WCAG AA. |
| `--color-primary-action` / `--color-sidebar-active` | `#c2410c` | `#f97316` | Solid fills with white content on top: buttons, the active sidebar-nav pill. |
| `--color-primary-action-hover` / `--color-primary-dark` | `#9a3412` | `#fb923c` | Hover/pressed state — one step darker (light) or lighter (dark, to hold contrast against the darker surface) than the token above. |

Same rule as the mobile app's `primary`/`primaryDark` split above:
accent-only tokens are for content sitting on a light/white surface,
action/fill tokens are for solid fills that need AA-safe contrast under white
text. These specific hex values were chosen by computing WCAG contrast ratios
to match or exceed what each equivalent green token cleared (e.g.
`--color-primary-action` went from `#2e8c00` at 4.31:1-vs-white to `#c2410c`
at 5.18:1) — not a like-for-like visual swap, so reusing one token for the
other's role reintroduces the same contrast failure this split prevents for
the mobile app's palette.

## Background

Found 2026-08-04: the Share screen's "Shared today" badge and "Share another
habit" button, and the main pre-share task card, explicitly overrode their
button/fill color to `primary` (`#45B700`) instead of the app-wide
`primaryDark` default — the one screen in the app doing this, out of ~35
`FilledButton`/`ElevatedButton` call sites. Alongside it, the Recommend
screen's hero lightbulb used the filled glyph instead of the outline variant
every other hero icon box uses. Both were visually inconsistent enough for a
user to notice without knowing the underlying color values — fixed in
`donate_screen.dart` and `goal_input_screen.dart`; see `CHANGELOG.md`.
