# T14 — Admin Chart Consolidation: Scoping Findings & Plan

_Written 2026-07-10. Supersedes the T14 description in `UI_UX_IMPLEMENTATION_PLAN.md`, whose premise turned out to be based on a static grep rather than what's actually reachable from the app._

## Headline finding: this isn't a "two chart systems" problem — it's dead code

The original review said: _"`recharts` is a dependency, yet analytics hand-rolls SVG bar/line charts in CSS. Pick one and theme it once."_ That's true of the source tree, but not of the running app:

- **`src/app/(admin)/analytics/page.tsx`** (the `/analytics` route, reached from the sidebar) already uses `recharts` end-to-end — `BarChart`, `LineChart`, `ResponsiveContainer`, `Cell`, `ReferenceLine`, a shared custom tooltip (`RcTooltip`) — for all 7 of its charts (weekly active rate, SRHI trajectory, cumulative dropout, questionnaire completion, enrollment over time, daily active, habits by group), plus KPI cards, a query-transparency panel, and a participant table with a click-through drawer.
- **`src/components/studies-analytics-tab.tsx`** is the file with the hand-rolled SVG (`<svg>`/`<polyline>`/`<circle>` for line charts, CSS width-percentage bars for bar charts). I checked whether it's actually rendered anywhere:

```
$ grep -rn "AnalyticsTab" admin/src --include="*.tsx" | grep -v studies-analytics-tab.tsx
src/__tests__/studies-analytics.test.tsx   ← only reference in the whole tree
```

It is **not imported by any page**. `src/app/(admin)/studies/page.tsx`'s modal tab list is:

```ts
type ModalTab =
  | "details" | "questionnaires" | "schedule" | "codes"
  | "participants" | "notifications" | "cue-config";
```

No `"analytics"`. Git history confirms this wasn't an oversight — it was deliberately removed:

- `918c291b` **added** an `"analytics"` tab to the study modal, rendering `<AnalyticsTab study={initial} token={token} />` with the SVG/CSS chart code.
- A later refactor (around `f7b129d9`/`d7fba211`, "extract data hooks / split large inline components") **deleted** the `"analytics"` arm from `ModalTab`, its tab button, and its render branch from `studies/page.tsx` — but left `studies-analytics-tab.tsx` and its test (`src/__tests__/studies-analytics.test.tsx`) behind.

So today: one live chart system (recharts, on `/analytics`), and one orphaned, untestable-by-users chart system (hand-rolled SVG, exercised only by its own unit test, unreachable via any click path in the app).

## Two paths, pick one

### Path A — Delete the dead code (recommended default)

Remove `src/components/studies-analytics-tab.tsx` and `src/__tests__/studies-analytics.test.tsx`. That's it — the "two chart systems" finding is fully resolved because only one system is left, and it already uses recharts.

- **Risk:** none. Nothing in the live app references either file; `tsc`/`next build`/`jest` will confirm no dangling imports.
- **Effort:** ~15 minutes (delete, run the full suite, confirm green).
- **Open question only you can answer:** was the per-study "Analytics" modal tab removed on purpose (superseded by the standalone `/analytics` page, which now covers the same ground plus more) or was it dropped accidentally during the refactor and just never followed up on? I can't tell intent from the commit history alone — the refactor commit's message doesn't say. If it was intentional, Path A is correct. If it was accidental, you want Path B.

### Path B — Rebuild the study-modal analytics tab on recharts

If product wants researchers to see quick analytics for one study without leaving the studies list (vs. navigating to `/analytics` and re-selecting the study from a dropdown), rebuild the tab using the exact recharts patterns already proven in `analytics/page.tsx` — don't port the SVG code, replace it with adapted copies of the working blocks.

**Per-chart mapping** (old hand-rolled section → recharts source to adapt from `analytics/page.tsx`):

