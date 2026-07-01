# Roadmap: Wan2.2Animate Deploy

## Overview

Build an open-source local web app that deploys ComfyUI on Modal with zero friction. Users paste two keys, click deploy, get a ComfyUI URL. The journey: scaffold a Node monorepo → backend that can talk to Modal → polished React UI → encrypted key management → a clean bundled ComfyUI template → a streaming deploy pipeline → instance status + launch link → open-source packaging. Each phase delivers a runnable, verified increment.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Project Foundation & Tooling** - Clean monorepo clonable and runnable with one command
- [x] **Phase 2: Backend Skeleton** - Local Fastify+TS server that boots, serves health, opens browser, streams SSE events
- [x] **Phase 3: Frontend Shell** - Polished React+Vite+Tailwind app shell with stepper navigation and reusable components
- [x] **Phase 4: Encrypted Key Store & Prereqs UI** - Users install prereqs and paste Modal+HF keys safely (Setup → Keys journey)
- [x] **Phase 5: Deploy Pipeline & Clean ComfyUI Template** - One deploy button streams live milestones; succeeds or fails loudly with a fix
- [x] **Phase 6: Instance Status & Launch** - User lands on their ComfyUI URL and can revisit it anytime; resumable across restarts
- [x] **Phase 7: Polish, Docs & Open-Source Release** - A stranger on GitHub can use this in under 5 minutes

## Phase Details

### Phase 1: Project Foundation & Tooling
**Goal**: A clean npm-workspaces monorepo anyone can clone and run with one command, with shared types and open-source scaffolding.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. A fresh `git clone` followed by `npm install` completes with no errors and no manual config
  2. `npm run dev` starts both the web and server apps in development mode with hot reload
  3. Shared TypeScript types (Account, Instance, DeployConfig, LogEvent) compile and are importable from both apps
  4. `.gitignore`, MIT `LICENSE`, and a README with the product thesis exist from the first commit
**Plans**: 3 plans

Plans:
- [ ] 01-01: Scaffold monorepo structure (apps/web, apps/server, packages/shared, root package.json + workspaces, tsconfig, eslint/prettier)
- [ ] 01-02: Create `.gitignore`, `LICENSE` (MIT), README skeleton with thesis line, shared TS types package
- [ ] 01-03: Add root dev script wiring both apps; verify clean-clone install + dev boot

### Phase 2: Backend Skeleton
**Goal**: A local Fastify+TypeScript server that boots on localhost, auto-picks a free port, opens the browser, and exposes health/prereqs/SSE endpoints.
**Depends on**: Phase 1
**Requirements**: BACK-01, BACK-02, BACK-03
**Success Criteria** (what must be TRUE):
  1. Running the server prints its localhost URL and automatically opens the default browser to the UI placeholder
  2. `GET /api/health` returns a healthy status and `GET /api/prereqs` reports the Node version and whether the `modal` CLI is installed/reachable
  3. `GET /events` holds an SSE connection and delivers timestamped log events to a connected client
  4. Structured logging (pino) is in place and feeds the SSE event bus
**Plans**: 2 plans

Plans:
- [ ] 02-01: Fastify+TS server, config (port auto-pick, 127.0.0.1 only), browser-open on boot, pino logger
- [ ] 02-02: Health route, prereqs checker route, SSE event bus + `/events` endpoint

### Phase 3: Frontend Shell
**Goal**: A polished, branded React+Vite+TS+Tailwind app shell with a left stepper rail and the reusable components later phases depend on.
**Depends on**: Phase 2
**Requirements**: FRONT-01, FRONT-02, FRONT-03, FRONT-04
**Success Criteria** (what must be TRUE):
  1. The browser shows a branded, responsive shell with a left stepper (Setup → Keys → Deploy → Launch) and a top status bar, with no console errors
  2. A zustand store holds account/instance/logs/phase state and a typed API client + SSE hook successfully connects to the backend `/events` stream
  3. Reusable components (LogStream, StatusDot, StepRail, Banner, KeyInput) exist and render correctly
  4. Each step page shows helpful "what this step does" copy (empty-but-guided)
**Plans**: 2 plans

Plans:
- [ ] 03-01: Vite+React+TS+Tailwind setup, layout (stepper rail + status bar), zustand store, API client + SSE hook
- [ ] 03-02: Build reusable components (LogStream, StatusDot, StepRail, Banner, KeyInput) and guided empty step pages

### Phase 4: Encrypted Key Store & Prereqs UI
**Goal**: The user installs prereqs and pastes Modal + HuggingFace keys safely — the Setup → Keys user journey, with keys encrypted at rest and validated before saving.
**Depends on**: Phase 3
**Requirements**: BACK-04, BACK-05, BACK-06, BACK-07, BACK-08, FRONT-05, FRONT-06
**Success Criteria** (what must be TRUE):
  1. The Setup page shows ✅/❌ for Node and the `modal` CLI, and offers guided install instructions when `modal` is missing
  2. The Keys page accepts Modal (token id + secret) and HuggingFace tokens in password-masked fields with a show toggle, and "Test & Save" validates each before persisting
  3. An invalid token produces a clear plain-language error (no crash); a valid token is stored encrypted with zero plaintext on disk and survives an app restart
  4. After saving valid keys, the Modal profile is active and a `huggingface` Modal secret exists on the user's account
