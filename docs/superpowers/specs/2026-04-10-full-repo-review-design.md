# Full Repo Review — Design Spec

**Date:** 2026-04-10  
**Project:** Health Habit Hub  
**Branch:** ralph/hhh-platform-unified  
**Approach:** Option A — Sequential deep-dive per layer

---

## 1. Objective

Perform a fresh full-codebase review covering bug identification, security hardening, and clean code principles. Update `AUDIT.md` with findings and apply fixes directly to source files.

---

## 2. Review Layers (in order)

| # | Layer | Paths |
|---|-------|-------|
| 1 | Infrastructure | `docker-compose.yml`, `docker-compose.prod.yml`, `stack.env`, Traefik config |
| 2 | Node.js backend | `app/middleware/`, `app/routes/`, `app/controllers/`, `app/services/`, `app/db/`, `app/utils/`, `app/ws/` |
| 3 | Python API service | `API-service/main.py`, `API-service/routers/`, `API-service/llm_client.py` |
| 4 | Next.js admin | `admin/src/middleware.ts`, `admin/src/app/`, `admin/src/components/` |
| 5 | Flutter mobile | `mobile/lib/` (read-only analysis) |

Each layer applies three lenses: **bugs/correctness**, **security**, **clean code**.

---

## 3. Findings Classification

| Severity | Definition | Fix policy |
|----------|------------|------------|
| P0 | Critical / security-breaking | Fixed immediately, no exceptions |
| P1 | Bug or meaningful security gap | Fixed unless requires large refactor; otherwise documented with clear action item |
| P2 | Clean code / maintainability | Fixed if small and safe; otherwise documented in backlog |

---

## 4. Execution Sequence per Layer

1. Read all relevant files
2. Record findings (severity, file, line, description, fix)
3. Apply fixes inline per policy
4. Move to next layer

---

## 5. Deliverables

- **Code fixes** applied directly to source files
- **AUDIT.md** rewritten (not appended) with:
  - Executive summary
  - Per-layer scorecards (1–5 × 5 dimensions: Code Quality, Test Coverage, Security, Documentation, Consistency)
  - Full findings table (severity / file / description / status)
  - Recommended backlog for unfixed items

---

## 6. Out of Scope

- Test files (not modified)
- Flutter (read-only — no Dart tooling to verify changes)
- Generated files, `node_modules/`, `build/`, `pubspec.lock`