| `studies-analytics-tab.tsx` section | Type | Adapt from `analytics/page.tsx` | Notes |
|---|---|---|---|
| Weekly Active Rate | CSS width-% bars (not SVG) | `BarChart` block, lines 918–960 | Needs `onClick` added to `<Bar>` to preserve **click-to-drill-down** (opens `DrillPanel` with that group's roster) — a feature `analytics/page.tsx`'s chart doesn't have today, since it uses a separate persistent participant table instead. Recharts supports per-bar click via `<Bar onClick={(data) => ...}>`. |
| SRHI Trajectory | Hand-rolled `<svg><polyline><circle>` | `LineChart` block, lines 970–1018 | `analytics/page.tsx` pivots data to one row per week with one column per group (`byWeek[weekNumber][groupLabel] = score`) — same pivot needed here; `studies-analytics-tab.tsx` currently groups differently (`srhiByGroup`) and would need the same reshape. |
| Cumulative Dropout | Hand-rolled `<svg>` (dashed polyline) | `LineChart` block, lines 1029–1064 (note `type="stepAfter"`) | Same pivot-to-wide-format need as above. |
| Questionnaire Completion | CSS width-% bars (not SVG) | Horizontal `BarChart` block, lines 1074–1119 | No drill-down today in either version — straightforward port. |

**Cross-cutting work:**

1. **Extract `GROUP_COLORS`** — both files currently declare the identical literal `["#45B700", "#E679AB", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"]`. Move to one shared module (e.g. `src/lib/chart-colors.ts`) both files import, so a future palette change is one edit, not two.
2. **CSS** — `studies-analytics-tab.tsx` currently imports `styles` from `studies/page.module.css` (`.barChart`, `.barRow`, `.lineChart`, `.tooltip`, `.chartLegend`, `.drillPanel`, etc.). The recharts wrapper classes it needs (`.chartWrap`, `.rcTooltip`, `.rcTooltipLabel`) live in `analytics/page.module.css` instead. Either add those three classes to `studies/page.module.css`, or import both modules — cleaner to copy the ~20 lines into `studies/page.module.css` and keep each route's module self-contained, matching the existing per-page convention. The `.drillPanel`/`.drillTable`/`.tooltip`(-for-floating-div, now unused) classes: keep `.drillPanel`/`.drillTable`, delete the floating-div `.tooltip` and `.lineChart*` classes once nothing references them.
3. **Wide-chart horizontal scroll** — the current SRHI/dropout charts widen with more weeks/dates (`svgW = weeks.length * 60 + 60`) inside a `overflow-x: auto` wrapper, so long trajectories scroll instead of squishing. `ResponsiveContainer width="100%"` doesn't do this by default. Keep the scroll wrapper but give the inner chart an explicit pixel width (`width={weeks.length * 60 + 60}` instead of `ResponsiveContainer`) when it exceeds the card's natural width — same idea as today, just recharts-flavored.
4. **Re-wire into `studies/page.tsx`** — restore `"analytics"` to the `ModalTab` union, the tab button, and the render branch (mirroring what `918c291b` originally added, now pointing at the recharts version).
5. **Tests** — `studies-analytics.test.tsx`'s existing assertions are text-content based (`findByText(/weekly active rate/i)`, `findByText(/60%/)`), which should mostly survive since recharts still renders labels as text — **but** recharts' `ResponsiveContainer` measures its container via `ResizeObserver`, and `jest.setup.ts` currently has no `ResizeObserver` polyfill (confirmed — it's a one-line file with just `@testing-library/jest-dom`). Without one, charts render at 0×0 in jsdom and nothing inside them (including the text these tests look for) will exist. **Add a `ResizeObserver` mock to `jest.setup.ts` before writing/adapting any test that mounts a recharts component.** Also worth noting: there is currently *no* test at all for `analytics/page.tsx`'s existing recharts charts, so this would be the first — a good opportunity to establish the pattern once, rather than re-solving it later.

- **Risk:** moderate. Real UI behavior changes (new interaction surface for drill-down via recharts' click handling, pivoted data shapes, a new test-infra requirement). Should be visually verified in a browser before merging — recharts tooltip positioning and the fixed-width-scroll behavior in particular are easy to get subtly wrong without seeing it render.
- **Effort estimate:** ~1 day — 4 chart adaptations (~2–3 hrs), CSS consolidation (~30 min), re-wiring the modal tab (~30 min), `ResizeObserver` polyfill + test rewrite (~1–2 hrs), plus browser QA time I can't do in this session.

## Recommendation

Default to **Path A**. It's a 15-minute, zero-risk cleanup that fully addresses the review finding as written. Only go to Path B if there's an actual product reason researchers need quick per-study analytics without leaving the studies list — and if so, treat it as a small new feature (with browser verification before merging), not a mechanical "consolidation."