**Plans**: 3 plans

Plans:
- [ ] 04-01: Encrypted key store (AES-256-GCM, OS keyring primary, passphrase fallback) + account CRUD routes
- [ ] 04-02: Modal token validation (`modal token set` + profile current) + HF whoami validation + Modal secret create/replace route
- [ ] 04-03: Frontend Setup page (prereqs card + guided install) and Keys page (masked inputs, Test & Save, real-time feedback)

### Phase 5: Deploy Pipeline & Clean ComfyUI Template
**Goal**: One "Deploy ComfyUI to Modal" button streams live, plain-language milestones and either succeeds unmistakably or fails loudly with a fix and a retry.
**Depends on**: Phase 4
**Requirements**: BACK-09, BACK-10, BACK-11, FRONT-07
**Success Criteria** (what must be TRUE):
  1. The bundled `comfyapp.py` template has a CONFIG dict, a data-driven MODELS list, loud-failure `download_models()` (required-model failure aborts deploy; optional warns), and a safe `max_inputs` default of 2
  2. Clicking Deploy renders the template, runs `modal deploy`, and the UI shows a live checklist of milestones (Image building → Models downloading → ComfyUI starting → URL ready) fed by parsed log lines
  3. A forced failure (e.g., bad HF token mid-build) surfaces a red banner naming the problem in plain English with a working "Try again" button — never a silent green
  4. A successful deploy transitions the instance to `ready` status and auto-advances to Launch
**Plans**: 3 plans

Plans:
- [ ] 05-01: Author clean `comfyapp.py` template (CONFIG dict, data-driven MODELS, loud-failure downloads, max_inputs=2) from the existing comfyapp.py per CONCERNS.md fixes
- [ ] 05-02: Modal CLI wrappers (deploy/run/secret/app list) streaming to SSE bus + milestone log-line parser + instance status state machine
- [ ] 05-03: Deploy route (template render → `modal deploy` → milestone events) + Deploy page UI (checklist, LogStream, loud failure banner + retry)

### Phase 6: Instance Status & Launch
**Goal**: The user lands on their ComfyUI URL and can revisit it anytime; status is live and the flow is resumable across restarts.
**Depends on**: Phase 5
**Requirements**: BACK-12, FRONT-08
**Success Criteria** (what must be TRUE):
  1. The Launch page shows a prominent "Open ComfyUI 🚀" button resolving to the Modal HTTPS URL, plus a live/cold/error status badge
  2. Clicking "Open ComfyUI" opens ComfyUI in a new tab; copy-link, redeploy, and delete actions all work
  3. Closing and reopening the browser preserves the instance record and URL (resumable state on disk)
  4. A cold instance shows "waking up…" and transitions to live
**Plans**: 2 plans

Plans:
- [ ] 06-01: Instance status route polling `modal app list` → live/cold/error + URL resolver; persisted instance records (resumable)
- [ ] 06-02: Launch page UI (Open ComfyUI button, status badge, copy/redeploy/delete); instances list page (single-instance now, list-shaped for v2)

### Phase 7: Polish, Docs & Open-Source Release
**Goal**: A stranger on GitHub can use this in under 5 minutes — one-command start, docs, troubleshooting, tests, and repo hygiene.
**Depends on**: Phase 6
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07
**Success Criteria** (what must be TRUE):
  1. `npx wan22-deploy` starts the app with no clone required (thin launcher fetching the build)
  2. The README quickstart is reproducible by a newcomer in under 5 minutes and includes a 60-second walkthrough
  3. In-app troubleshooting covers common errors with fixes; a Settings page exposes port/theme/data-location/clear-data
  4. `npm run build` produces a distributable bundle and minimal automated tests (key-store round-trip, milestone parser, template render) pass
  5. GitHub repo has issue/PR templates, CONTRIBUTING.md, and CI (lint + typecheck + build)
**Plans**: 3 plans

Plans:
- [ ] 07-01: `npx wan22-deploy` launcher, `npm run build` distributable bundle, README quickstart + 60s walkthrough
- [ ] 07-02: In-app troubleshooting, Settings page (port/theme/data location/clear data), and minimal automated tests
- [ ] 07-03: GitHub hygiene (issue/PR templates, CONTRIBUTING, CI lint+typecheck+build) + fresh-machine smoke test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation & Tooling | 3/3 | Complete | 2026-07-02 |
| 2. Backend Skeleton | 2/2 | Complete | 2026-07-02 |
| 3. Frontend Shell | 2/2 | Complete | 2026-07-02 |
| 4. Local Key Store & Prereqs UI | 3/3 | Complete | 2026-07-02 |
| 5. Deploy Pipeline & Clean ComfyUI Template | 3/3 | Complete | 2026-07-02 |
| 6. Instance Status & Launch | 2/2 | Complete | 2026-07-02 |
| 7. Polish, Docs & Open-Source Release | 3/3 | Complete | 2026-07-02 |
