import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as joinPath } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = joinPath(__dirname, '..', '..', 'templates', 'comfyapp.py.tpl');

export interface DeployConfig {
  appName: string;
  gpu: string;
  maxInputs: number;
  timeoutSeconds: number;
  memoryMb: number;
  cpu: number;
}

export const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  appName: 'wan22-animate',
  gpu: 'A100-80GB',
  maxInputs: 2, // safe default — single Wan2.2 inference uses 30-50GB VRAM
  timeoutSeconds: 1800,
  memoryMb: 32768,
  cpu: 8,
};

/** Render the comfyapp.py template with the given config. */
export function renderTemplate(cfg: DeployConfig): string {
  const tpl = readFileSync(TEMPLATE_PATH, 'utf8');
  return tpl
    .replaceAll('{{APP_NAME}}', cfg.appName)
    .replaceAll('{{GPU}}', cfg.gpu)
    .replaceAll('{{MAX_INPUTS}}', String(cfg.maxInputs))
    .replaceAll('{{TIMEOUT_SECONDS}}', String(cfg.timeoutSeconds))
    .replaceAll('{{MEMORY_MB}}', String(cfg.memoryMb))
    .replaceAll('{{CPU}}', String(cfg.cpu));
}

export interface DeployCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number | null) => void;
}

/**
 * Render the template to a temp dir and run `modal deploy` there, streaming
 * stdout/stderr line-by-line. Resolves with the exit code.
 */
export function deployRenderedTemplate(cfg: DeployConfig, cb: DeployCallbacks): ChildProcess {
  const workdir = mkdtempSync(join(tmpdir(), 'wan22-deploy-'));
  const appFile = join(workdir, 'comfyapp.py');
  writeFileSync(appFile, renderTemplate(cfg), { mode: 0o600 });

  const child = spawn('modal', ['deploy', 'comfyapp.py'], {
    cwd: workdir,
    env: process.env,
  });

  const splitLines = (chunk: Buffer, fn: (line: string) => void) => {
    chunk
      .toString('utf8')
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .forEach((line) => line.trim() && fn(line));
  };

  child.stdout?.on('data', (chunk: Buffer) => splitLines(chunk, cb.onStdout));
  child.stderr?.on('data', (chunk: Buffer) => splitLines(chunk, cb.onStderr));
  child.on('exit', (code) => {
    cb.onExit(code);
    // Clean up the temp dir after the deploy finishes.
    rmSync(workdir, { recursive: true, force: true });
  });

  return child;
}

/** Run `modal app list` and return raw output (parsed by caller). */
export async function listApps(): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const child = spawn('modal', ['app', 'list'], { env: process.env });
    child.stdout?.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.stderr?.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}
