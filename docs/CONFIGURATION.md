<!-- generated-by: gsd-doc-writer -->
# Configuration

This document describes all configurable aspects of the Wan2.2Animate Modal + ComfyUI deployment. Configuration is managed entirely through the `comfyapp.py` source file and Modal's platform settings — there are no separate YAML/JSON/TOML config files.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HF_TOKEN` | **Required** | — | HuggingFace read token used to authenticate model downloads from the Hub. Must be set in a Modal secret named `huggingface`. Without this, model downloads will fail silently (the `_link()` helper catches exceptions from `hf_hub_download`). |

### How to set the HuggingFace token

Create a Modal secret and deploy:

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

The secret is referenced in both functions via `modal.Secret.from_name("huggingface")` (`comfyapp.py:386` and `comfyapp.py:402`). The token is read inside `download_models()` as `os.environ.get("HF_TOKEN")` and forwarded to the HuggingFace Hub client as `HUGGINGFACE_HUB_TOKEN`.

## Modal App Configuration

| Setting | Value | Location |
|---------|-------|----------|
| **App name** | `wan22-animate-scail2` | `comfyapp.py:377` `modal.App("wan22-animate-scail2", image=image)` |
| **Image base** | `debian_slim` (Python 3.11) | `comfyapp.py:172` |
| **Package manager** | `uv` (via `uv_pip_install`) | `comfyapp.py:181-186, 356-370` |

The app name determines the Modal dashboard label and the auto-generated deployment subdomain. Change it by editing the `modal.App(...)` constructor.

## Image Build Configuration

The container image is built in ordered layers. Each layer is configurable in `comfyapp.py`:

### System packages (line 174-179)

```python
.apt_install("git", "wget", "ffmpeg", "libgl1", "libglib2.0-0",
             "libsm6", "libxext6", "libxrender-dev", "libfontconfig")
```

Edit the `.apt_install(...)` call to add or remove system dependencies.

### Core Python packages (line 181-186)

```python
.uv_pip_install(
    "fastapi[standard]==0.115.4",
    "comfy-cli==1.5.3",
    "boto3",
    "huggingface-hub>=0.26.0",
)
```

Pin or bump versions here. `comfy-cli` is used to install ComfyUI.

### ComfyUI installation (line 188-190)

```python
.run_commands("comfy --skip-prompt install --fast-deps --nvidia --skip-manager")
```

The `--fast-deps` flag skips optional dependency checks. `--nvidia` installs CUDA-compatible torch. `--skip-manager` defers ComfyUI-Manager to custom nodes (it is cloned separately at line 344-347). This installs the nightly (latest master) build.

### SageAttention (line 192)

```python
.run_commands("pip install sageattention 2>/dev/null || true")
```

SageAttention is installed optionally — the `|| true` causes the build to succeed even if pip fails.

### Custom nodes (lines 195-354)

