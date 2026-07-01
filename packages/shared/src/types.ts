/**
 * EasyModal — shared types
 *
 * Multi-account/multi-instance-ready schema (v1 UI is single-account, but the
 * data model supports N accounts + N instances so v2 is additive, not a rewrite).
 * See .planning/PRODUCTION-PLAN.md §5.
 */

/** A Modal account the user has connected. */
export interface Account {
  id: string;
  /** Human label, e.g. "Personal" or "Team". */
  label: string;
  modalTokenId: string;
  /** Encrypted at rest (AES-256-GCM) — never plaintext on disk. */
  modalTokenSecret: string;
  createdAt: string; // ISO 8601
}

export type InstanceStatus =
  | 'idle'
  | 'building'
  | 'downloading'
  | 'serving'
  | 'ready'
  | 'failed'
  | 'cold';

/** What gets deployed to Modal. Determines which template is rendered. */
export type DeployTarget = 'comfyui' | 'ai-toolkit';

export const DEPLOY_TARGETS: { id: DeployTarget; label: string; description: string; defaultAppName: string }[] = [
  {
    id: 'comfyui',
    label: 'ComfyUI',
    description: 'Node-based image/video generation UI (Wan2.2, SCAIL-2, image editing, upscaling).',
    defaultAppName: 'easymodal',
  },
  {
    id: 'ai-toolkit',
    label: 'AI Toolkit (LoRA Training)',
    description: 'ostris/ai-toolkit — fine-tune LoRAs for Flux/Wan/LTX video models via web UI.',
    defaultAppName: 'ai-toolkit-finetune',
  },
];

/** Deploy-time configuration injected into the bundled template. */
export interface DeployConfig {
  /** Which app to deploy — picks the template. Default 'comfyui'. */
  target?: DeployTarget;
  /** Modal GPU type, e.g. 'A100-80GB', or 'any' for no GPU. */
  gpu: string;
  /**
   * Max concurrent inputs on one container. Default 2 — a single Wan2.2
   * inference uses 30-50GB VRAM, so 50 (the old default) would OOM an A100.
   */
  maxInputs: number;
  /** Function timeout in seconds. */
  timeoutSeconds: number;
  /** Function memory in MB. */
  memoryMb: number;
  /** Function vCPUs. */
  cpu: number;
  /** Modal app name. */
  appName: string;
  /** Selected workflow packs (each adds nodes+models to the build). ComfyUI only. */
  packs?: string[];
}

/** A GPU option the user can pick in Configure. */
export interface GpuOption {
  /** Modal gpu= value, passed to the template. */
  value: string;
  label: string;
  /** VRAM in GB, for display + OOM guardrails. */
  vramGb: number;
  /** Whether this GPU can run the heavy Wan2.2 14B models. */
  heavyWorkloads: boolean;
}

export const GPU_OPTIONS: GpuOption[] = [
  { value: 'A100-80GB', label: 'A100 80GB', vramGb: 80, heavyWorkloads: true },
  { value: 'A100-40GB', label: 'A100 40GB', vramGb: 40, heavyWorkloads: false },
  { value: 'H100', label: 'H100 80GB', vramGb: 80, heavyWorkloads: true },
  { value: 'H200', label: 'H200 141GB', vramGb: 141, heavyWorkloads: true },
  { value: 'L40S', label: 'L40S 48GB', vramGb: 48, heavyWorkloads: false },
  { value: 'L4', label: 'L4 24GB', vramGb: 24, heavyWorkloads: false },
  { value: 'T4', label: 'T4 16GB', vramGb: 16, heavyWorkloads: false },
];

export const RAM_OPTIONS_GB = [8, 16, 32, 64, 128, 256];
export const CPU_OPTIONS = [2, 4, 8, 16, 32];
export const TIMEOUT_OPTIONS_MIN = [15, 30, 60, 120, 240];

/** A workflow pack the user can toggle on/off in Configure. */
export interface WorkflowPack {
  id: string;
  label: string;
  description: string;
  /** Whether this pack is on by default. */
  defaultOn: boolean;
}

export const WORKFLOW_PACKS: WorkflowPack[] = [
  {
    id: 'wan22',
    label: 'Wan2.2 Animation',
    description: 'Wan2.2 I2V, SCAIL-2, WanAnimate+ — video generation (always recommended).',
    defaultOn: true,
  },
  {
    id: 'image-edit',
    label: 'Image Editing',
    description: 'Flux, Qwen-Image-Edit, Ernie — faceswap, inpainting, NSFW edit, headwap.',
    defaultOn: false,
  },
  {
    id: 'upscaling',
    label: 'Image & Video Upscaling',
    description: 'SUPIR, SeedVR2 — high-res image and HD video upscaling.',
    defaultOn: false,
  },
];

/** A ComfyUI deployment on Modal, linked to an account. */
export interface Instance {
  id: string;
  accountId: string;
  name: string;
  status: InstanceStatus;
  /** Modal HTTPS endpoint — present once deployed & ready. */
  modalUrl?: string;
  config: DeployConfig;
  lastDeployedAt?: string; // ISO 8601
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

/** Human-readable deploy milestones derived from raw Modal log lines. */
export type Milestone =
  | 'image-building'
  | 'models-downloading'
  | 'comfyui-starting'
  | 'url-ready'
  | 'failed';

/** A single log/event entry streamed to the UI over SSE. */
export interface LogEvent {
  timestamp: string; // ISO 8601
  level: LogLevel;
  message: string;
  milestone?: Milestone;
  instanceId?: string;
}
