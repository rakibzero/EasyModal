/**
 * Wan2.2Animate Deploy — shared types
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

/** Deploy-time configuration injected into the bundled comfyapp.py template. */
export interface DeployConfig {
  /** Modal GPU type, e.g. 'A100-80GB'. */
  gpu: string;
  /**
   * Max concurrent inputs on one container. Default 2 — a single Wan2.2
   * inference uses 30-50GB VRAM, so 50 (the old default) would OOM an A100.
   */
  maxInputs: number;
  /** Function timeout in seconds. */
  timeoutSeconds: number;
  /** Modal app name. */
  appName: string;
}

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
