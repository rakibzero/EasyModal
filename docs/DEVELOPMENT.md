<!-- generated-by: gsd-doc-writer -->
# Development

This guide covers how to modify, extend, and debug the Wan2.2Animate project. The project is a single-file Modal deployment of ComfyUI with pre-loaded Wan2.2 video animation models.

## Local Setup

### Fork and clone

```bash
git clone <repo-url> wan22-animate
cd wan22-animate
```

<!-- VERIFY: Replace `<repo-url>` with the actual repository URL from your Git hosting provider. -->

### Modal CLI authentication

```bash
pip install modal
modal token set
```

Then create the HuggingFace secret required for model downloads:

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

See [GETTING-STARTED.md](GETTING-STARTED.md) for detailed prerequisites.

### Dev-only steps

Unlike production deploy (`modal deploy`), use these commands during development:

| Step | Command | Purpose |
|------|---------|---------|
| Pre-download models | `modal run comfyapp.py` | Downloads all models to the `wan-models` volume |
| Ephemeral dev server | `modal serve comfyapp.py` | Runs ComfyUI with live logs (no permanent deployment) |
| Full deploy (after testing) | `modal deploy comfyapp.py` | Creates a permanent Modal endpoint |

The `modal serve` command is the primary development loop tool — it starts the application in an ephemeral tunnel with stdout/stderr streaming to your terminal:

```bash
modal serve comfyapp.py
```

Press **Ctrl+C** to stop the server. The tunnel URL changes on each invocation.

## Project Structure

```
Wan2.2Animate/
├── comfyapp.py          # Single-file Modal app: image build, model downloads, web server
├── workflows/           # 10 ComfyUI JSON workflow files (user-facing)
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
├── output/              # Generated video/animation outputs (gitignored)
├── docs/                # Documentation (this file, ARCHITECTURE.md, etc.)
├── .env                 # Local Modal profile configuration (gitignored)
├── setups.txt           # Hardware requirement notes (reference)
└── README.md            # Quick-start guide
```

All application logic lives in `comfyapp.py`. The file is organized into four sections:

1. **Model downloads** — `download_models()` function and `_link()` helper (lines 35–164)
2. **Image build** — `modal.Image` definition with system deps, ComfyUI install, custom nodes (lines 171–371)
3. **App & functions** — `modal.App`, `download_all_models()` function, `ui()` web server (lines 377–413)
4. **Local entrypoint** — `main()` for `modal run` (lines 420–426)

## Development Workflow

The basic development cycle is:

1. **Edit** `comfyapp.py` (add a model, custom node, change GPU, etc.)
2. **Test** with `modal serve comfyapp.py`
3. **Verify** workflows load and run correctly in the ComfyUI web interface
4. **Deploy** with `modal deploy comfyapp.py` once testing passes

Modal's `serve` command rebuilds the container image on each invocation. The image build takes ~5–10 minutes, but model downloads from the cached volume are instant after the first run.

### Faster iteration tips

- **Pre-download models once**: Run `modal run comfyapp.py` first. This populates the `wan-models` volume so subsequent `modal serve` invocations skip model downloads entirely.
- **Test custom nodes separately**: If a custom node install fails, comment it out in the image build section and test the rest of the stack before debugging the node.
- **Keep workflows local**: Workflow JSON files are not mounted into the container — they are part of the image. To test a new workflow, either include it in the `workflows/` directory (requires redeploy) or upload it directly through the ComfyUI web interface.

## Adding New Models

Models are added by editing the `download_models()` function in `comfyapp.py` (lines 35–164). Use the `_link()` helper:

```python
_link("diffusion_models", "org/repo-name", "path/to/model.safetensors")
```

### _link() helper parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `model_subdir` | Subdirectory under `/root/comfy/ComfyUI/models/` | `"diffusion_models"`, `"text_encoders"`, `"vae"`, `"loras"`, `"clip_vision"`, `"sam"`, `"onnx"`, `"nlf"` |
| `repo` | HuggingFace Hub repository ID | `"Comfy-Org/Wan_2.2_ComfyUI_Repackaged"` |
| `filepath` | Path within the repository to the model file | `"split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"` |
| `filename` | Optional override for destination filename (defaults to basename of `filepath`) | `"my_model.safetensors"` |

### Adding a new model: step-by-step

