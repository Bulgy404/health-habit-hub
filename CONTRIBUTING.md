# Contributing to Health Habit Hub

Thank you for contributing! This document covers everything you need to get your change merged cleanly.

---

## Table of Contents

- [Development setup](#development-setup)
- [Branch naming](#branch-naming)
- [Commit messages](#commit-messages)
- [Pull request process](#pull-request-process)
- [Release tagging](#release-tagging)
- [Code style](#code-style)
- [Testing requirements](#testing-requirements)

---

## Development setup

```bash
# 1. Clone and install
git clone <repo-url>
cd health-habit-hub-1

# 2. Copy environment file and fill in secrets
cp stack.env .env

# 3. Start local stack
make dev

# 4. Seed database, Neo4j, and Keycloak
make seed

# 5. Run iOS app (requires Xcode + simulator)
make ios
```

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for production setup and [`docs/architecture.md`](docs/architecture.md) for system design.

---

## Branch naming

All branches **must** follow this pattern:

```
<type>/<short-description>
```

| Type | When to use |
|------|-------------|
| `feature/` | New user-facing functionality |
| `fix/` | Bug fix (production or test) |
| `chore/` | Dependency updates, config changes, tooling |
| `docs/` | Documentation only — no code changes |
| `refactor/` | Internal restructuring, no behaviour change |
| `perf/` | Performance improvements |
| `test/` | Adding or fixing tests only |
| `ci/` | CI/CD pipeline changes |
| `release/` | Version bump PRs (created by maintainers) |

**Examples**

```
feature/adaptive-reminder-algorithm
fix/questionnaire-401-service-route
chore/bump-flutter-dependencies
docs/update-pipeline-diagram
refactor/extract-cosine-ranking-helper
ci/add-python-lint-job
```

Rules:
- Use **kebab-case**, all lowercase
- Keep descriptions concise (3–5 words)
- No ticket numbers in branch names — link the issue in the PR body instead

---

## Commit messages

This project follows **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**.

```
<type>(<scope>): <imperative, lower-case summary>

[optional body — wrap at 72 chars]

[optional footer(s): BREAKING CHANGE: ..., Closes #123]
```

### Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, missing semicolons — no logic change |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Adding/fixing tests |
| `chore` | Build process, dependency updates, tooling |
| `ci` | CI pipeline changes |
| `revert` | Reverts a previous commit |

### Scopes (optional but encouraged)

`app`, `mobile`, `api-service`, `admin`, `neo4j`, `keycloak`, `docs`, `ci`, `scripts`, `lightrag`

### Examples

```
feat(api-service): add community habit vector search to recommendation pipeline
fix(app): mount questionnaire service router before JWT middleware
docs(diagrams): add M3 recommendation pipeline sequence diagram
chore(mobile): bump flutter_timezone to v5.0.2
test(api-service): rewrite community-habits test for new pipeline behaviour
ci: add Python lint job to CI workflow
```

### Breaking changes

Add `BREAKING CHANGE:` in the footer, or append `!` after the type:

```
feat(app)!: rename X-Service-Auth-Token header to X-Internal-Token

BREAKING CHANGE: all service-to-service callers must update the header name.
```

---

## Pull request process

1. **Open a draft PR** as soon as you push your first commit — it signals work in progress and starts CI early.

2. **Fill in the PR template** — every checklist item must be ticked or explicitly marked N/A.

3. **Keep PRs small.** One logical change per PR. Stack PRs for dependent changes.

4. **CI must be green** before requesting review. The `ci-passed` gate job is required.

5. **Request review** from at least one other contributor once the PR is ready. Assign a `CODEOWNERS` reviewer if the change touches a protected path.

6. **Respond to all review comments** — resolve threads yourself only after the reviewer has approved the change.

7. **Squash and merge** is the only merge strategy. The squash commit message must follow the Conventional Commits format (GitHub pre-fills it from the PR title — keep the PR title in that format too).

8. **Delete the branch** after merge (GitHub does this automatically if configured).

### PR title format

Same as commit messages:

```
feat(mobile): add SRHI strength chip to My Habits cards
fix(ci): repair ontology constraint parser semicolon split
```

---

## Release tagging

Releases follow **[Semantic Versioning](https://semver.org/)** (`vMAJOR.MINOR.PATCH`).

| Increment | When |
|-----------|------|
| `MAJOR` | Breaking change for study participants or API consumers |
| `MINOR` | New backward-compatible feature |
| `PATCH` | Bug fix, docs, chore — no new behaviour |

**To cut a release:**

1. Update `CHANGELOG.md` — move items from `[Unreleased]` to a new versioned section:
   ```markdown
   ## [1.3.0] — 2026-06-23
   ```
2. Commit: `chore(release): bump version to 1.3.0`
3. Create and push the tag:
   ```bash
   git tag -a v1.3.0 -m "Release v1.3.0"
   git push origin v1.3.0
   ```
4. The [`release.yml`](.github/workflows/release.yml) workflow automatically creates the GitHub Release and populates it with the matching CHANGELOG section.

**Pre-release tags** (alpha/beta/rc) are supported:

```bash
git tag -a v2.0.0-rc.1 -m "Release candidate 1 for v2.0.0"
```

These create a pre-release on GitHub and do **not** update the `latest` release pointer.

---

## Code style

### JavaScript / TypeScript (backend + admin)

- Formatter: **Prettier** — run `make format` before committing
- Linter: **ESLint** — `cd app && npx eslint .`
- Module system: ESM (`import`/`export`) in the backend; TypeScript in `admin/`

**Admin UI (`admin/`):** Next.js 15 / React 18. Build shared UI from **MUI (Material UI) v7** components (Emotion engine), and use **CSS Modules** (`*.module.css`) for bespoke styling — both keyed to the CSS custom properties in `globals.css` so light/dark theming (the `[data-theme]` toggle) stays consistent. Don't put `var(...)` values in the MUI `createTheme()` palette (`mui-theme.ts`) — `createTheme` can't parse them; keep runtime-themed colors in `styleOverrides`/`sx` instead.

### Python (API-service, knowledge-mcp, scripts)

- Formatter: **Ruff** (or Black) — `ruff format .`
- Import order: standard library → third-party → local
- Type hints required on all public functions

### Dart / Flutter (mobile)

- Formatter: `dart format .`
- Import order: `dart:` → `package:` → relative (enforced by `directives_ordering` in `flutter analyze`)
- Run `flutter analyze lib/ test/` before pushing

### Mermaid diagrams

- Stored under `docs/diagrams/` — sequence diagrams in `sequences/`, architecture in `architecture/`
- Always use `%%` comments for section labels

---

## Testing requirements

| Layer | Command | Required? |
|-------|---------|-----------|
| Backend unit | `make test-backend` | Yes |
| Backend integration | CI only (needs MongoDB + Neo4j) | Yes in CI |
| Python API-service | `make test-python` | Yes |
| Flutter | `make test-flutter` | Yes |
| Admin typecheck | `make test-admin` | Yes |
| E2E smoke | Nightly CI | Yes on `main` |

New features must include tests. Bug fixes must include a regression test that would have caught the bug.

---

## Questions?

Open a [GitHub Discussion](../../discussions) or ping in the team channel. For security issues, follow the process in [`SECURITY.md`](SECURITY.md).
