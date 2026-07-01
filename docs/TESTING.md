<!-- generated-by: gsd-doc-writer -->
# Testing

This document describes how to test the Wan2.2Animate Modal + ComfyUI deployment. There is **no automated test suite** — all testing is performed manually through the Modal CLI and the ComfyUI web interface.

## Test Framework and Setup

There is no test framework configured for this project. The project is a single-file Modal deployment (`comfyapp.py`) with no `requirements-dev.txt`, no `jest`, `pytest`, or `vitest` configuration. All validation is manual.

### Required tools

- **Modal CLI** — authenticated via `modal token set` or `modal setup`
- **HuggingFace token** — stored in a Modal secret named `huggingface`
- **A web browser** — for accessing the ComfyUI interface and loading workflows
- **Python 3.11+** — for running `modal run` and `modal deploy`

### Create the HuggingFace secret (one-time setup)

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

## 1. Deployment Test

Verify that `modal deploy comfyapp.py` completes without errors.

### Procedure

```bash
modal deploy comfyapp.py
```

**Expected result:** The command exits with exit code 0 and prints a public HTTPS endpoint, e.g.:

```
✓ Created objects.
  => https://wan22-animate-scail2--ui.modal.run
```

**What to check:**

- The image build completes (system packages, ComfyUI install, 25+ custom node clones, Python dependencies).
- No `FAIL:` messages appear in the model download output (each model should show `LINK:` or `EXISTS:`).
- The web server binds to port 8188 within the 600-second startup timeout.
- You can open the generated URL in a browser and see the ComfyUI interface.

**If the deployment fails:**