1. Find the HuggingFace repo and file path for the model.
2. Add a call to `_link()` in the appropriate section of `download_models()`.
3. If the target subdirectory is not already created by the `mkdir` loop at lines 45–47, add it to the tuple.
4. If workflows expect the model in a subdirectory of `diffusion_models/`, add an entry to the `wan22_entries` dict (lines 145–151) to create a symlink subdirectory.
5. Test with `modal serve comfyapp.py` and verify the model appears in ComfyUI.

### Model subdirectories

The following subdirectories are created automatically at the start of `download_models()`:

```python
for subdir in ("diffusion_models", "text_encoders", "vae",
               "clip_vision", "loras", "sam", "onnx", "nlf"):
    (comfy_models / subdir).mkdir(parents=True, exist_ok=True)
```

If you use a new `model_subdir` not in this list, add it here first.

### Known missing models

The current download set covers the most common models, but **approximately 10 models referenced by the bundled workflows are not yet downloaded**. These include:

- IPAdapter model files (required by some SCAIL-2 workflows)
- Additional CLIP vision variants
- Some LoRA files not in the current repo list
- Specific GGUF quantization variants

Workflows referencing these models will fail with "model not found" errors. To add a missing model, identify its HuggingFace repo and file path, then add it via `_link()` as described above.

## Adding Custom Nodes

Custom nodes are installed during image build. Each node entry in `comfyapp.py` (lines 195–354) is a `.run_commands(...)` chain:

```python
# Template: add a new custom node
.run_commands(
    f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
    " && git clone https://github.com/owner/repo-name",
    f"cd {COMFY_DIR}/ComfyUI/custom_nodes/repo-name"
    " && pip install -r requirements.txt",
)
```

### Adding a new custom node

1. Find the GitHub repository URL for the node.
2. Add a new `.run_commands(...)` block to the image definition chain.
3. Include `pip install -r requirements.txt` if the node has Python dependencies; omit it if not.
4. Some nodes (like `ComfyUI-Manager` and `comfyui-scail2`) have no additional dependencies — use the clone-only pattern:

```python
.run_commands(
    f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
    " && git clone https://github.com/owner/repo-name",
)
```

5. Test with `modal serve comfyapp.py`.

### Node version pinning

All custom nodes are cloned at `@master` (default branch). This means:

- **Advantage**: You always get the latest features and bug fixes.
- **Risk**: A node update can introduce breaking changes or be incompatible with the current ComfyUI nightly build.

To pin a specific version, replace `git clone` with:

```bash
git clone https://github.com/owner/repo-name && cd repo-name && git checkout <commit-hash>
```

### Current custom nodes (25 total)

