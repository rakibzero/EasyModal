import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join as joinPath } from 'node:path';
import { resolveNodes, resolveModels, type NodeClone, type PackModel } from './packs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMFY_TEMPLATE = joinPath(__dirname, '..', '..', 'templates', 'comfyapp.py.tpl');
const AITOOLKIT_TEMPLATE = joinPath(__dirname, '..', '..', 'templates', 'aitoolkit_app.py.tpl');
const AITOOLKIT_CONFIGS = joinPath(__dirname, '..', '..', 'templates', 'aitoolkit-config');
const WORKFLOWS_ROOT = joinPath(__dirname, '..', '..', 'workflows');

export interface DeployConfig {
  /** Which app to deploy — picks the template. Default 'comfyui'. */
  target?: 'comfyui' | 'ai-toolkit';
  appName: string;
  gpu: string;
  maxInputs: number;
  timeoutSeconds: number;
  memoryMb: number;
  cpu: number;
  /** Selected workflow pack ids. Always includes 'wan22'. ComfyUI only. */
  packs?: string[];
}

export const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  target: 'comfyui',
  appName: 'easymodal',
  gpu: 'A100-80GB',
  maxInputs: 2, // safe default — single Wan2.2 inference uses 30-50GB VRAM
  timeoutSeconds: 1800,
  memoryMb: 32768,
  cpu: 8,
  packs: ['wan22'],
};

const CN = '/root/comfy/ComfyUI/custom_nodes';

/** Render the git-clone + pip-install chain for the given nodes. */
function renderNodeClones(nodes: NodeClone[]): string {
  return nodes
    .map((n) => {
      const name = n.url.split('/').slice(-1)[0];
      const req = n.hasRequirements
        ? ` && cd ${name} && pip install -r ${n.requirementsFile ?? 'requirements.txt'}`
        : '';
      return `    .run_commands("cd ${CN} && git clone ${n.url}${req}")`;
    })
    .join('\n');
}

/** Render the extra MODELS entries (Python tuples) for selected packs. */
function renderExtraModels(models: PackModel[]): string {
  if (models.length === 0) return '    # (no extra pack models)';
  return models
    .map((m) => `    (${JSON.stringify(m.subdir)}, ${JSON.stringify(m.repo)}, ${JSON.stringify(m.filepath)}, ${m.required}),`)
    .join('\n');
}

/** Collect every workflow JSON under apps/server/workflows/<pack>/ for the selected packs. */
function collectWorkflows(packs: string[]): { pack: string; dir: string; file: string }[] {
  const packDirs: Record<string, string> = { wan22: 'wan22', 'image-edit': 'image-edit', upscaling: 'upscaling' };
  const out: { pack: string; dir: string; file: string }[] = [];
  for (const pack of packs) {
    const dir = packDirs[pack];
    if (!dir) continue;
    const full = joinPath(WORKFLOWS_ROOT, dir);
    if (!existsSync(full)) continue;
    for (const file of readdirSync(full)) {
      if (!file.toLowerCase().endsWith('.json')) continue;
      try {
        if (!statSync(joinPath(full, file)).isFile()) continue;
      } catch {
        continue;
      }
      out.push({ pack, dir, file });
    }
  }
  return out;
}

/**
 * Render the workflow-bundle image steps. We base64-encode each JSON and write
 * it into ComfyUI/user/default/workflows/ at build time so it shows up in
 * ComfyUI's workflow menu. (We can't ADD_CONTEXT local files in a Modal image
 * without a Dockerfile, so we inline the content.)
 */
function renderWorkflowBundle(workflows: { pack: string; dir: string; file: string }[]): string {
  const WF_DIR = '/root/comfy/ComfyUI/user/default/workflows';
  if (workflows.length === 0) {
    return `    .run_commands("mkdir -p ${WF_DIR} && echo no bundled workflows")`;
  }
  return workflows
    .map((wf) => {
      const raw = readFileSync(joinPath(WORKFLOWS_ROOT, wf.dir, wf.file));
      const b64 = raw.toString('base64');
      const safeName = wf.file.replace(/[^A-Za-z0-9._-]/g, '_');
      return `    .run_commands("mkdir -p ${WF_DIR} && echo '${b64}' | base64 -d > '${WF_DIR}/${safeName}'")`;
    })
    .join('\n');
}