- Check the Modal dashboard (https://modal.com/apps) for invocation logs.
- Common failures: missing `huggingface` secret (model downloads fail silently), insufficient GPU quota, image build timeout.

### Automation note

There is no CI pipeline. To test in CI, you would need:

- A Modal account with CI credentials.
- A CI runner with Python and Modal CLI installed.
- A `huggingface` Modal secret created in the Modal workspace used by CI.

## 2. Model Download Test

Verify that all models pre-download successfully without starting the web server.

### Procedure

```bash
modal run comfyapp.py
```

**Expected result:**

- The `download_all_models()` function runs on a CPU worker.
- Each model shows either `LINK:` (first download) or `EXISTS:` (cached from previous run).
- The final line prints `=== ALL MODELS DOWNLOADED ===`.
- Exit code is 0.

**What to check:**

- Scan the output for any `FAIL:` lines. Each `FAIL:` indicates a download error (typically a missing token, wrong repo name, or incorrect file path).
- The first run takes 15–30 minutes (downloads ~15+ GB of model files).
- Subsequent runs should complete in seconds (all models cached).

### Model inventory

The `download_models()` function (lines 35–164 in `comfyapp.py`) downloads the following model files:

| Category | Files |
|----------|-------|
| **diffusion_models/** | `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`, `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`, `wan2.1_14B_SCAIL_2_fp8_scaled.safetensors`, `wan2.1_14B_SCAIL_2_fp16.safetensors`, `SCAIL-2-Q5_K_M.gguf`, `SCAIL-2-Q6_K.gguf`, `SCAIL-2-Q8_0.gguf`, `Wan2_2-Animate-14B_fp8_e5m2_scaled_KJ_v2.safetensors`, `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`, `Wan22_Bernini_LOW_fp8_e4m3fn_scaled.safetensors`, `Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors` |
| **text_encoders/** | `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, `umt5-xxl-enc-bf16.safetensors` |
| **vae/** | `wan_2.1_vae.safetensors`, `wan2.2_vae.safetensors`, `Wan2_1_VAE_bf16.safetensors` |
| **clip_vision/** | `clip_vision_h.safetensors` |
| **loras/** | `Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors`, `lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors`, `Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64_720.safetensors`, `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors`, `wan2.1_SCAIL_2_DPO_lora_bf16.safetensors`, `WanAnimate_relight_lora_fp16.safetensors`, `WanAnimate_relight_lora_fp16_resized_from_128_to_dynamic_22.safetensors` |
| **sam/** | `sam3.1_multiplex_fp16.safetensors`, `sam2.1_hiera_large.safetensors` |
| **onnx/** | `vitpose-l-wholebody.onnx`, `yolov10m.onnx` |
| **nlf/** | `nlf_l_multi_0.3.2_fp16.safetensors` |

## 3. Workflow Compatibility (Manual)

Verify each workflow JSON in `workflows/` loads correctly in ComfyUI.

### Procedure

1. Deploy the app: `modal deploy comfyapp.py`
2. Open the Modal-generated HTTPS URL in a browser.
3. For each workflow file in `workflows/`:
   - Drag the JSON file onto the ComfyUI canvas (or use the Load button).
   - Check for orange/red "node not found" warnings on any node.
   - If no missing node warnings appear, the workflow is **compatible**.
   - (Optional) Queue the workflow with default inputs to verify it runs end-to-end.

**Expected result:**

- Each workflow loads without missing node errors.
- All custom nodes referenced by the workflow are installed (the 25+ nodes in the image build cover all workflow needs).

### Workflow list

| Workflow | Expected status | Notes |
|----------|----------------|-------|
| `Wananimate.json` | Compatible — all nodes installed, most models downloaded | References `clip_vision_h.safetensors` ✓ |
| `SCAIL-2_Animation.json` | Compatible — all nodes installed, all models downloaded | |
| `SCAIL-2_Animation_multi-char.json` | Compatible — same model set as Animation | |
| `SCAIL-2_Animation_multi-ref.json` | Compatible — same model set as Animation | |
| `SCAIL-2_Animation_WAN-Context-Windows.json` | Compatible — same model set as Animation | |
| `SCAIL-2_Replacement.json` | Compatible — same model set as Animation | |
| `SCAIL2_simple.json` | Nodes compatible — model gap for `clip_vision_vit_h.safetensors` | See model coverage below |
| `SCAIL2_multi_ref.json` | Nodes compatible — model gap for `clip_vision_vit_h.safetensors` | See model coverage below |
| `example_workflow_001.json` | Nodes compatible — model gaps for `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`, `Wan21_Uni3C_controlnet_fp16.safetensors` | See model coverage below |
| `example_workflow_bernini.json` | Nodes compatible — model gap for `Wan2.1 - lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank256_bf16.safetensors` | See model coverage below |

## 4. Model Coverage Verification

Cross-reference the models downloaded by `download_models()` against the model files referenced by each workflow.

### Procedure

Extract model references from all workflow JSONs and compare against the download list:

```bash
# List all model files referenced by workflows
python3 -c "
import json, glob, os

referenced = set()
for f in sorted(glob.glob('workflows/*.json')):
    with open(f) as fp:
        data = json.load(fp)
    for n in data.get('nodes', []):
        for v in n.get('widgets_values', []):
            if isinstance(v, str) and ('.safetensors' in v or '.gguf' in v or '.onnx' in v):
                referenced.add(v.split('/')[-1].split('\\\\')[-1])

downloaded = [
    'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
    'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
    'wan2.1_14B_SCAIL_2_fp8_scaled.safetensors',
    'wan2.1_14B_SCAIL_2_fp16.safetensors',
    'SCAIL-2-Q5_K_M.gguf', 'SCAIL-2-Q6_K.gguf', 'SCAIL-2-Q8_0.gguf',
    'Wan2_2-Animate-14B_fp8_e5m2_scaled_KJ_v2.safetensors',
    'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors',
    'Wan22_Bernini_LOW_fp8_e4m3fn_scaled.safetensors',
    'Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors',
    'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'umt5-xxl-enc-bf16.safetensors',
    'wan_2.1_vae.safetensors', 'wan2.2_vae.safetensors', 'Wan2_1_VAE_bf16.safetensors',
    'clip_vision_h.safetensors',
    'Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors',
    'lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors',
    'Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64_720.safetensors',
    'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
    'wan2.1_SCAIL_2_DPO_lora_bf16.safetensors',
    'WanAnimate_relight_lora_fp16.safetensors',
    'WanAnimate_relight_lora_fp16_resized_from_128_to_dynamic_22.safetensors',
    'sam3.1_multiplex_fp16.safetensors', 'sam2.1_hiera_large.safetensors',
    'vitpose-l-wholebody.onnx', 'yolov10m.onnx',
    'nlf_l_multi_0.3.2_fp16.safetensors',
]

missing = referenced - set(downloaded)
print('Referenced models not in download set:')
for m in sorted(missing):
    print(f'  {m}')
"
```

### Known coverage gaps

The following models are referenced by bundled workflows but **not included** in the current `download_models()`:

| Model | Referenced by | Where to add |
|-------|---------------|-------------|
| `clip_vision_vit_h.safetensors` | `SCAIL2_simple.json`, `SCAIL2_multi_ref.json` | `_link("clip_vision", ...)` |
| `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | `example_workflow_001.json` | `_link("clip_vision", ...)` |
| `Wan21_Uni3C_controlnet_fp16.safetensors` | `example_workflow_001.json` | `_link("diffusion_models", ...)` (or appropriate subdirectory) |
| `Wan2.1 - lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank256_bf16.safetensors` | `example_workflow_bernini.json` | `_link("loras", ...)` |

Workflows that reference these models will load in ComfyUI (no missing node errors) but will fail at queue time with "model not found" errors.

To close these gaps, add a `_link()` call in `download_models()` for each missing model:

```python
_link("clip_vision", "org/repo", "clip_vision_vit_h.safetensors")
_link("clip_vision", "org/repo", "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors")
_link("diffusion_models", "org/repo", "Wan21_Uni3C_controlnet_fp16.safetensors")
_link("loras", "org/repo", "Wan2.1 - lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank256_bf16.safetensors")
```

<!-- VERIFY: The HuggingFace repository IDs and exact file paths for the four missing models above must be verified before adding them. The filename and paths listed are extracted from the workflow JSON node values and may differ from the actual repository layout. -->

## 5. Volume Persistence Test

Verify that the `wan-models` Modal Volume caches models across deployments, making subsequent deploys faster.

### Procedure

1. **First deploy**: `modal deploy comfyapp.py`
   - Expected duration: 15–30 minutes (image build + ~15 GB model downloads).
   - Note the completion time.

2. **Second deploy** (immediately after first completes): `modal deploy comfyapp.py`
   - Expected duration: 5–10 minutes (image build only; model downloads skipped).
   - The model download output should show `EXISTS:` for every model (no `LINK:` or `FAIL:`).

**What to check:**

- The second deploy should skip all model downloads (symlinks already exist from the first deploy).
- Compare the `Time:` output from Modal for both deploys. The second should be significantly faster.
- The volume persists even if you delete the Modal App (`modal app stop`), as long as the volume is not deleted.

### Verification commands

```bash
# Check volume contents
modal volume ls wan-models

# Check volume info (size, creation time)
modal volume info wan-models
```

### Forcing a clean download

If models become corrupted or you want to test from scratch:

```bash
modal volume rm wan-models --recursive
modal run comfyapp.py   # Re-download everything
```

## 6. Concurrent Access Test

Verify that `@modal.concurrent(max_inputs=5)` allows multiple simultaneous ComfyUI workflow runs on the same GPU.

### Procedure

1. Deploy the app: `modal deploy comfyapp.py`
2. Open the ComfyUI URL in **multiple browser tabs** (at least 2–3).
3. In each tab, load a workflow (e.g., `SCAIL-2_Animation.json`) and click **Queue Prompt** in rapid succession.
4. Observe the behavior.

**Expected result:**

- Multiple queues should be processed concurrently (up to 5 simultaneous requests).
- The ComfyUI queue should show multiple entries being processed.
- No `CUDA out of memory` errors (at default settings with fp8 models).

### Notes and limitations

- `max_inputs=5` allows up to 5 inference requests to run simultaneously on the A100-80GB GPU.
- Wan2.2 14B models use 30–50 GB VRAM per inference. Running more than 1–2 concurrent inferences may trigger OOM errors depending on the workflow and resolution.
- Modal queues requests beyond `max_inputs=5` — they wait until a slot opens.
- For production use, monitor GPU memory usage and reduce `max_inputs` if OOM errors occur.

### VRAM usage estimate

| Workflow type | Approximate VRAM | Safe concurrency on A100-80GB |
|---------------|------------------|-------------------------------|
| SCAIL-2 animation (fp8) | ~30 GB | 2 concurrent |
| WanAnimate+ (fp8) | ~35 GB | 2 concurrent |
| Bernini (fp8) | ~35 GB | 2 concurrent |
| SCAIL-2 (fp16) | ~50 GB | 1 concurrent |
| GGUF (Q5/Q6/Q8) | ~25–35 GB | 2 concurrent |

Actual VRAM usage depends on resolution, batch size, and workflow complexity. Start with 1 concurrent request and increase after confirming stability.

## 7. Known Test Gaps

The following testing limitations currently apply:

| Gap | Impact | Mitigation |
|-----|--------|------------|
| **No automated test suite** | Every deployment must be manually verified. Regression detection relies on human observation. | Use the pre-deploy checklist (section 8) to ensure consistent manual testing. |
| **No CI pipeline** | No automatic testing on `git push` or PR creation. Changes are tested locally via `modal serve` only. | Test all changes with `modal serve comfyapp.py` before deploying. |
| **No model download verification** | Download failures are silent (exceptions are caught by `_link()`). A failed download prints `FAIL:` but does not halt deployment. | Scan `modal deploy` output for `FAIL:` lines. Run `modal run comfyapp.py` separately to verify all models. |
| **No workflow validity validation** | Workflow JSON files are not validated against installed custom nodes or model files. A workflow may load but fail at queue time. | Load each workflow manually in ComfyUI after deployment. Queue with default inputs for a quick smoke test. |
| **No performance benchmarks** | No data on inference time, throughput, or VRAM usage across workflows. Performance regression is not measurable. | Record inference times manually for key workflows. Compare across deployments. |
| **No stress testing** | No automated concurrent request testing. `max_inputs=5` behavior under load is untested. | Manual multi-tab testing (section 6) provides basic coverage. |
| **No volume corruption detection** | If the `wan-models` volume is corrupted, downloads silently reuse cached files. | Periodically delete and recreate the volume for a clean download. |

## 8. Pre-Deploy Checklist

Run through this checklist before every deployment to `modal deploy` or before opening a pull request.

### Environment

- [ ] Modal CLI is authenticated (`modal token set` or `modal setup`)
- [ ] Modal secret `huggingface` exists and contains a valid `HF_TOKEN`
  ```bash
  modal secret list
  ```
- [ ] Modal Volume `wan-models` exists
  ```bash
  modal volume ls wan-models
  ```
  (It will be created automatically if it doesn't exist, but checking ahead of time avoids surprises.)

### Code changes

- [ ] `comfyapp.py` parses without syntax errors
  ```bash
  python3 -c "import ast; ast.parse(open('comfyapp.py').read()); print('OK')"
  ```
- [ ] All `_link()` calls have correct HuggingFace repository IDs and file paths
- [ ] New model subdirectories are added to the `mkdir` loop (lines 45–47) if needed
- [ ] Symlink subdirectory entries (`wan22_entries`, lines 145–151) are updated for any new WanAnimate/Bernini models
- [ ] New custom nodes include `pip install -r requirements.txt` only if they have dependencies
- [ ] GPU type, memory, and timeout values are appropriate for the intended workflows
- [ ] `max_inputs` concurrency does not exceed available GPU memory (see VRAM table in section 6)

### Model coverage

- [ ] Workflow model references are cross-referenced against the download set
  ```bash
  # Quick check: list all model files mentioned in workflow JSONs
  python3 -c "
  import json, glob
  models = set()
  for f in sorted(glob.glob('workflows/*.json')):
      with open(f) as fp:
          data = json.load(fp)
      for n in data.get('nodes', []):
          for v in n.get('widgets_values', []):
              if isinstance(v, str) and ('.safetensors' in v or '.gguf' in v or '.onnx' in v):
                  models.add(v.split('/')[-1].split('\\\\')[-1])
  for m in sorted(models):
      print(f'  {m}')
  "
  ```
- [ ] Any missing models (not in `download_models()`) are documented or added
- [ ] Workflow files are valid JSON
  ```bash
  python3 -c "
  import json, glob
  for f in sorted(glob.glob('workflows/*.json')):
      try:
          with open(f) as fp:
              json.load(fp)
          print(f'{f}: OK')
      except json.JSONDecodeError as e:
          print(f'{f}: FAIL - {e}')
  "
  ```

### Testing

- [ ] `modal run comfyapp.py` completes without `FAIL:` lines
  ```bash
  modal run comfyapp.py 2>&1 | grep -E '^(FAIL|===)'
  ```
- [ ] `modal serve comfyapp.py` starts and the ComfyUI web interface loads
  ```bash
  modal serve comfyapp.py
  # Wait for "STARTUP" message, then open the URL in a browser
  # Press Ctrl+C to stop
  ```
- [ ] At least one workflow from `workflows/` loads without missing node errors
- [ ] The deployed endpoint is reachable: `modal deploy comfyapp.py` succeeds
- [ ] Volume caching works: a second deployment skips model downloads

### Post-deploy

- [ ] Modal dashboard shows the app running with no invocation errors
- [ ] Workflow runs produce expected output (video frames/animation)
- [ ] Output files can be downloaded from the ComfyUI interface before the container idles out