The full list is documented in [ARCHITECTURE.md](ARCHITECTURE.md#custom-nodes). Key nodes for video animation include `ComfyUI-WanVideoWrapper`, `ComfyUI-WanAnimatePlus`, `ComfyUI-SCAIL-Pose`, `ComfyUI-segment-anything-2`, and `ComfyUI-GGUF`.

## Adding or Editing Workflows

Workflows are ComfyUI JSON files placed in the `workflows/` directory at project root:

### Adding a new workflow

```bash
cp my_workflow.json workflows/
git add workflows/my_workflow.json
git commit -m "Add my_workflow.json"
```

### Editing an existing workflow

1. Load the workflow in ComfyUI (drag JSON onto the canvas or use the Load button).
2. Make changes in the ComfyUI interface.
3. Save the workflow:
   - In ComfyUI: click **Save** (or use the menu).
   - Download the JSON and overwrite the file in `workflows/`.
4. Commit the changes to git.

**Important**: Workflow files are baked into the container image during `modal deploy` or `modal serve`. They are not hot-reloaded. After editing a workflow, you must redeploy for changes to take effect. During development, you can upload workflows directly through the ComfyUI web interface without committing them to git.

### Workflow compatibility notes

- Most workflows reference models beyond the current download set. See "Known missing models" above.
- Some workflows expect models in specific subdirectory paths (e.g., `diffusion_models/Wan22Animate/`). The symlink subdirectory creation code at lines 143–162 handles this for WanAnimate+ and Bernini models.
- If a workflow references a custom node that is not installed, ComfyUI will show orange "node not found" warnings in the graph.

## Working with Volumes

The `wan-models` Modal Volume persists the HuggingFace model cache across deployments:

```python
vol = modal.Volume.from_name("wan-models", create_if_missing=True)
```

Use the Modal CLI to inspect the volume:

```bash
# List all files in the volume
modal volume ls wan-models

# List files under a specific path
modal volume ls wan-models models/diffusion_models

# Get volume info (size, age)
modal volume info wan-models
```

### When to reset the volume

If model files become corrupted or you want to force a clean download:

```bash
# Delete the entire volume (all cached models are lost)
modal volume rm wan-models --recursive

# Or delete a specific model to force re-download
modal volume rm wan-models /path/to/cached/file

# Then re-run model download
modal run comfyapp.py
```

**Note**: The volume stores the HuggingFace Hub cache (`/cache`), not the symlinked files directly. Deleting a cached file will cause the next deploy to re-download it.

## Debugging

### Using modal serve for live logs

```bash
modal serve comfyapp.py
```

This streams all stdout and stderr to your terminal, including:
- Container image build progress (apt, git clone, pip install)
- ComfyUI startup messages
- Model download status (LINK, EXISTS, FAIL messages)
- ComfyUI process logs (including inference errors)

### Checking ComfyUI console

When connected to the ComfyUI web interface, open the browser's developer console (F12). ComfyUI logs node loading errors, missing models, and execution errors to the browser console.

### Common error patterns

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `FAIL: model.safetensors (401 Client Error)` | `HF_TOKEN` is missing or invalid | Check the `huggingface` Modal secret |
| `Model not found: ...` in ComfyUI | Model not downloaded or symlinked | Check `download_models()` output; verify `_link()` call |
| Orange "node not found" in workflow | Custom node not installed | Add the node to the image build section |
| `CUDA out of memory` | GPU memory exhausted | Reduce concurrent requests (`max_inputs`), use fp8 models, or upgrade GPU |
| Container build timeout | Image build exceeds Modal's default limit | First build is slow; subsequent builds are faster |
| `modal.App` not found | Modal CLI not authenticated | Run `modal token set` or `modal setup` |

### Inspecting container state

You cannot SSH into a running Modal container, but you can:

- Watch the live log stream from `modal serve`.
- Check Modal dashboard (https://modal.com/apps) for invocation logs and error traces.
- Run `modal run comfyapp.py` to test model downloads in isolation without starting the web server.

### Testing without deploy

The `modal serve` command creates an ephemeral tunnel — no permanent deployment is created. This is the safest way to test changes:

```bash
modal serve comfyapp.py
# ... test in browser ...
# Press Ctrl+C to stop, then iterate
```

## Code Review Checklist

When reviewing changes to `comfyapp.py` or related files, verify the following:

### Model downloads

- [ ] All `_link()` calls use the correct HuggingFace repository ID and file path.
- [ ] New model subdirectories are added to the `mkdir` loop at lines 45–47 if needed.
- [ ] Symlink subdirectory entries (`wan22_entries`) are added for workflows that expect subdirectory paths.
- [ ] Model filenames are correct (typos here cause silent failures).
- [ ] Deployed model set covers the workflows in `workflows/` (or missing models are documented).

### Custom nodes

- [ ] Git clone URLs are correct and the repository is accessible.
- [ ] `pip install -r requirements.txt` is included only when the node has dependencies.
- [ ] No duplicate nodes (same functionality installed from different repos).
- [ ] Node is compatible with the ComfyUI nightly build (test with `modal serve`).

### Image build

- [ ] `uv_pip_install` and `apt_install` lists are free of conflicting version pins.
- [ ] `comfy-cli` version pins are up to date.
- [ ] No orphaned `pip install` lines that fail silently and are masked by `|| true`.
- [ ] Image build completes within the startup timeout (600s for web server).

### Workflow changes

- [ ] Workflow JSON is valid (can be loaded by ComfyUI).
- [ ] All referenced custom nodes are installed in the image build.
- [ ] All referenced model files are downloaded by `download_models()`.
- [ ] Workflow works end-to-end with `modal serve` before deploy.

### Configuration

- [ ] Resource parameters (GPU, memory, CPU) are appropriate for the intended workflows.
- [ ] `max_inputs` concurrency does not exceed available GPU memory.
- [ ] Timeout values are sufficient for the longest-running workflow.
- [ ] Modal secret name matches the actual secret created.

### Testing

- [ ] `modal run comfyapp.py` completes without errors.
- [ ] `modal serve comfyapp.py` starts and the web interface loads.
- [ ] At least one workflow from `workflows/` runs successfully.
- [ ] Volume caching works: second `modal serve` invocation skips model downloads.

## Known Limitations

### Model coverage

- **~10 missing models**: The bundled workflows reference approximately 10 models that are not yet included in `download_models()`. This includes IPAdapter models, additional CLIP variants, and some training-specific LoRAs. Workflows referencing these models will fail until the missing models are added.
- **fp8 vs fp16 variants**: Most downloaded models use fp8 quantization to reduce memory usage and download size. Some workflows may expect fp16 variants. The SCAIL-2 fp16 model is included, but the Wan2.2 I2V models are fp8 only. Adding fp16 variants will increase the download size significantly (~30 GB additional).
- **GGUF quantizations**: Three GGUF variants of SCAIL-2 are included (Q5, Q6, Q8), but other quantization methods (Q2, Q3, Q4) are not.

### Custom nodes

- **~30 nodes at @master**: All custom nodes are installed from the default branch (`@master`). This means:
  - Breaking changes from upstream can break the deployment at any time.
  - There is no version pinning for custom nodes.
  - Compatibility between nodes and the ComfyUI nightly build may drift over time.
- **No npm dependencies for rgthree-comfy**: The `rgthree-comfy` node is installed without its npm build step. Some visual features may not work.

### Image build

- **Long first build**: The initial `modal deploy` or `modal serve` takes 15–30 minutes due to downloading model files and building the container image with 25+ custom nodes.
- **No incremental image caching**: Modal rebuilds the entire image on each `modal deploy` or `modal serve` (though Docker layer caching applies within a single build).
- **SageAttention is optional**: If `pip install sageattention` fails, the build continues. This is intentional but means SageAttention optimization may not be available.

### Deployment

- **Single GPU**: The current configuration uses a single A100-80GB GPU. Multi-GPU or distributed inference is not supported.
- **No persistent storage for outputs**: Generated videos in `output/` only exist within the container. They must be downloaded before the container shuts down (Modal containers idle timeout after 300 seconds by default).
- **No authentication on ComfyUI**: The Modal-generated URL is public (unlisted, but anyone with the URL can access it). Add authentication through Modal's web endpoint options or a reverse proxy if needed.

## Build Commands

All build commands are invoked through the Modal CLI, not through `package.json` scripts:

| Command | Description |
|---------|-------------|
| `modal run comfyapp.py` | Pre-download all models to the `wan-models` volume (CPU worker) |
| `modal serve comfyapp.py` | Run ComfyUI as an ephemeral dev server with live logs |
| `modal deploy comfyapp.py` | Deploy ComfyUI as a permanent web service |
| `modal volume ls wan-models` | List cached model files in the volume |
| `modal secret create huggingface HF_TOKEN=xxx` | Create/update the HuggingFace auth secret |

There are no `npm run dev`, `npm run build`, or similar commands — the project uses Modal's CLI exclusively.

## Code Style

The project does not use ESLint, Prettier, or Biome. Python code follows standard Python conventions:

- **Indentation**: 4 spaces (Python standard)
- **Naming**: `snake_case` for functions and variables, `PascalCase` for classes
- **Docstrings**: Triple-quoted `"""docstrings"""` at module level and for complex functions
- **No type hints**: The codebase does not use Python type annotations

To maintain consistency:
- Keep `comfyapp.py` as a single file — do not refactor into multiple modules unless necessary.
- Follow the existing section ordering (model downloads → image build → app functions → entrypoint).
- Use the `_link()` helper for all model downloads, not raw `hf_hub_download()` calls.
- Use `print()` for status messages rather than logging (existing pattern).

## Branch Conventions

No explicit branch naming convention is documented for this project. Standard practice:

- `main` — the default and deployment branch
- Feature branches: `feat/add-model-xyz` or descriptive names
- Fix branches: `fix/missing-volume-mount`

## PR Process

This project does not have a PULL_REQUEST_TEMPLATE or formal review process documented. When submitting changes:

1. Ensure the code review checklist above is satisfied.
2. Test with `modal serve comfyapp.py` before creating a PR.
3. Include a clear description of what changed and why.
4. Note any new model downloads or custom nodes added.
5. If you added models, document which workflows now work that didn't before.

## Next Steps

- **[GETTING-STARTED.md](GETTING-STARTED.md)** — Prerequisites, setup, and first run instructions.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System overview, component diagram, and data flow.
- **[CONFIGURATION.md](CONFIGURATION.md)** — Detailed configuration reference for all settings.
- **[README.md](../README.md)** — Project overview and quick-start.
