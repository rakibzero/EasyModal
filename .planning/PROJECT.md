# EasyModal

## What This Is

An open-source web app that deploys ComfyUI on [Modal](https://modal.com) cloud with zero friction. Users paste their Modal API key and HuggingFace token, click deploy, and get a working ComfyUI URL — no terminal, no editing Python, no fighting the CLI. It targets anyone who wants ComfyUI-on-Modal's GPU power without its miserable setup experience.

## Core Value

**A non-technical user can go from zero to an open ComfyUI URL by pasting two keys and clicking one button — never touching a terminal or editing `comfyapp.py`.**

## Requirements

### Validated

<!-- Existing capabilities from the brownfield codebase, now productized. -->
- ✓ ComfyUI runs on Modal A100-80GB with pre-cached models — existing (`comfyapp.py`)
- ✓ All Wan2.2 / SCAIL-2 / WanAnimate+ models download and hard-link into a persistent Volume — existing
- ✓ 25 ComfyUI custom nodes install during image build — existing
- ✓ ComfyUI web server serves on port 8188 behind a Modal HTTPS endpoint — existing

### Active

<!-- The product being built. -->
- [ ] Local Node web app (React+Vite frontend + Fastify backend) launchable by one command
- [ ] Encrypted local storage for Modal + HuggingFace keys (never plaintext on disk)
- [ ] Prereqs detection (Node, `modal` CLI) with guided install
- [ ] Key validation: "Test & Save" confirms tokens work before proceeding
- [ ] Clean, bundled `comfyapp.py` template (loud failures, CONFIG dict, `max_inputs=2` default, data-driven model list)
- [ ] Deploy pipeline: streams live, plain-language milestones to the UI; fails loudly with a fix
- [ ] Instance status + clickable "Open ComfyUI" link, resumable across restarts
- [ ] Open-source packaging: MIT license, one-command `npx wan22-deploy` start, README quickstart
- [ ] Multi-account/multi-instance-ready data model (schema today, UI in v2)

### Out of Scope

- Multi-account switcher UI — deferred to v2 (data model is ready)
- Multi-instance dashboard — deferred to v2
- Model/node/workflow library browser — deferred to v2.1+
- Auth on the public ComfyUI endpoint — separate security hardening concern
- Pinning custom-node git SHAs — deferred (build reproducibility, later)
- Hosted/SaaS version — v3 consideration

## Context

- **Brownfield:** Existing `comfyapp.py` (468 lines) deploys ComfyUI on Modal and works, but is painful to operate (CLI-only, silent failures, no UI). See `.planning/codebase/` for the full codebase map.
- **Product thesis:** "Modal is powerful but miserable to set up. This is the missing UI." Primary audience = people who want ComfyUI on cloud GPUs but can't stomach Modal's CLI/server setup.
- **Pain points being fixed (from CONCERNS.md):** no UI/UX (primary), silent build failures, no key management, workflows referencing un-downloaded models, doc drift.
- **Future direction (informs today's data model):** multiple Modal accounts, multiple instances, model/node/workflow libraries.

## Constraints

- **Tech stack (decided):** Node.js + React + Vite + TypeScript + Tailwind (frontend); Fastify + TypeScript (backend). Chosen for contributor pool and type-safety.
- **Deployment model:** Compute stays on Modal (user's account). The app is a *local* orchestrator — it never hosts compute.
- **Security:** Keys must be encrypted at rest (AES-256-GCM via OS keyring, passphrase fallback). The existing unprotected `.env` is replaced by this.
- **Distribution:** Open-source, MIT, one-command start (`npx wan22-deploy`). Must run on a fresh clone with no manual config.
- **Compatibility:** Requires the user to have the `modal` CLI installed (app detects + guides, doesn't bundle it).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Local app + browser UI (not hosted, not pure-static) | Browser sandbox can't run the Modal CLI or read keyrings; a thin local backend is the only way to "paste keys → deploy for you." | — Pending |
| React + Vite + TS + Tailwind for frontend | Largest contributor pool for open-source, best dashboard component ecosystem, type-safe. | — Pending |
| We own a clean bundled `comfyapp.py` template | The product's core value — users get reliability for free; we fix silent-failure/unpinned bugs once. | — Pending |
| Multi-account-ready data model from day 1 | Future roadmap (multi-account, multi-instance) is cheap now, expensive to retrofit. v1 UI stays single-account. | — Pending |
| npm workspaces (not pnpm/yarn) | Lowest friction for contributors — no extra install. | — Pending |
| MIT license | Most permissive, best OSS adoption. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-01 after initialization*
