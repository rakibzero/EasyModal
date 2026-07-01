---
mapped: 2026-07-01
focus: quality
---

# Conventions

## Code Style
- **Single-file, flat structure.** No packages, no modules — everything in [comfyapp.py](comfyapp.py). Appropriate for a Modal deployment.
- **Python 3.11**, standard library + `modal` + `huggingface_hub`.
- **No linter/formatter config** (no `pyproject.toml`, no `ruff.toml`, no `.flake8`). Style is implicit.
- **PEP 8-ish**, 4-space indent, module docstring at top, section banners via `# ===...` comment blocks.

## Patterns Observed

### Module-level constants ([comfyapp.py:24-30](comfyapp.py#L24-L30))
```python
COMFY_DIR = "/root/comfy"
MODEL_DIR = f"{COMFY_DIR}/ComfyUI/models"
CACHE_DIR = "/cache"
VOL_MODELS = f"{CACHE_DIR}/models"
vol = modal.Volume.from_name("wan-models", create_if_missing=True)
```
Paths centralized as `UPPER_SNAKE` constants. Volume created at import time.

### Idempotent model placement — `_link()` ([comfyapp.py:53-71](comfyapp.py#L53-L71))
The defining pattern: hard-link-first, copy-fallback, silent-skip-on-failure.
```python
def _link(model_subdir, repo, filepath, filename=None):
    dest = comfy_models / model_subdir / filename
    if dest.exists():           # idempotent skip
        return
    try:
        src = hf_hub_download(...)
        os.link(src, dest)      # hard link (fast, same filesystem)
    except Exception:
        try:
            shutil.copy2(src, dest)   # fallback
        except Exception as exc:
            print(f"  FAIL:   {filepath}  ({exc})")  # silent fail
```
**Convention: failures are logged-and-swallowed.** This keeps the build resilient but hides problems — see [CONCERNS.md](CONCERNS.md).

### Fluent Modal image builder ([comfyapp.py:214-411](comfyapp.py#L214-L411))
Long method-chained `modal.Image.debian_slim(...).apt_install(...).uv_pip_install(...).run_commands(...)...`. Each custom node is a repeated `.run_commands(f"cd {COMFY_DIR}/ComfyUI/custom_nodes && git clone ... && pip install -r requirements.txt")` block — boilerplate-heavy, copy-paste convention.

### Short repo aliases
HuggingFace repo IDs aliased to terse 2-letter locals (`RW`, `RS`, `RG`, `RK`, `RK_FP8`) before use ([comfyapp.py:73,115,124,129,134](comfyapp.py#L73)). Readability sacrificed for brevity.

## Error Handling
- **Silent failure is the norm.** `download_models()` never raises — every `_link()` failure is caught and printed as `FAIL:`. The build/server proceeds even if models are missing.
- `sageattention` install uses `|| true` ([comfyapp.py:235](comfyapp.py#L235)) — optional, non-fatal.
- `ensure_comfy_models_symlink()` wraps each operation in try/except and logs `WARN:` ([comfyapp.py:185-192](comfyapp.py#L185-L192)).
- **No structured logging** — bare `print()` only.

## Documentation Convention
- All docs in `docs/` and root carry an HTML comment `<!-- generated-by: gsd-doc-writer -->` header, indicating they are **auto-generated**, not hand-maintained. The source of truth is `comfyapp.py`.
- Inline code comments are sparse — the code relies on section-banner comments rather than per-line docs.

## Secrets Convention
- `.env` is used as a **local scratchpad of CLI tokens** (not loaded by the app). It is **not gitignored yet** (no `.gitignore` exists) — a critical gap, see [CONCERNS.md](CONCERNS.md).
- Runtime secrets are expected via Modal named secrets, not env files.

## Reproducibility Convention
- Pinned: Python version, `comfy-cli`, `fastapi`, `huggingface-hub` floor.
- Unpinned (latest): ComfyUI itself (nightly), all 25 custom nodes (git HEAD), most Python deps. The project accepts drift in favor of "latest features."

## No Formal Conventions For
- Testing (see [TESTING.md](TESTING.md) — none exist)
- Git commits / branching (freshly initialized repo, no history)
- Code review / CI
