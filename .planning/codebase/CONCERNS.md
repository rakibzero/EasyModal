---
mapped: 2026-07-01
focus: concerns
---

# Concerns

## 🚨 CRITICAL — Security

### Live secrets committed in `.env`
[`.env`](.env) contains **plaintext live credentials** and the repo has **no `.gitignore`**:
- Modal token ID + secret (`ak-...` / `as-...`)
- Modal web key + secret (`wk-...` / `ws-...`)
- HuggingFace token (`hf_elQJexQvP…rUcnjX` (REDACTED — see .env))

**Risk:** First `git add .` commits these to history. They are already exposed in the working tree.
**Fix:** Create `.gitignore` with `.env` (and `output/`, `__pycache__/`) **before any commit**. Rotate all three credentials — they must be treated as compromised.

### Public, unauthenticated ComfyUI endpoint
`@modal.web_server(8188)` exposes ComfyUI to the internet with **no auth** ([comfyapp.py:446](comfyapp.py#L446)). Anyone with the Modal URL can run GPU inference (compute cost abuse) and access ComfyUI's filesystem APIs.
**Fix:** Add Modal's built-in auth or a reverse-proxy auth layer if exposed beyond personal use.

## 🔴 HIGH — Reliability

### Silent model-download failures
`_link()` swallows all exceptions and prints `FAIL:` ([comfyapp.py:64-71](comfyapp.py#L64-L71)). A "successful" deploy can ship with missing models, surfacing only as runtime errors when a workflow loads.
**Fix:** Track failures and raise (or at least surface a non-zero summary) when any critical model fails.

### Workflows reference un-downloaded models
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [.planning/debug/all-possible-failure.md](.planning/debug/all-possible-failure.md) both note that several `workflows/*.json` reference models (IPAdapter, some LoRAs, CLIP variants) **not** in `download_models()`. These workflows fail at runtime.

## 🟠 MEDIUM — Reproducibility

### Everything unpinned
- ComfyUI installed from **nightly/master** ([comfyapp.py:232](comfyapp.py#L232))
- All **25 custom nodes** cloned from `main`/`master` — no commit SHAs ([comfyapp.py:236-395](comfyapp.py#L236-L395))
- Most Python deps unpinned

**Risk:** An upstream breaking change silently breaks the image build or runtime, with no way to bisect.
**Fix:** Pin custom-node commits (or at least tags) in the clone commands.

### Doc drift
[docs/](docs/) describe `_link()` as symlinks, `max_inputs=5`, `startup_timeout=600`, and `flash-attn` as a dependency. The **actual code** uses hard-links, `max_inputs=50`, `startup_timeout=1800`, and **no flash-attn**. Docs are auto-generated and stale. Source of truth = `comfyapp.py`.

## 🟡 LOW — Maintainability

### Boilerplate-heavy custom-node section
~150 lines of near-identical `git clone` + `pip install` blocks ([comfyapp.py:236-395](comfyapp.py#L236-L395)). A data-driven loop (list of `(repo, has_requirements)` tuples) would cut this to ~20 lines and make adding/removing nodes trivial. Low priority given it's build-time-only.

### Terseness over clarity
Single-letter-ish repo aliases (`RW`, `RS`, `RG`, `RK`) reduce line length but hurt grep-ability and reader orientation.

### No structured logging
Bare `print()` throughout. No log levels, no structured output — makes diagnosing remote Modal failures harder.

## Operational Concerns

### Cold-start cost
`ui()` calls `download_models()` on **every** cold start ([comfyapp.py:448](comfyapp.py#L448)). On a warm volume this is fast (idempotent skips), but every model is still stat-checked. With 30+ models this adds latency to every cold start.

### `max_inputs=50` on a single A100
A single Wan2.2 inference can use 30–50 GB VRAM. Allowing 50 concurrent inputs on one 80GB container **will** cause OOM. [docs/CONFIGURATION.md](docs/CONFIGURATION.md) correctly warns about this (but cites the old value of 5). **Reconcile: pick `max_inputs` based on actual per-inference VRAM.**

## Prior Failure Investigation
[.planning/debug/all-possible-failure.md](.planning/debug/all-possible-failure.md) catalogs known workflow failures — primarily missing-model mismatches. This is the project's de-facto known-issues list; consult before debugging a workflow error.
