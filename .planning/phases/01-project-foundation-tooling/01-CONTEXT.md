# Phase 1: Project Foundation & Tooling - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A clean npm-workspaces monorepo anyone can clone and run with one command, with shared types and open-source scaffolding. This is the foundation for the Wan2.2Animate Deploy open-source web app (React+Vite frontend + Fastify backend) that deploys ComfyUI on Modal.

</domain>

<decisions>
## Implementation Decisions

### Locked (from PROJECT.md Key Decisions)
- **Monorepo structure:** `apps/web` (React+Vite+TS+Tailwind), `apps/server` (Fastify+TS), `packages/shared` (shared TS types). Package manager: npm workspaces (lowest contributor friction — no extra install).
- **Shared types to define:** `Account`, `Instance`, `DeployConfig`, `LogEvent` in `packages/shared`.
- **License:** MIT.
- **First commit must include `.gitignore`** excluding: node_modules, dist, build artifacts, `.env`, secrets, `.venv`, `output/`, `__pycache__/`. (Critical: the existing brownfield `.env` contains live secrets — must never be committed.)
- **Tooling:** TypeScript (strict), ESLint + Prettier with one shared config.
- **README thesis line:** "Modal is powerful but miserable to set up. This is the missing UI."

### Claude's Discretion
- Exact dependency versions (use current stable).
- Workspace wiring specifics (root scripts for `dev`/`build`/`lint`).
- tsconfig composition (base + per-app extends).
- Whether to include a minimal placeholder app in each workspace so `npm run dev` actually boots, or leave stubs.
- Tailwind setup approach (v4 vs v3 — use current stable).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Core value, decisions, constraints (the product spec)
- `.planning/REQUIREMENTS.md` — FOUND-01..04 define this phase's scope
- `.planning/ROADMAP.md` — Phase 1 details, success criteria, 3 plans
- `.planning/PRODUCTION-PLAN.md` — Full architecture, file structure (§3), tech choices (§5)
- `.planning/codebase/CONCERNS.md` — Why `.gitignore` matters (live secrets in existing `.env`)

### Existing codebase
- `comfyapp.py` — The brownfield app being productized (reference only this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

The repo currently contains the brownfield `comfyapp.py` + docs + workflows. This phase introduces a NEW monorepo structure alongside it (the Wan2.2Animate Deploy launcher app). The monorepo root sits at the project root; `apps/`, `packages/` are new directories. Preserve existing files (`comfyapp.py`, `workflows/`, `docs/`, `README.md`).

**Critical:** There is currently NO `.gitignore`. The existing `.env` holds live Modal + HuggingFace secrets. The `.gitignore` created in this phase MUST exclude `.env` before any broad `git add`.

</code_context>

<specifics>
## Specific Ideas

- Root `package.json` with `"workspaces": ["apps/*", "packages/*"]`.
- `packages/shared/src/types.ts` exporting `Account`, `Instance`, `DeployConfig`, `LogEvent` with clear field shapes (informed by PRODUCTION-PLAN.md §5 data model).
- Root dev script runs both apps concurrently (e.g., via `concurrently` or `npm --workspaces run dev`).
- Each app should have a minimal runnable entry so `npm run dev` from root boots *something* (web: Vite dev server serving a placeholder page; server: Fastify listening on localhost printing its URL).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped. Refer to ROADMAP.md phase description and success criteria.

</deferred>
