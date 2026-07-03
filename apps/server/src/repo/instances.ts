import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstanceStatus, DeployConfig } from '@easymodal/shared';

/**
 * Persisted instance registry — survives app restarts (resumable).
 * Lives alongside the account config in the user's ~/.easymodal/ dir.
 */
const DATA_DIR = process.env.EASYMODAL_CONFIG_DIR || join(homedir(), '.easymodal');
const INSTANCES_FILE = join(DATA_DIR, 'instances.json');

export interface PersistedInstance {
  id: string;
  accountId: string;
  name: string;
  status: InstanceStatus;
  /** Full deploy config so reset/switch can rebuild the template exactly. */
  config: DeployConfig;
  url?: string;
  lastDeployedAt?: string;
  lastError?: string;
}

interface InstancesShape {
  instances: PersistedInstance[];
}

function readAll(): PersistedInstance[] {
  try {
    if (!existsSync(INSTANCES_FILE)) return [];
    const raw = readFileSync(INSTANCES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as InstancesShape;
    return Array.isArray(parsed.instances) ? parsed.instances : [];
  } catch {
    return [];
  }
}

function writeAll(list: PersistedInstance[]): void {
  writeFileSync(INSTANCES_FILE, JSON.stringify({ instances: list }, null, 2), { mode: 0o600 });
}

export function listPersistedInstances(): PersistedInstance[] {
  return readAll();
}

export function getPersistedInstance(id: string): PersistedInstance | undefined {
  return readAll().find((i) => i.id === id);
}

export function upsertPersistedInstance(inst: PersistedInstance): void {
  const list = readAll();
  const idx = list.findIndex((i) => i.id === inst.id);
  if (idx >= 0) list[idx] = inst;
  else list.push(inst);
  writeAll(list);
}

export function removePersistedInstance(id: string): boolean {
  const list = readAll();
  const next = list.filter((i) => i.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}
