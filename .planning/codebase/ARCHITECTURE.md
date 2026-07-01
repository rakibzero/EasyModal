---
mapped: 2026-07-01
focus: arch
---

# Architecture

## Pattern
**Single-file serverless container deployment.** One Python module (`comfyapp.py`) defines:
1. A container image (build-time),
2. A model-prefetch routine (runtime),
3. A ComfyUI web server (runtime).

There is no layered application architecture, no modules, no services — the whole app is ~468 lines in one file. This is idiomatic for a Modal deployment wrapping an external process (ComfyUI).

## Architectural Style
Container-based serverless with persistent storage + a managed external process.

```
┌──────────────────────── Modal Cloud ────────────────────────┐
│                                                              │
│  modal.App "wan22-animate-scail2"                            │
│  ├── image  (Debian + ComfyUI + 25 custom nodes)            │
│  ├── Volume "wan-models"  ── mounted at /cache               │
│  ├── Secret "huggingface" ── HF_TOKEN env                   │
│  │                                                           │
│  ├── fn download_all_models()   [CPU, 1h timeout]           │
│  │     └─ prefetch models to Volume                          │
│  │                                                           │
│  └── fn ui()  [A100-80GB, web_server:8188]                  │
│        ├─ download_models()      (fast on warm volume)       │
│        ├─ ensure_comfy_models_symlink()                      │
│        └─ subprocess.Popen → ComfyUI main.py :8188           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
            ▲                                    │
            │ HTTPS (Modal-generated URL)        │ reads/writes
   user browser                           ┌──────▼──────┐
   loads workflows/*.json                 │  /cache     │
                                          │  (Volume)   │
                                          └─────────────┘
```

## Components

### 1. Image definition ([comfyapp.py:214-411](comfyapp.py#L214-L411))
A `modal.Image.debian_slim(python_version="3.11")` built in ordered layers:
- apt packages → core Python (`uv_pip_install`) → `comfy-cli install` → SageAttention → **25 custom-node git clones** → additional Python deps.

The custom-node section is the bulk of the file (~150 lines, [comfyapp.py:236-395](comfyapp.py#L236-L395)) and is highly repetitive — each node is a `git clone` + optional `pip install -r requirements.txt` block.

### 2. `download_models()` ([comfyapp.py:37-174](comfyapp.py#L37-L174))
Module-level helper that:
- Creates model subdirectories under `/cache/models`,
- For each model, calls `_link()` to fetch via HF Hub and place into the right subdir,
- Creates convenience symlink subdirs (`Wan22Animate/`).

Called by **both** the standalone download function and the web server function (so the server self-heals missing models on cold start).

### 3. `_link()` helper ([comfyapp.py:53-71](comfyapp.py#L53-L71))
The core model-placement primitive. **Actual behavior** (differs from docs which describe symlinks):
- If destination exists → skip (idempotent).
- Otherwise: `hf_hub_download` → `os.link` (**hard link**) into the model dir.
- Fallback: `shutil.copy2` if hard-link fails.
- Final fallback: catch + log `FAIL:` (silent failure — see CONCERNS).

### 4. `ensure_comfy_models_symlink()` ([comfyapp.py:177-207](comfyapp.py#L177-L207))
Idempotently symlinks `/root/comfy/ComfyUI/models → /cache/models` and `/root/comfy/ComfyUI/output → /cache/output`. Runs only in the `ui()` function.

### 5. `download_all_models` ([comfyapp.py:424-430](comfyapp.py#L424-L430))
Standalone CPU function for pre-warming the volume (`modal run comfyapp.py`). Mounted Volume + HF secret, 1h timeout.

### 6. `ui()` ([comfyapp.py:437-455](comfyapp.py#L437-L455))
The web server. A100-80GB, 32GB RAM, 8 vCPU. Calls `download_models()` + symlink setup, then spawns ComfyUI as a subprocess on port 8188.

### 7. `main()` local entrypoint ([comfyapp.py:462-468](comfyapp.py#L462-L468))
`modal run` entry → invokes `download_all_models.remote()`.

## Data Flow
1. **Build** (Modal, once per image change): layers install system + Python + ComfyUI + 25 custom nodes.
2. **Cold start / prefetch**: `download_models()` pulls weights from HF Hub into the Volume (15–30 min first time; seconds when warm, due to `_link()` skip).
3. **Serve**: `ui()` symlinks model dirs, spawns ComfyUI subprocess on :8188.
4. **User**: opens Modal HTTPS URL → ComfyUI UI → loads a `workflows/*.json` → runs inference.
5. **Output**: ComfyUI writes generated videos to `/cache/output` (persisted on Volume).

## Entry Points
| Entry | Trigger | Purpose |
|-------|---------|---------|
| `main()` | `modal run comfyapp.py` | Pre-warm volume with models |
| `ui()` | `modal deploy comfyapp.py` → HTTPS request | Serve ComfyUI web UI |
| `download_all_models()` | called by `main()` via `.remote()` | CPU-side prefetch |

## Key Abstractions
| Abstraction | Location |
|-------------|----------|
| `modal.App` | [comfyapp.py:417](comfyapp.py#L417) |
| `modal.Image` | [comfyapp.py:214](comfyapp.py#L214) |
| `modal.Volume` | [comfyapp.py:30](comfyapp.py#L30) |
| `@modal.web_server` | [comfyapp.py:446](comfyapp.py#L446) |
| `download_models()` | [comfyapp.py:37](comfyapp.py#L37) |
| `_link()` | [comfyapp.py:53](comfyapp.py#L53) |

## Coupling Notes
- `download_models()` is shared between two functions → changing it affects both prefetch and cold-start.
- ComfyUI is a black-box subprocess; the app does not introspect or control it beyond launch args.
- Workflows are baked into the image (via `workflows/` dir), so adding a workflow requires a redeploy — the docs ([docs/CONFIGURATION.md:260](docs/CONFIGURATION.md#L260)) note this correctly.

## Doc Drift
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CONFIGURATION.md](docs/CONFIGURATION.md) describe `_link()` as creating **symlinks** and `max_inputs=5` / `startup_timeout=600`. The **actual code** uses **hard links** (with copy fallback) and `max_inputs=50` / `startup_timeout=1800`. The docs were generated by a doc-writer agent against an earlier version. Trust the code.
