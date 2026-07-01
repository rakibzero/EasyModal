---
mapped: 2026-07-01
focus: quality
---

# Testing

## Status: No Tests Exist

This project has **no automated tests**. There is:
- No test framework installed (no `pytest`, `unittest` files, no `tests/` dir)
- No CI configuration (no `.github/workflows/`, no `Makefile`)
- No test command
- No fixtures

## What Exists Instead
- [docs/TESTING.md](docs/TESTING.md) (~18KB) — a **manual verification guide** describing how to validate the deployment by hand (deploy, open URL, load workflow, run inference, check output). It is documentation of a manual process, not executable tests.
- [.planning/debug/all-possible-failure.md](.planning/debug/all-possible-failure.md) — a prior debug session cataloging workflow failure modes (missing models referenced by workflows not present in `download_models()`).

## Validation Approach (current, manual)
The effective "test" is the deployment smoke test:
1. `modal run comfyapp.py` → confirm `ALL MODELS DOWNLOADED` printed.
2. `modal deploy comfyapp.py` → open HTTPS URL → ComfyUI loads.
3. Load a `workflows/*.json` → run → confirm output video in `/cache/output`.

Any failure is observed as a missing-model `FAIL:` print or a ComfyUI runtime error in the browser.

## Framework: None
| Concern | State |
|---------|-------|
| Unit tests | None |
| Integration tests | None |
| Image-build tests | None |
| Model-presence assertions | None (silent `FAIL:` instead) |
| Workflow linting | None |
| CI/CD | None |

## Testing Gaps to Address
1. **No model-coverage check.** Workflows reference models that `download_models()` may not fetch. A simple assert "every workflow's model refs exist in the download list" would catch the failures cataloged in the debug doc.
2. **No image-build smoke test.** The 25 unpinned custom-node clones can break at any time; nothing detects this before deploy.
3. **No `_link()` result verification.** Silent failures mean a "successful" build can ship with missing models.
4. **No HF-token-presence assertion.** Missing `HF_TOKEN` fails silently.

## Recommendations (if tests are introduced)
- Lightest valuable layer: a Python script that (a) parses each `workflows/*.json`, (b) extracts referenced checkpoint/LoRA/VAE names, (c) asserts each is covered by a `_link()` call. This is high-signal, low-effort.
- A Modal `@app.function` smoke test that imports `comfyapp`, calls `download_models()` against a throwaway volume, and asserts no `FAIL:` lines.
