/**
 * Workflow pack definitions — each pack adds custom nodes (git clones) and
 * optional extra models to the Modal image build, on top of the core Wan2.2 set.
 *
 * `core` nodes are always installed (the baseline ComfyUI + Wan2.2 toolchain).
 * Pack nodes are only installed when the user enables that pack in Configure.
 *
 * `models` are appended to the template's MODELS list — same (subdir, repo,
 * filepath, required) tuple shape. They're optional unless marked required.
 */

export interface NodeClone {
  /** GitHub URL to clone. */
  url: string;
  /** Whether the cloned node has a requirements.txt to pip-install. */
  hasRequirements: boolean;
  /** Optional: pip requirement file name (defaults to requirements.txt). */
  requirementsFile?: string;
}

export interface PackModel {
  subdir: string;
  repo: string;
  filepath: string;
  required: boolean;
}

export interface WorkflowPackDef {
  nodes: NodeClone[];
  models: PackModel[];
}

/** Core nodes — always installed regardless of pack selection. */
export const CORE_NODES: NodeClone[] = [
  { url: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite', hasRequirements: true },
  { url: 'https://github.com/Kijai/ComfyUI-WanVideoWrapper', hasRequirements: true },
  { url: 'https://github.com/kijai/ComfyUI-KJNodes', hasRequirements: true },
  { url: 'https://github.com/pythongosssss/ComfyUI-Custom-Scripts', hasRequirements: false },
  { url: 'https://github.com/rgthree/rgthree-comfy', hasRequirements: true },
  { url: 'https://github.com/cubiq/ComfyUI_Essentials', hasRequirements: true },
  { url: 'https://github.com/WASasquatch/was-node-suite-comfyui', hasRequirements: true },
  { url: 'https://github.com/chrisgoringe/cg-use-everywhere', hasRequirements: false },
  { url: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation', hasRequirements: true, requirementsFile: 'requirements-no-cupy.txt' },
  { url: 'https://github.com/1038lab/ComfyUI-RMBG', hasRequirements: true },
  { url: 'https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch', hasRequirements: false },
  { url: 'https://github.com/fofr/ComfyUI-fofr-toolkit', hasRequirements: false },
  { url: 'https://github.com/jags111/efficiency-nodes-comfyui', hasRequirements: true },
  { url: 'https://github.com/kk8bit/KayTool', hasRequirements: true },
  { url: 'https://github.com/wuwukaka/ComfyUI-WanAnimatePlus', hasRequirements: true },
  { url: 'https://github.com/kijai/ComfyUI-WanAnimatePreprocess', hasRequirements: true },
  { url: 'https://github.com/kijai/ComfyUI-SCAIL-Pose', hasRequirements: true },
  { url: 'https://github.com/llikethat/comfyui-scail2', hasRequirements: false },
  { url: 'https://github.com/wuwukaka/ComfyUI-SDPose-OOD', hasRequirements: true },
  { url: 'https://github.com/aining2022/ComfyUI_Swwan', hasRequirements: true },
  { url: 'https://github.com/kijai/ComfyUI-segment-anything-2', hasRequirements: false },
  { url: 'https://github.com/city96/ComfyUI-GGUF', hasRequirements: false },
  { url: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack', hasRequirements: true },
  { url: 'https://github.com/ltdrdata/ComfyUI-Manager', hasRequirements: false },
  { url: 'https://github.com/civitai/civitai-comfy-nodes', hasRequirements: true },
];

/** Pack-specific nodes + models. */
export const PACKS: Record<string, WorkflowPackDef> = {
  // wan22 core models are already in the template MODELS list; no extra nodes.
  wan22: { nodes: [], models: [] },

  'image-edit': {
    nodes: [
      // Flux, Qwen-Image-Edit, Ernie, faceswap toolkits.
      { url: 'https://github.com/kijai/ComfyUI-FluxTrainer', hasRequirements: false },
      { url: 'https://github.com/city96/ComfyUI-GGUF', hasRequirements: false },
      { url: 'https://github.com/kijai/ComfyUI-QwenImage', hasRequirements: true },
      { url: 'https://github.com/ZHO6199/comfyui-ernie', hasRequirements: false },
      { url: 'https://github.com/AIFSH/ComfyUI-FLUX.1-Tools', hasRequirements: true },
      { url: 'https://github.com/shadowcz007/comfyui-mixlab-nodes', hasRequirements: true },
      { url: 'https://github.com/Bingsu/adetailer', hasRequirements: false },
    ],
    models: [
      // Flux dev (fp8) for faceswap / image-edit workflows.
      { subdir: 'checkpoints', repo: 'Comfy-Org/flux1-dev', filepath: 'flux1-dev-fp8.safetensors', required: false },
      // Qwen-Image-Edit GGUF.
      { subdir: 'unet', repo: 'comfyanonymous/Qwen-Image-Edit-GGUF', filepath: 'Qwen-Image-Edit-Q8_0.gguf', required: false },
      // Ernie reference.
      { subdir: 'diffusion_models', repo: 'Comfy-Org/ernie', filepath: 'ernie_v1.safetensors', required: false },
    ],
  },

  upscaling: {
    nodes: [
      { url: 'https://github.com/kijai/ComfyUI-SUPIR', hasRequirements: true },
      { url: 'https://github.com/kijai/ComfyUI-seedVR', hasRequirements: true },
      { url: 'https://github.com/KiterUN/ComfyUI-SUPIR-Wrapper', hasRequirements: true },
    ],
    models: [
      // SUPIR vision + sd model.
      { subdir: 'upscale_models', repo: 'camenduru/SUPIR', filepath: 'SUPIR-v0Q.ckpt', required: false },
      { subdir: 'upscale_models', repo: 'camenduru/SUPIR', filepath: 'SUPIR-v0F.ckpt', required: false },
      // SeedVR2 weights (commonly hosted).
      { subdir: 'upscale_models', repo: 'comfyanonymous/seedvr2', filepath: 'seedvr2_fp16.safetensors', required: false },
    ],
  },
};

/** Resolve the combined node-clone list for a set of selected packs. */
export function resolveNodes(packs: string[]): NodeClone[] {
  const out = [...CORE_NODES];
  const seen = new Set(out.map((n) => n.url));
  for (const id of packs) {
    const def = PACKS[id];
    if (!def) continue;
    for (const n of def.nodes) {
      if (!seen.has(n.url)) {
        seen.add(n.url);
        out.push(n);
      }
    }
  }
  return out;
}

/** Resolve the combined extra-model list for a set of selected packs. */
export function resolveModels(packs: string[]): PackModel[] {
  const out: PackModel[] = [];
  for (const id of packs) {
    const def = PACKS[id];
    if (!def) continue;
    out.push(...def.models);
  }
  return out;
}
