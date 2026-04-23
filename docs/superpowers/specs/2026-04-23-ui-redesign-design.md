# UI Redesign — Design Spec

**Date:** 2026-04-23  
**Scope:** All user-facing Flutter screens (admin screens excluded)

---

## Design Direction: Clean Bold

A white-base design system with a bold green hero treatment and heavy typography. The goal is to make the app feel premium and modern while staying clean and readable.

**Design tokens:**

| Token | Value |
|---|---|
| Background | `#F4F5F2` (off-white warm) |
| Surface (card) | `#FFFFFF` |
| Primary green | `#45B700` |
| Primary dark green | `#2E8C00` |
| Green tint | `#EDF7E5` |
| Accent pink | `#E679AB` |
| Pink tint | `#FCE4F0` |
| Text | `#111827` |
| Muted text | `#6B7280` |
| Border | `#E5E7EB` |
| Card shadow | `0 4px 20px rgba(0,0,0,0.08)` |
| Green glow shadow | `0 8px 28px rgba(69,183,0,0.28)` |
| Card border radius | `20px` |
| Small border radius | `14px` |
| Pill border radius | `100px` |
| Font | Figtree (already in project) |
| Icons | Material Symbols Rounded (already in project) |

No emojis anywhere in the UI.

---

## Navigation

**Style: White + Pill** — 4-tab bottom navigation bar.

- White bar with `border-top: 1px solid #E5E7EB` and a subtle upward shadow
- Active tab: icon gets a soft green pill background (`#EDF7E5`) and dark green colour (`#2E8C00`); label turns bold dark green
- Inactive tabs: muted grey icon + label

**Tabs (in order):**

| Tab | Icon (Material Symbols Rounded) | Route |
|---|---|---|
| Share | `volunteer_activism` | `/share` |
| Explore | `hub` | `/explore` |
| Recs | `lightbulb` | `/recommend` |
| Account | `manage_accounts` | `/account` |

The existing Profile tab is removed. The existing Settings tab is renamed to **Account** and absorbs profile content (see Account screen below).

Admin tab behaviour is unchanged — remains conditionally appended for admin/researcher roles outside the standard 4-tab set.

---

## Cards & Surfaces

**Style: Elevated** — white cards with drop shadow, no borders.

- Background: `#FFFFFF`
- Border radius: `20px` (large cards / hero), `14px` (list items / smaller cards)
- Shadow: `0 4px 20px rgba(0,0,0,0.08)`
- Hero/primary cards (green): background `#45B700`, shadow `0 8px 28px rgba(69,183,0,0.28)`, white text

---

## Screens

### App Bar

All main screens get a consistent app bar:
- White background, `border-bottom: 1px solid #E5E7EB`
- Title: `Figtree 800` 17 sp, `#111827`
- Leading: back arrow uses `arrow_back_ios` icon (green) where applicable; home screens show a small green dot + app name
- Trailing: action icons in muted grey

### Welcome / Onboarding

- Full-white screen (no nav bar)
- Centred layout: large rounded icon box (`#EDF7E5` background, `favorite` icon in green), bold title "Health Habit Hub", subtitle body text
- Primary CTA: full-width green pill button "Get Started"
- Secondary link: "Restore existing account" in green text below button
- Progress dots at bottom (filled pill = current step, circles = future)

### Passphrase Screen

- App bar with back arrow + title "Recovery Passphrase"
- Amber warning card (border + tinted background) with `warning` icon: "Write these 36 words down…"
- 3-column grid of word chips: white elevated card per word, word number in muted text above the word in bold
- Actions below grid:
  - Outline pill button "Copy to clipboard" (`content_copy` icon)
  - Checkbox row "I have written it down" (checkbox + label)
  - Continue button: disabled (grey) until checkbox checked, then green pill

### Share Screen

- Green hero card at top: eyebrow label "Today's task", bold title, description, white pill "Start survey" button
- Row of 3 stat cards (white elevated): Shared count, Weeks streak, Achievement (`military_tech` icon)
- "Recent activity" section label + list of past submissions as white elevated rows (`check_circle` icon, title, date, green "Done" badge)

### Explore Screen

- Existing content layout preserved; apply new card/typography tokens
- No structural changes needed beyond visual polish

### Recommendations Screen

- Centred icon box (pink tint, `lightbulb` icon in pink accent)
- Bold title "What's your health goal?", subtitle
- Multi-line text input card (white elevated, bordered)
- "Popular goals" section label + horizontal chip row (first chip in pink accent, rest in default outline)
- Full-width green "Get recommendations" button

### Account Screen (replaces Settings + Profile)

Structured as a scrollable settings-style list, top to bottom:

1. **Profile card** — green hero card: circular avatar (`person` icon, semi-transparent white background), "Participant" name, "Anonymous contributor" role, "Active" badge pill (right-aligned, semi-transparent white)
2. **Profile section** — single-row white card: `assignment_ind` icon + "Health profile questionnaire" + `chevron_right`
3. **Preferences section** — white card with rows:
   - `language` + "Language" + current value (e.g. "English")
   - `dark_mode` + "Appearance" + current value (e.g. "System")
4. **Legal section** — white card with rows:
   - `lock` + "Privacy Policy" + `chevron_right`
   - `info` + "Imprint" + `chevron_right`
5. **Sign out** — standalone white card, single row in red: `logout` icon + "Sign out"

Section labels are small uppercase muted text above each card group.

---

## Implementation Scope

- **In scope:** All screens reachable by non-admin users: Welcome, Passphrase, Restore, Share, Explore, Recommendations, Account (merged Settings+Profile), and any shared widgets (app bar, bottom nav, cards)
- **Out of scope:** Admin screens, backend changes, new features
- **Navigation change:** Remove the separate Profile tab from `ShellScreen`. Rename/repurpose the Settings tab to Account. Merge `ProfileScreen` content into the Account (Settings) screen.

---

## Open Questions / Decisions

- Dark mode: apply new tokens to dark theme variants or leave dark mode unchanged for now? **Decision: leave dark mode unchanged for this sprint; apply light-mode tokens only.**
- Explore screen: no wireframe was designed; apply token updates (colours, card shadows, typography) but preserve existing layout structure.
