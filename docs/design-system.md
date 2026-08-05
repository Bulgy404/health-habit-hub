# Health Habit Hub — Mobile Design System

A short, definitive reference for the Flutter app's visual language: color
tokens, when to use which shade of green, and the icon-style convention. This
exists because a real inconsistency shipped without one — see
[Background](#background) below — and the fix is to make the rule explicit
and easy to check against, not just fix the one screen that violated it.

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
