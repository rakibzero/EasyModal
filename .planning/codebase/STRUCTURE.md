---
mapped: 2026-07-01
focus: arch
---

# Structure

## Directory Layout

```
Wan2.2Animate/
├── comfyapp.py                  # ★ THE application (468 lines, single file)
├── .env                         # Local Modal/HF CLI tokens (UNTRACKED — contains live secrets)
├── setups.txt                   # Notes: alternative GPU setups (L4 / L40S / A100)
├── README.md                    # Quick-start guide
├── DEPLOYMENTPROCESS.md         # Deployment lifecycle doc
├── modal-comfyui-docs.md        # Saved Modal docs (reference)
├── modal-guides-saved.md        # Saved Modal guides (reference)
│
├── docs/                        # Generated project docs
│   ├── ARCHITECTURE.md
│   ├── CONFIGURATION.md
│   ├── DEVELOPMENT.md
│   ├── GETTING-STARTED.md
│   └── TESTING.md
│
├── workflows/                   # ComfyUI JSON workflows (user assets)
│   ├── SCAIL-2_Animation.json
│   ├── SCAIL-2_Animation_multi-char.json
│   ├── SCAIL-2_Animation_multi-ref.json
│   ├── SCAIL-2_Animation_WAN-Context-Windows.json
│   ├── SCAIL-2_Replacement.json
│   ├── SCAIL2_simple.json
│   ├── SCAIL2_multi_ref.json
│   ├── Wananimate.json
│   ├── example_workflow_001.json
│   └── example_workflow_bernini.json
│
├── output/                      # Generated videos (gitignored, currently empty)
├── .planning/                   # FSDI planning artifacts
├── .remember/                   # Session memory (claude-mem)
└── .playwright-mcp/             # Playwright MCP artifacts
```

## Key Locations

| What | Where |
|------|-------|
| Application entry | [comfyapp.py](comfyapp.py) |
| Image build definition | [comfyapp.py:214-411](comfyapp.py#L214-L411) |
| Model download logic | [comfyapp.py:37-174](comfyapp.py#L37-L174) |
| Custom node clones | [comfyapp.py:236-395](comfyapp.py#L236-L395) |
| Web server function | [comfyapp.py:437-455](comfyapp.py#L437-L455) |
| Local CLI entrypoint | [comfyapp.py:462-468](comfyapp.py#L462-L468) |
| Workflows (user assets) | [workflows/](workflows/) |
| Project docs | [docs/](docs/) |
| Saved external docs | [modal-comfyui-docs.md](modal-comfyui-docs.md), [modal-guides-saved.md](modal-guides-saved.md) |

## Naming Conventions
- **Application code:** single lowercase file `comfyapp.py` (Modal convention).
- **Modal resources:** kebab-case names (`wan22-animate-scail2`, `wan-models`, `huggingface`).
- **Workflows:** `<MODEL>_<Variant>.json` — e.g. `SCAIL-2_Animation_multi-char.json`. Mixed kebab + underscore + PascalCase (inconsistent, mirrors ComfyUI export naming).
- **Docs:** UPPERCASE filenames (`ARCHITECTURE.md`) in `docs/` and root.
- **Constants:** `UPPER_SNAKE` in `comfyapp.py` (`COMFY_DIR`, `MODEL_DIR`, `VOL_MODELS`).
- **Repo-alias locals:** `RW`, `RS`, `RG`, `RK`, `RK_FP8` — short HuggingFace repo aliases (terseness over clarity).

## Logical Sections in comfyapp.py
The single file is organized with banner-comment sections:
1. `MODEL DOWNLOAD` ([line 33](comfyapp.py#L33)) — `download_models()`, `_link()` helpers
2. `IMAGE DEFINITION` ([line 210](comfyapp.py#L210)) — `image = modal.Image...` chain
3. `APP` ([line 413](comfyapp.py#L413)) — `app = modal.App(...)`
4. `STANDALONE MODEL DOWNLOAD` ([line 420](comfyapp.py#L420)) — `download_all_models`
5. `WEB UI (ComfyUI)` ([line 433](comfyapp.py#L433)) — `ui()`
6. `LOCAL ENTRYPOINT` ([line 458](comfyapp.py#L458)) — `main()`

## File Roles
- **Source (1 file):** `comfyapp.py`
- **Config:** none — config is inline in source
- **Assets:** `workflows/*.json` (10 ComfyUI workflows)
- **Reference:** `modal-*-saved.md`, `docs/*`, `DEPLOYMENTPROCESS.md`
- **Generated/ephemeral:** `output/`, `__pycache__/`, `.planning/tmp/`
