# Requirements: EasyModal

**Defined:** 2026-07-01
**Core Value:** A non-technical user can go from zero to an open ComfyUI URL by pasting two keys and clicking one button — never touching a terminal or editing `comfyapp.py`.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Project is a clean npm-workspaces monorepo (apps/web, apps/server, packages/shared) clonable and runnable with one command
- [ ] **FOUND-02**: `.gitignore` excludes secrets, build artifacts, node_modules from the first commit
- [ ] **FOUND-03**: MIT LICENSE and a README with the product thesis as the opening line exist
- [ ] **FOUND-04**: Shared TypeScript types (Account, Instance, DeployConfig, LogEvent) are defined in packages/shared

### Backend

- [ ] **BACK-01**: Fastify+TS local server boots on 127.0.0.1, auto-picks a free port, and opens the default browser to the UI
- [ ] **BACK-02**: Server exposes a health route (GET /api/health) and a prereqs route (GET /api/prereqs) reporting Node version + modal CLI presence
- [ ] **BACK-03**: Server provides an SSE event stream (GET /events) for live log/event delivery to the UI
- [ ] **BACK-04**: Encrypted key store (AES-256-GCM, OS keyring primary, passphrase fallback) stores Modal + HF tokens with zero plaintext on disk
- [ ] **BACK-05**: Account CRUD routes (POST/GET/DELETE /api/accounts) backed by the encrypted store
- [ ] **BACK-06**: Modal token validation via `modal token set` + `modal profile current`
- [ ] **BACK-07**: HuggingFace token validation via authenticated HF whoami call
- [ ] **BACK-08**: Route to create/replace the `huggingface` Modal secret (POST /api/accounts/:id/modal-secret)
- [ ] **BACK-09**: Clean bundled `comfyapp.py` template (CONFIG dict, data-driven MODELS list, loud-failure download_models, max_inputs=2 default)
- [ ] **BACK-10**: Typed Modal CLI wrappers (deploy, run, secret, app list) streaming stdout/stderr to the SSE bus
- [ ] **BACK-11**: Deploy route (POST /api/instances/:id/deploy) renders template, runs `modal deploy`, emits human-readable milestone events
- [ ] **BACK-12**: Instance status route (GET /api/instances/:id/status) polling `modal app list` → live/cold/error + URL resolution

### Frontend

- [ ] **FRONT-01**: React+Vite+TS+Tailwind app shell with a left stepper rail (Setup → Keys → Deploy → Launch) and top status bar
- [ ] **FRONT-02**: Lightweight state store (zustand) for account, instance, logs, phase
- [ ] **FRONT-03**: Typed API client + SSE subscription hook
- [ ] **FRONT-04**: Reusable components: LogStream, StatusDot, StepRail, Banner, KeyInput
- [ ] **FRONT-05**: Setup page: prereqs card with ✅/❌ and guided install for missing `modal` CLI
- [ ] **FRONT-06**: Keys page: Modal (token id + secret) and HuggingFace cards, password-masked, "Test & Save" with real-time validation feedback
- [ ] **FRONT-07**: Deploy page: primary "Deploy ComfyUI to Modal" button + live checklist of milestones + LogStream + loud failure banner with retry
- [ ] **FRONT-08**: Launch page: "Open ComfyUI" button (Modal HTTPS URL), status badge (live/cold/error), copy-link + redeploy + delete actions

### Release

- [ ] **REL-01**: One-command start via `npx wan22-deploy` (no clone needed)
- [ ] **REL-02**: README quickstart reproducible by a newcomer in under 5 minutes
- [ ] **REL-03**: In-app troubleshooting (common errors + fixes)
- [ ] **REL-04**: Settings page (port, theme, data location, "clear all data")
- [ ] **REL-05**: `npm run build` produces a distributable bundle
- [ ] **REL-06**: Minimal automated tests (key-store round-trip, milestone parser, template render)
- [ ] **REL-07**: GitHub repo hygiene (issue/PR templates, CONTRIBUTING, CI lint+typecheck+build)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-Account & Multi-Instance

- **MULTI-01**: Account switcher to manage several Modal accounts
- **MULTI-02**: Instance dashboard listing many deployments with per-instance status
- **MULTI-03**: Deploy presets (480p / 720p / A100 / L40S profiles)

### Libraries

- **LIB-01**: Model library browser (add/remove model sets)
- **LIB-02**: Custom-node library management
- **LIB-03**: Curated workflow library with one-click load

### Hardening

- **HARD-01**: Auth layer on the public ComfyUI endpoint
- **HARD-02**: Pin custom-node git SHAs for build reproducibility
- **HARD-03**: Optional hosted/SaaS version

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bundling the `modal` CLI in the app | Install footprint + version drift; we detect + guide install instead |
| Hosting compute ourselves | Compute stays on the user's Modal account; we are an orchestrator only |
| Mobile app | Local-first desktop/laptop tool; mobile is not the use case |
| Real-time collaboration / multi-user | Local single-user tool by design |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| BACK-01 | Phase 2 | Pending |
| BACK-02 | Phase 2 | Pending |
| BACK-03 | Phase 2 | Pending |
| FRONT-01 | Phase 3 | Pending |
| FRONT-02 | Phase 3 | Pending |
| FRONT-03 | Phase 3 | Pending |
| FRONT-04 | Phase 3 | Pending |
| BACK-04 | Phase 4 | Pending |
| BACK-05 | Phase 4 | Pending |
| BACK-06 | Phase 4 | Pending |
| BACK-07 | Phase 4 | Pending |
| BACK-08 | Phase 4 | Pending |
| FRONT-05 | Phase 4 | Pending |
| FRONT-06 | Phase 4 | Pending |
| BACK-09 | Phase 5 | Pending |
| BACK-10 | Phase 5 | Pending |
| BACK-11 | Phase 5 | Pending |
| FRONT-07 | Phase 5 | Pending |
| BACK-12 | Phase 6 | Pending |
| FRONT-08 | Phase 6 | Pending |
| REL-01 | Phase 7 | Pending |
| REL-02 | Phase 7 | Pending |
| REL-03 | Phase 7 | Pending |
| REL-04 | Phase 7 | Pending |
| REL-05 | Phase 7 | Pending |
| REL-06 | Phase 7 | Pending |
| REL-07 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after initial definition*