/** Base64-inline every YAML config from templates/aitoolkit-config/ into the image. */
function renderAiToolkitConfigBundle(): string {
  const CFG_DIR = '/root/ai-toolkit/config';
  if (!existsSync(AITOOLKIT_CONFIGS)) {
    return `    .run_commands("mkdir -p ${CFG_DIR} && echo no bundled configs")`;
  }
  const files = readdirSync(AITOOLKIT_CONFIGS).filter((f) => /\.(ya?ml)$/i.test(f));
  if (files.length === 0) {
    return `    .run_commands("mkdir -p ${CFG_DIR} && echo no bundled configs")`;
  }
  return files
    .map((file) => {
      const raw = readFileSync(joinPath(AITOOLKIT_CONFIGS, file));
      const b64 = raw.toString('base64');
      const safeName = file.replace(/[^A-Za-z0-9._-]/g, '_');
      return `    .run_commands("mkdir -p ${CFG_DIR} && echo '${b64}' | base64 -d > '${CFG_DIR}/${safeName}'")`;
    })
    .join('\n');
}

/** Render the appropriate template for the deploy target. */
export function renderTemplate(cfg: DeployConfig): string {
  if (cfg.target === 'ai-toolkit') return renderAiToolkitTemplate(cfg);
  return renderComfyTemplate(cfg);
}

/** Render the comfyapp.py template with the given config. */
function renderComfyTemplate(cfg: DeployConfig): string {
  const packs = cfg.packs ?? ['wan22'];
  const tpl = readFileSync(COMFY_TEMPLATE, 'utf8');
  const rendered = tpl
    .replaceAll('{{APP_NAME}}', cfg.appName)
    .replaceAll('{{GPU}}', cfg.gpu)
    .replaceAll('{{MAX_INPUTS}}', String(cfg.maxInputs))
    .replaceAll('{{TIMEOUT_SECONDS}}', String(cfg.timeoutSeconds))
    .replaceAll('{{MEMORY_MB}}', String(cfg.memoryMb))
    .replaceAll('{{CPU}}', String(cfg.cpu))
    .replaceAll('{{NODE_CLONES}}', renderNodeClones(resolveNodes(packs)))
    .replaceAll('{{EXTRA_MODELS}}', renderExtraModels(resolveModels(packs)))
    .replaceAll('{{WORKFLOW_BUNDLE}}', renderWorkflowBundle(collectWorkflows(packs)));
  return rendered;
}

/** Render the aitoolkit_app.py template. Same hardware placeholders; config-bundle
 *  instead of workflow-bundle; no packs/nodes. */
function renderAiToolkitTemplate(cfg: DeployConfig): string {
  const tpl = readFileSync(AITOOLKIT_TEMPLATE, 'utf8');
  return tpl
    .replaceAll('{{APP_NAME}}', cfg.appName)
    .replaceAll('{{GPU}}', cfg.gpu)
    .replaceAll('{{MEMORY_MB}}', String(cfg.memoryMb))
    .replaceAll('{{CPU}}', String(cfg.cpu))
    .replaceAll('{{CONFIG_BUNDLE}}', renderAiToolkitConfigBundle());
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
  const workdir = mkdtempSync(join(tmpdir(), 'easymodal-deploy-'));
  const fileName = cfg.target === 'ai-toolkit' ? 'aitoolkit_app.py' : 'comfyapp.py';
  const appFile = join(workdir, fileName);
  writeFileSync(appFile, renderTemplate(cfg), { mode: 0o600 });

  const child = spawn('modal', ['deploy', fileName], {
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
