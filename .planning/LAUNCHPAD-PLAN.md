# Wan2.2Animate — Launchpad Plan

**Architecture: A — Local Launchpad WebUI driving Modal cloud compute.**
**Created:** 2026-07-01
**Status:** Proposed (autonomous draft — awaiting your OK to execute)

---

## 1. Goal (the one thing that must work)

A **local browser-based control panel** that takes a fresh user from zero to "ComfyUI open in a browser via a Modal link" through a guided, button-driven flow — and reliably re-builds/cleans up the cloud deployment. The compute stays on Modal; the **UX** of getting there becomes the product.

**Success = a non-technical user can install requirements, set two keys, click through the build, and land on a working ComfyUI URL — without ever touching a terminal or editing `comfyapp.py`.**

## 2. Why the current setup is painful (root causes)

From [.planning/codebase/CONCERNS.md](codebase/CONCERNS.md):
1. **No UI/UX** — everything is CLI (`modal run` / `modal deploy`), terminal log scraping.
2. **Silent failures** — `_link()` swallows errors and prints `FAIL:`; a "successful" build ships with missing models.
3. **Unpinned everything** — ComfyUI nightly + 25 custom nodes at `git HEAD`; builds break unpredictably.
4. **Doc drift** — generated docs disagree with code, so users follow wrong instructions.
5. **Key management** — secrets live in a scratch `.env` with no `.gitignore`; setting up Modal + HF secrets is fiddly.
6. **Workflow failures** — workflows reference models not in the download list; no upfront check.

The Launchpad fixes **#1 directly** (the stated top pain) and **#2, #5, #6** as enabling work. **#3, #4** are flagged but out of scope for v1 (tracked as follow-ups) — see §9.

## 3. Architecture

```
┌──────────────────────── Your machine ────────────────────────┐
│                                                               │
│  Browser  ──►  Launcher WebUI  (FastAPI + HTML/JS, localhost) │
│                     │                                         │
│                     │  ┌─ manages a local venv (.venv)        │
│                     │  ├─ stores keys locally (OS keyring/.env)
│                     │  ├─ shells out to `modal` CLI           │
│                     │  └─ tails build logs (streamed to UI)   │
│                     │                                         │
└─────────────────────┼─────────────────────────────────────────┘
                      │  modal deploy / modal run / modal secrets
                      ▼
┌──────────────────────── Modal Cloud ─────────────────────────┐
│  app "wan22-animate-scail2"                                   │
│  ├── cleaned-up comfyapp.py  (better error handling)          │
│  ├── Volume "wan-models"  (models + output)                   │
│  └── Secret "huggingface" (HF_TOKEN)                          │
│        │                                                      │
│        ▼  HTTPS URL (the "Modal–Comfy link")                  │
└────────┬──────────────────────────────────────────────────────┘
         │
    user opens ComfyUI in browser ── runs workflows
```

**Two separate runtimes, deliberately:**
- **Launcher** = local, lightweight, no GPU needed. Its only job is orchestration + UX.
- **Compute** = Modal cloud, A100-80GB. Unchanged in principle; cleaned up in implementation.

## 4. The user journey (what the UI does)

Five sequential panels, each gated on the previous:

| # | Panel | What happens | State persisted |
|---|-------|--------------|-----------------|
| 1 | **Setup** | Detect Python; offer "Create venv" → creates `.venv`, installs launcher deps. | `.venv/` exists |
| 2 | **Keys** | Two fields: Modal token (id+secret) + HF token. "Test & Save" → validates each, then `modal token set` + creates/updates Modal secret `huggingface`. | keys valid + Modal secret exists |
| 3 | **Build** | Big button "Build ComfyUI image & prefetch models". Streams logs live. Runs `modal deploy` (or `modal run` for prefetch). Surface failures **loudly** with a retry. | image built, Volume warm |
| 4 | **Verify** | Auto-checks: image built? required models present on Volume? workflows' model-refs satisfied? Green/red per check. | verification report |
| 5 | **Launch** | Shows the Modal HTTPS URL as a clickable button: "Open ComfyUI". Re-display anytime. | URL + status badge |

Each step has a **live log pane** (tail of the underlying modal command) and a **status dot** (idle / running / done / failed). The whole flow is resumable — closing the browser doesn't lose progress because state is on disk.

## 5. Tech choices

### Launcher WebUI
| Concern | Choice | Why |
|---------|--------|-----|
| Backend | **FastAPI** (already a ComfyUI dep, familiar) | Minimal, async, good for log streaming |
| Frontend | **Plain HTML + vanilla JS + minimal CSS** (no framework) | No build step, easy to read/maintain, ships in a few files |
| Log streaming | **Server-Sent Events (SSE)** | One-way stream, trivial in FastAPI, no websocket complexity |
| Local server | `127.0.0.1:7860` (or next free port) | Localhost-only; no exposure |

> Considered but rejected: Gradio (ComfyUI-adjacent but heavy/opinionated), Streamlit (poor for multi-step + logs), Electron (overkill for a local web UI). FastAPI + vanilla JS is the leanest thing that does the job.

### Local secret storage
- Primary: **OS keyring** (`keyring` lib) — keys never touch disk in plaintext.
- Fallback: a gitignored `.launcher.env` (only if keyring unavailable).
- **Never** the existing `.env` (which is a scratch file and currently unprotected).
- A `.gitignore` is created on first run (fixes the security gap from CONCERNS).

### Driving Modal
- The launcher shells out to the **`modal` CLI** (already installed at `/home/rakib/.local/bin/modal`) rather than using the Modal Python SDK inline. Why: the CLI handles auth/profiles/streams natively, and log tailing is just `subprocess` stdout piping.
- Commands used: `modal token set`, `modal secret create/replace`, `modal run comfyapp.py` (prefetch), `modal deploy comfyapp.py` (serve), `modal app list` (status/URL).

