---
title: Full-Repo Clean Sweep
date: 2026-06-03
status: approved
---

# Full-Repo Clean Sweep

## Goal

Perform an aggressive, stack-by-stack engineering review of the entire health-habit-hub repository:
remove all dead code, apply clean code principles throughout, and add comprehensive comments
(JSDoc / Google-style docstrings / Dart doc) to every exported symbol.

## Scope

All four stacks, in order:

1. `app/` — Node.js/Express API backend
2. `API-service/` — Python/FastAPI LLM inference service
3. `admin/` — Next.js 14 admin panel
4. `mobile/` — Flutter mobile app

## Approach

**Stack-by-stack sequential.** Each stack is completed in full (dead code → clean code → comments)
before moving to the next. Each stack produces its own focused commit(s), making diffs reviewable
and enabling safe rollback per layer.

## Aggressiveness Level

**Aggressive.** Full clean sweep: restructure files, break up large modules, rename for clarity,
eliminate abstractions that add no value. Existing external API interfaces (HTTP routes, Dart
service method signatures) are preserved. Internal restructuring is fair game.

---

## Stack 1: `app/` — Node.js/Express

### Dead Code
- Audit the 11 legacy controllers in `app/controllers/` (about, accessibility, contact, donate,
  imprint, privacy, etc.) — these appear to be frontend-serving controllers from a pre-API era;
  remove any that have no active consumers.
- Remove routes registered in `v1Router.js` / `index.js` that have no callers.
- Remove unused `require()` statements across all files.
- Audit `token_card_service.js` — if unused, delete; if used, keep and rename.

### Clean Code
- **`habitsRouter.js`** (888 lines): split by concern — CRUD operations, stats, exports.
- Rename `token_card_service.js` → `tokenCardService.js` to match camelCase file naming convention.
- Break up any function longer than ~40 lines into single-responsibility helpers.
- Standardise error response shape across all routes (consistent `{ error: string }` envelope).
- Eliminate any callback-style async; standardise on `async/await` throughout.

### Comments
- JSDoc on every exported service function: `@param`, `@returns`, `@throws`.
- Short WHY comments for non-obvious business logic (study enrollment guards, rate-limiting
  exceptions, etc.).

---

## Stack 2: `API-service/` — Python/FastAPI

### Dead Code
- Audit `refine_translation.py` vs `refine_translation_de.py` for duplication; consolidate if the
  German variant is only a prompt-path swap.
- Remove unused imports across all routers.
- Remove any endpoint functions not registered in `main.py`.
- Remove dead branches in conditional logic.

### Clean Code
- **`recommend.py`** (267 lines) and **`retrieve.py`** (248 lines): extract focused helpers for
  request parsing, LLM invocation, and response mapping.
- **`extract_profile.py`** and **`extract_habits.py`**: extract shared LLM call patterns into a
  common base helper.
- Standardise error handling: all routers use the same `HTTPException` pattern.
- Audit type hints: replace all `Any` with concrete types; add missing return annotations.
- Enforce consistent snake_case naming throughout.

### Comments
- Google-style docstrings on every router function and non-trivial helper:
  one-line summary + `Args:` / `Returns:` / `Raises:` blocks.
- Module-level docstring on each file explaining its role in the LLM pipeline.

---

## Stack 3: `admin/` — Next.js 14

### Dead Code
- Remove unused imports in all page and component files.
- Remove unused `useState` variables (set but never read).
- Remove unused component props.
- Remove dead CSS classes in `.module.css` files not referenced in JSX.
- Remove commented-out JSX blocks.

### Clean Code
- Move `analytics-tab.tsx` from the `studies/` route folder into `components/` and wire up cleanly.
- Split page components that mix data fetching + rendering + business logic into a page shell and
  focused child components.
- Audit and standardise async data fetching: pick one pattern (`useEffect`+fetch, server components,
  or SWR) and apply consistently.
- Replace all `any` TypeScript types with proper interfaces for API response shapes.
- Standardise error/loading state handling across all pages.

### Comments
- JSDoc on all exported components: what it renders and what props it accepts.
- JSDoc on all utility functions in `lib/`.
- Inline WHY comments for auth/role-guard logic.

---

## Stack 4: `mobile/` — Flutter

### Dead Code
- Remove unused imports across all Dart files.
- Remove unused provider fields or state variables not read by the widget tree.
- Remove dead screen routes registered in the router but never navigated to.
- Remove unfinished `TODO`/`FIXME` stubs — either implement or delete.

### Clean Code
- **`main.dart`** (592 lines): extract app configuration, routing setup, and provider registration
  into dedicated files.
- **`bubble_graph_widget.dart`** (529 lines): split rendering logic, gesture handling, and data
  transformation into focused widgets/helpers.
- **`admin_questionnaires_screen.dart`** and **`admin_surveys_screen.dart`** (~700 lines each):
  extract reusable table/list components.
- **`donate_screen.dart`** (646 lines): split into focused sub-widgets.
- Audit and standardise state management: one consistent pattern (`setState` vs Provider vs direct
  service calls) per layer.
- Audit class naming for PascalCase compliance.

### Comments
- Dart doc comments (`///`) on every public class, method, and provider: one-line summary +
  parameter descriptions.
- Section headers inside large `build()` methods delineating logical UI regions.
- WHY comments for non-obvious platform-specific workarounds.

---

## Constraints

- External HTTP API interfaces (route paths, request/response shapes) must not change.
- Flutter service method signatures consumed by screens must not change without updating all call
  sites in the same pass.
- All existing tests must continue to pass after each stack's pass.
- No new features — this is purely a quality pass.

## Post-Implementation Pass

After all four stacks are complete:

1. **Quality review** — re-read every changed file with fresh eyes; check for regressions in
   readability, leftover TODOs introduced during refactoring, or inconsistencies between stacks.
2. **Test verification** — run the full test suite for each stack and confirm all tests pass:
   - `app/`: `npm test`
   - `API-service/`: `pytest`
   - `admin/`: `npm test`
   - `mobile/`: `flutter test`
3. **Change documentation** — update `CHANGELOG.md` under `[Unreleased]` with a summary of what
   was removed, restructured, and annotated per stack.

## Success Criteria

- Zero unused imports or dead functions remain in any file.
- No file exceeds ~300 lines (split further if needed).
- Every exported symbol has a complete doc comment.
- All tests green across all stacks.
- `CHANGELOG.md` updated with a clear summary of changes.
- Each stack produces a clean, reviewable commit.