Each custom node is a `.run_commands(...)` block containing `git clone` and optional `pip install -r requirements.txt`. To add a new node, add a new `.run_commands(...)` call. To remove one, delete the corresponding block. See [ARCHITECTURE.md](ARCHITECTURE.md#custom-nodes) for the full list.

### Additional Python dependencies (line 356-370)

```python
.uv_pip_install(
    "numpy", "transformers>=4.40.0", "flash-attn", "ninja",
    "packaging", "safetensors", "onnxruntime-gpu",
    "opencv-python-headless", "scipy", "einops", "accelerate",
    "imageio", "imageio-ffmpeg",
)
```

Edit this list to add or remove runtime Python packages.

## GPU Configuration

| Function | GPU | Configuration Code | Location |
|----------|-----|--------------------|----------|
| `download_all_models` | No GPU specified (CPU-only) | *(no `gpu` parameter)* | `comfyapp.py:384-389` |
| `ui` (ComfyUI server) | `A100-80GB` | `gpu="A100-80GB"` | `comfyapp.py:398` |

> **Note:** The `download_all_models` function does not set a `gpu` parameter, so it runs on Modal's default CPU worker. The assignment L40S may be offered in the user's Modal tier but is not hard-coded.
<!-- VERIFY: L40S (48GB VRAM) GPU availability depends on the Modal account tier and region. It is not hard-coded in comfyapp.py and may differ per deployment. -->

To change the GPU for the web UI, edit the `gpu` parameter in the `@app.function(gpu="A100-80GB", ...)` decorator at line 398. Modal supports GPU types such as `"A100-80GB"`, `"A100"`, `"L40S"`, `"L4"`, and `"T4"`.

## Hardware Resources

| Function | Memory | vCPUs | Location |
|----------|--------|-------|----------|
| `download_all_models` | Modal default (not explicitly set) | Modal default (not explicitly set) | `comfyapp.py:384-389` |
| `ui` | 32768 MB (32 GB) | 8.0 | `comfyapp.py:399-400` |

Change these by editing the `memory=` and `cpu=` parameters in the respective `@app.function(...)` decorators. Modal accepts memory values in MB and CPU values as fractional numbers (e.g., `cpu=4.0`).

## Timeout Configuration

| Setting | Value | Location |
|---------|-------|----------|
| `download_all_models` function timeout | 3600 seconds (60 minutes) | `comfyapp.py:387` `timeout=3600` |
| `ui` function timeout | 1800 seconds (30 minutes) | `comfyapp.py:403` `timeout=1800` |
| `@modal.web_server` startup timeout | 600 seconds (10 minutes) | `comfyapp.py:406` `startup_timeout=600` |

The function timeout is the maximum wall-clock time a single invocation can run before Modal terminates it. The startup timeout is how long Modal waits for the web server to bind to port 8188 before considering the deployment failed.

## Concurrency and Scaling

| Setting | Value | Location |
|---------|-------|----------|
| Max concurrent inputs | 5 | `comfyapp.py:405` `@modal.concurrent(max_inputs=5)` |
| Container idle timeout | 300 seconds (5 minutes) | Modal platform default (not set in code) |

<!-- VERIFY: The 300-second container idle timeout is Modal's platform default. It is not configured in comfyapp.py and may be overridden in the Modal dashboard or via `modal.config`. -->

`@modal.concurrent(max_inputs=5)` allows up to 5 ComfyUI inference requests to run simultaneously on the same GPU. Modal queues additional requests. To adjust, change the `max_inputs` value — but note GPU memory constraints. A single Wan2.2 inference can use 30–50 GB of VRAM, so values above 1 may cause OOM errors on a single A100-80GB.

## Storage Configuration

| Resource | Name | Mount Point | Purpose | Location |
|----------|------|-------------|---------|----------|
| Modal Volume | `wan-models` | `/cache` | Persists the HuggingFace Hub cache across deployments | `comfyapp.py:28` |
| Modal Secret | `huggingface` | *(env var)* | Provides `HF_TOKEN` for authenticated downloads | `comfyapp.py:386, 402` |
| Local directory | `output/` | — | Generated animation/video outputs (gitignored) | Project root |

### Volume details

```python
vol = modal.Volume.from_name("wan-models", create_if_missing=True)
```

- `from_name("wan-models")` — references a Modal Volume by name. If you rename it, update all function decorators that mount it.
- `create_if_missing=True` — automatically creates the volume on first deploy if it does not exist.
- The volume is mounted at `/cache` in both `download_all_models` and `ui` functions via the `volumes={CACHE_DIR: vol}` parameter.

## Model Download Configuration

Model downloading is handled by the `download_models()` function (`comfyapp.py:35-164`) using a `_link()` helper:

```python
def _link(model_subdir, repo, filepath, filename=None):
    dest = comfy_models / model_subdir / filename
    if dest.exists() or dest.is_symlink():
        return
    src = hf_hub_download(repo_id=repo, filename=filepath, cache_dir=cache_dir)
    dest.symlink_to(src)
```

### Adding a new model

To add a new model, insert a call to `_link()` in the `download_models()` function:

```python
_link("diffusion_models", "org/repo-name", "path/to/model.safetensors")
```

Parameters:
- `model_subdir` — subdirectory under `/root/comfy/ComfyUI/models/` (e.g., `"diffusion_models"`, `"text_encoders"`, `"vae"`, `"loras"`, `"clip_vision"`, `"sam"`, `"onnx"`, `"nlf"`)
- `repo` — HuggingFace Hub repository ID (e.g., `"Comfy-Org/Wan_2.2_ComfyUI_Repackaged"`)
- `filepath` — path within the repository
- `filename` — optional override for the destination filename (defaults to `Path(filepath).name`)

### Model subdirectories created automatically

```python
for subdir in ("diffusion_models", "text_encoders", "vae",
               "clip_vision", "loras", "sam", "onnx", "nlf"):
    (comfy_models / subdir).mkdir(parents=True, exist_ok=True)
```

If you add a new `model_subdir` value to a `_link()` call that doesn't exist in this list, also add it here, or the directory will not exist and the symlink will fail.

### Symlink subdirectories

After downloading, the code creates convenience subdirectories under `diffusion_models/`:

| Subdirectory | Contains symlinks to |
|-------------|---------------------|
| `Wan22Animate/` | `Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors` |
| `Wan22Bernini/` | `Wan22_Bernini_HIGH_*.safetensors`, `Wan22_Bernini_LOW_*.safetensors` |

This is required because some ComfyUI workflows expect models to be in subdirectory paths. Edit the `wan22_entries` dict at line 145-151 to add more.

### Skip mechanism

If a symlink or file already exists at the destination path, `_link()` prints `EXISTS: {name}` and skips the download. This is what makes subsequent deploys fast — the `wan-models` volume persists the cache across deployments.

### Current models downloaded

Refer to [ARCHITECTURE.md](ARCHITECTURE.md#models-directory-structure) for the complete inventory of currently downloaded models and their source repositories.

## Custom Node Configuration

Custom nodes are added during image build via git clone and optional `pip install -r requirements.txt`. The current set of 25 custom nodes is defined in `comfyapp.py:195-354`.

### Adding a custom node

Add a new `.run_commands(...)` block in the image definition:

```python
.run_commands(
    f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
    " && git clone https://github.com/owner/repo-name",
    f"cd {COMFY_DIR}/ComfyUI/custom_nodes/repo-name"
    " && pip install -r requirements.txt",
)
```

Some nodes have no Python dependencies — in that case, omit the `pip install` command.

### Removing a custom node

Delete the corresponding `.run_commands(...)` block.

> **Note:** The `ComfyUI-Manager` and `comfyui-scail2` nodes are installed without `pip install -r requirements.txt` because their dependencies are already satisfied by other layers or they are pure Python/no-dependency nodes.

## Workflow Configuration

ComfyUI workflow files are plain JSON placed in the `workflows/` directory at the project root:

```
workflows/
├── SCAIL-2_Animation.json
├── SCAIL-2_Animation_multi-char.json
├── SCAIL-2_Animation_multi-ref.json
├── SCAIL-2_Animation_WAN-Context-Windows.json
├── SCAIL-2_Replacement.json
├── SCAIL2_simple.json
├── SCAIL2_multi_ref.json
├── Wananimate.json
├── example_workflow_001.json
└── example_workflow_bernini.json
```

### Adding a workflow

Copy a new JSON file into the `workflows/` directory:

```bash
cp my_workflow.json workflows/
git add workflows/my_workflow.json
git commit -m "Add my_workflow.json"
```

On next deploy (`modal deploy comfyapp.py`), the workflow will appear in ComfyUI's web interface. The `workflows/` directory is included in the git repository but not mounted into the container — workflows are part of the image build and require redeployment to update.

## Default Timeouts and Limits Summary

| Parameter | Value | Where configured |
|-----------|-------|-----------------|
| Model download timeout | 3600s | `comfyapp.py:387` `timeout=3600` |
| Web UI function timeout | 1800s | `comfyapp.py:403` `timeout=1800` |
| Web server startup timeout | 600s | `comfyapp.py:406` `startup_timeout=600` |
| Container idle timeout | 300s | Modal platform default |
| Max concurrent requests | 5 | `comfyapp.py:405` `@modal.concurrent(max_inputs=5)` |
| UI function memory | 32768 MB | `comfyapp.py:399` `memory=32768` |
| UI function CPU | 8.0 vCPUs | `comfyapp.py:400` `cpu=8.0` |
| Web server port | 8188 | `comfyapp.py:406, 411` |

## Per-Environment Overrides

All configuration lives in `comfyapp.py` — there is no per-environment configuration mechanism (no `.env.development`, `.env.production`, etc.). To change configuration for a specific environment:

1. **Staging/Testing**: Deploy a separate Modal app with a different app name by editing `modal.App("wan22-animate-scail2", ...)` to `modal.App("wan22-animate-scail2-staging", ...)`.
2. **Production**: The primary deployment uses `modal deploy comfyapp.py`. Adjust resource parameters (GPU, memory, timeout) directly in the source.

Modal's platform settings (secrets, volumes) are environment-scoped by Modal workspace. Use different Modal workspaces (`modal profile`), or different secret/volume names for isolation.