### `comfyapp.py` cleanup (the reliability half)
Targeted fixes, **not a rewrite** (preserve what works):
1. **Loud failures** — `download_models()` returns a result summary; the launcher fails the build if any *required* model `FAIL:`s (optional ones warn).
2. **Model/workflow coverage check** — a small function that parses `workflows/*.json`, extracts referenced model names, and reports which are/aren't in the download list. Powers Panel 4 (Verify).
3. **Config extraction** — move magic values (GPU, `max_inputs`, timeouts, app name) to a top-level `CONFIG` dict so the launcher can read/edit them without parsing the whole file.
4. **Reconcile `max_inputs`** — current `50` will OOM a single A100. Default to a safe value (e.g., `2`) with a launcher toggle.
5. `.gitignore` added (`.env`, `output/`, `__pycache__/`, `.venv/`).

**Explicitly deferred (see §9):** pinning custom-node SHAs, fixing doc drift, structured logging, auth on the public endpoint.

## 6. File structure (proposed)

```
Wan2.2Animate/
├── comfyapp.py                  # cleaned up (targeted fixes, §5)
├── launchpad/                   # ★ NEW — the launcher
│   ├── __init__.py
│   ├── server.py                # FastAPI app, routes, SSE log stream
│   ├── orchestrator.py          # venv mgmt, modal CLI wrappers, state machine
│   ├── secrets.py               # keyring storage + modal secret sync
│   ├── verify.py                # model/workflow coverage checks
│   ├── state.py                 # on-disk progress (resumable)
│   └── static/
│       ├── index.html           # the 5-panel UI
│       ├── app.js
│       └── style.css
├── run.py                       # ★ entrypoint: `python run.py` → opens browser → serves UI
├── requirements-launcher.txt    # ★ launcher deps (fastapi, keyring, uvicorn, webbrowser)
├── .gitignore                   # ★ NEW
├── workflows/  docs/  README.md  # unchanged
└── .planning/
```

## 7. Phased roadmap

Each phase ends in something runnable + verified.

### Phase 1 — Launcher skeleton + Setup panel
- Scaffold `launchpad/`, `run.py`, `requirements-launcher.txt`, `.gitignore`.
- Panel 1: detect Python, create `.venv`, install launcher deps, open browser to UI.
- **Verify:** `python run.py` launches a local page; venv exists after.

### Phase 2 — Secrets management + Keys panel
- `secrets.py`: keyring storage + "Test & Save" for Modal (id/secret) and HF token.
- Wire `modal token set` + `modal secret create/replace huggingface HF_TOKEN=...`.
- **Verify:** entering valid keys → Modal profile active + `huggingface` secret exists; invalid keys → clear error.

### Phase 3 — Build panel + log streaming
- `orchestrator.py`: run `modal deploy comfyapp.py` (and `modal run` prefetch) via subprocess, stream stdout over SSE into the live log pane.
- Surface exit codes; **fail loudly** on non-zero with a Retry button.
- **Verify:** clicking Build streams real modal logs; success → continues; failure → red + retry.

### Phase 4 — `comfyapp.py` cleanup + Verify panel
- Apply the targeted fixes in §5 (loud failures, `CONFIG` dict, `max_inputs` default, coverage checker).
- Panel 4: run coverage + Volume-presence checks; show green/red list.
- **Verify:** missing-model scenario turns a check red; a clean build is all green.

### Phase 5 — Launch panel + polish
- Panel 5: fetch the Modal HTTPS URL (`modal app list`), present as "Open ComfyUI" button + persistent status badge.
- Resumable state (close/reopen browser keeps progress).
- README update with the one-command start: `python run.py`.
- **Verify:** full end-to-end: fresh venv → keys → build → verify → open ComfyUI.

## 8. Success criteria (how we know "fullproof")

- [ ] **One command start:** `python run.py` (after clone) opens the UI.
- [ ] **No terminal needed after start:** all 5 steps clickable.
- [ ] **Keys never plaintext on disk** (keyring or gitignored fallback).
- [ ] **Failures are visible:** a broken build shows the actual error, not a silent green.
- [ ] **Resumable:** closing the browser mid-flow preserves progress.
- [ ] **Coverage check catches** the missing-model workflow failures cataloged in `.planning/debug/all-possible-failure.md`.
- [ ] **End-to-end happy path** verified: a real Modal URL opens working ComfyUI.

## 9. Out of scope (deliberate, for v1)

| Item | Why deferred |
|------|--------------|
| Pin custom-node git SHAs | Big effort, changes build semantics; track as Phase 6. |
| Fix doc drift in `docs/` | Generated docs; will regenerate after code stabilizes. |
| Auth on the public ComfyUI endpoint | Security hardening; separate concern from UX. |
| Hybrid local-GPU backend (Option C) | Not chosen; would re-architect. |
| Multi-user / remote launcher | Local-first by design. |

## 10. Assumptions I made (override if wrong)

1. **Launcher is local-only**, serves on localhost. (Not a hosted service.)
2. **Compute stays on Modal** (A100-80GB). You're keeping the cloud model.
3. **Refactor `comfyapp.py` in place**, not rebuild from scratch.
4. **`max_inputs` should default low** (2) to avoid OOM; user can raise it.
5. **Vanilla JS over a framework** for the launcher UI.
6. You're OK with me proceeding through all phases **without re-asking** at each step (you said autonomous) — I'll still pause at the end of each phase to show you what's verified.

---

**Next:** If this plan looks right, say **"go"** (or tell me which assumption/phase to change) and I'll start executing Phase 1. If you'd rather it be an FSDI-tracked project, I can fold this into `/fsdi-new-project` as the roadmap instead — your call.
