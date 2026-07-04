import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  getAccount,
  setActiveAccount,
  getAiToolkitAuthToken,
  setAiToolkitAuthToken,
} from '../repo/configStore.js';
import {
  listPersistedInstances,
  upsertPersistedInstance,
  removePersistedInstance,
  getPersistedInstance,
  type PersistedInstance,
} from '../repo/instances.js';
import {
  deployRenderedTemplate,
  renderTemplate,
  DEFAULT_DEPLOY_CONFIG,
  listApps,
  type DeployConfig,
} from '../modal/cli.js';
import { classifyLine } from '../modal/milestones.js';
import { activateAccountProfile, verifyHuggingFaceSecret } from '../accounts/modal.js';
import { modalEnv } from '../modal/env.js';
import { bus } from '../events/bus.js';
import type { InstanceStatus, Milestone } from '@easymodal/shared';

interface InstanceRecord extends PersistedInstance {}

interface DeployBody {
  accountId: string;
  config?: Partial<DeployConfig>;
}

const MILESTONE_TO_STATUS: Record<Milestone, InstanceStatus> = {
  'image-building': 'building',
  'models-downloading': 'downloading',
  'comfyui-starting': 'serving',
  'url-ready': 'ready',
  failed: 'failed',
};

/** In-memory mirror of persisted instances (for live status updates during deploy). */
const liveInstances = new Map<string, InstanceRecord>();

function loadAll(): InstanceRecord[] {
  const persisted = listPersistedInstances();
  for (const p of persisted) {
    if (!liveInstances.has(p.id)) liveInstances.set(p.id, p);
  }
  return [...liveInstances.values()];
}

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/instances', async () => ({ instances: loadAll() }));

  app.get('/api/instances/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = liveInstances.get(id) ?? getPersistedInstance(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });
    return inst;
  });

  /** Deploy: render template, run `modal deploy`, stream milestones, persist state. */
  app.post('/api/instances/deploy', async (req, reply) => {
    const { accountId, config } = (req.body ?? {}) as DeployBody;
    if (!accountId) return reply.code(400).send({ ok: false, message: 'accountId is required.' });
    const account = getAccount(accountId);
    if (!account) {
      return reply.code(404).send({ ok: false, message: 'Account not found. Add it in Keys first.' });
    }

    const cfg: DeployConfig = { ...DEFAULT_DEPLOY_CONFIG, ...config, accountId };

    // Activate this account's Modal profile so the deploy targets the right account.
    bus.info(`Activating Modal profile for "${account.label}"…`, { instanceId: undefined });
    try {
      await activateAccountProfile(account.id, account.modalTokenId, account.modalTokenSecret);
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        message: `Could not activate Modal account: ${String((e as Error).message || e).slice(0, 200)}`,
      });
    }

    // Pre-flight: confirm the HF secret exists on THIS account. Without it,
    // model downloads silently fall back to anonymous HF and hang/fail mid-build.
    const hfCheck = await verifyHuggingFaceSecret();
    if (!hfCheck.ok) {
      return reply.code(400).send({ ok: false, message: hfCheck.message });
    }

    // AI Toolkit needs an extra auth secret (its web UI gates on AI_TOOLKIT_AUTH).
    // Reuse the per-account persisted token if present so ModHeader config is
    // stable across redeploys; otherwise mint + persist a new one.
    if (cfg.target === 'ai-toolkit') {
      const { ensureAiToolkitAuthSecret } = await import('../accounts/modal.js');
      const existingToken = getAiToolkitAuthToken(account.id);
      const authRes = await ensureAiToolkitAuthSecret(existingToken);
      if (!authRes.ok) {
        return reply.code(400).send({ ok: false, message: authRes.message });
      }
      if (!existingToken) setAiToolkitAuthToken(account.id, authRes.token);
      bus.info(`AI Toolkit auth secret ready. Your UI access token: ${authRes.token}`, {
        instanceId: undefined,
      });
    }
    const inst: InstanceRecord = {
      id: randomUUID(),
      accountId,
      name: cfg.appName,
      status: 'building',
      config: cfg,
      lastDeployedAt: new Date().toISOString(),
    };
    liveInstances.set(inst.id, inst);
    upsertPersistedInstance(inst);

    bus.info(`Starting deploy of "${cfg.appName}" (${cfg.gpu}, max ${cfg.maxInputs})…`, {
      instanceId: inst.id,
    });

    deployRenderedTemplate(cfg, {
      onStdout: (line) => {
        const { milestone, message } = classifyLine(line);
        const level = milestone === 'failed' ? 'error' : 'info';
        bus.info(message, { level, milestone, instanceId: inst.id });
        if (milestone) {
          const newStatus = MILESTONE_TO_STATUS[milestone];
          if (newStatus && newStatus !== inst.status) inst.status = newStatus;
          if (milestone === 'url-ready') {
            // Strip trailing punctuation (trailing period/comma/colon from log line).
            const urlMatch = message.match(/https?:\/\/[^\s)<>\]\}]+/);
            if (urlMatch) inst.url = urlMatch[0].replace(/[.,;:!?)]+$/, '');
          }
          if (milestone === 'failed') inst.lastError = message;
          upsertPersistedInstance(inst);
        }
      },
      onStderr: (line) => {
        // Surface stderr as warnings, but do NOT flip status to 'failed' on text
        // matching alone. Pip/Python/comfy print benign lines containing "error"
        // (e.g. "0 errors", deprecation warnings) — treating those as failure
        // marked successful deploys as failed. Authoritative failure = exit code.
        bus.info(`[stderr] ${line}`, { level: 'warn', instanceId: inst.id });
      },
      onExit: (code) => {
        if (code === 0) {
          if (inst.status !== 'failed') inst.status = inst.url ? 'ready' : 'serving';
          bus.info(`Deploy finished successfully.`, {
            level: 'success',
            milestone: 'url-ready',
            instanceId: inst.id,
          });
        } else {
          inst.status = 'failed';
          inst.lastError = inst.lastError || `modal deploy exited with code ${code}`;
          bus.info(`Deploy failed (exit ${code}): ${inst.lastError}`, {
            level: 'error',
            milestone: 'failed',
            instanceId: inst.id,
          });
        }
        upsertPersistedInstance(inst);
      },
    });

    return reply.code(202).send({ ok: true, instanceId: inst.id, status: inst.status });
  });

  /** Refresh status by polling `modal app list`. */
  app.post('/api/instances/:id/refresh', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = liveInstances.get(id) ?? getPersistedInstance(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });

    try {
      const out = await listApps();
      const appName = inst.config.appName;
      const isDeployed = new RegExp(`${appName}`, 'i').test(out);
      // `modal app list` shows deployed apps; a present app is "cold" or "live".
      if (inst.status === 'failed') {
        /* keep failed */
      } else if (isDeployed) {
        inst.status = 'ready';
      } else {
        inst.status = 'idle';
      }
      upsertPersistedInstance(inst);
      return { ok: true, status: inst.status };
    } catch (e) {
      return reply.code(500).send({
        ok: false,
        message: `Could not check Modal status: ${String((e as Error).message || e).slice(0, 150)}`,
      });
    }
  });

  app.delete('/api/instances/:id', async (req) => {
    const { id } = req.params as { id: string };
    liveInstances.delete(id);
    const removed = removePersistedInstance(id);
    return { ok: removed };
  });

  /**
   * Reset custom_nodes: wipe Manager-installed nodes back to the image baseline.
   * Renders the instance's template (so the reset_custom_nodes function exists),
   * then runs a tiny script that looks up the deployed app and invokes it remotely.
   */
  app.post('/api/instances/:id/reset-nodes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = liveInstances.get(id) ?? getPersistedInstance(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });

    // reset_custom_nodes is a ComfyUI-only concept (Manager-installed nodes).
    // AI Toolkit has no custom_nodes, so this operation is not applicable.
    const target = inst.config.target ?? 'comfyui';
    if (target === 'ai-toolkit') {
      return reply.code(400).send({
        ok: false,
        message: 'Reset custom_nodes is a ComfyUI-only operation. This is an AI Toolkit instance.',
      });
    }

    // Rebuild the FULL stored config (target + accountId + packs) so the
    // rendered template matches the deployed one — otherwise the volume name
    // wouldn't match and reset would target a different volume than the app.
    const cfg: DeployConfig = { ...inst.config, accountId: inst.accountId };

    const account = getAccount(inst.accountId);
    if (!account) {
      return reply.code(404).send({ ok: false, message: 'Account for this instance no longer exists.' });
    }

    // Write the template + a one-off caller into a temp dir and run modal.
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { spawn } = await import('node:child_process');
    const workdir = mkdtempSync(join(tmpdir(), 'easymodal-reset-'));
    writeFileSync(join(workdir, 'comfyapp.py'), renderTemplate(cfg), { mode: 0o600 });
    writeFileSync(
      join(workdir, 'run_reset.py'),
      `import modal\n` +
        `app = modal.App.lookup("${inst.config.appName}", create_if_missing=False)\n` +
        `if app is None:\n` +
        `    print("APP_NOT_FOUND")\n` +
        `else:\n` +
        `    from comfyapp import reset_custom_nodes\n` +
        `    print(reset_custom_nodes.remote())\n`,
      { mode: 0o600 },
    );

    bus.info(`Resetting custom_nodes for "${inst.config.appName}"…`, { instanceId: inst.id });

    // Set this account's Modal token first so the modal run targets the right account.
    try {
      await activateAccountProfile(inst.accountId, account.modalTokenId, account.modalTokenSecret);
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        message: `Could not activate account: ${String((e as Error).message || e).slice(0, 200)}`,
      });
    }

    return new Promise((resolve) => {
      const child = spawn('modal', ['run', 'run_reset.py'], { cwd: workdir, env: modalEnv() });
      let out = '';
      child.stdout?.on('data', (c: Buffer) => (out += c.toString('utf8')));
      child.stderr?.on('data', (c: Buffer) => (out += c.toString('utf8')));
      child.on('exit', (code) => {
        rmSync(workdir, { recursive: true, force: true });
        if (out.includes('APP_NOT_FOUND')) {
          bus.info('Reset skipped — app not deployed yet.', { level: 'warn', instanceId: inst.id });
          resolve(reply.code(404).send({ ok: false, message: 'App not deployed yet — deploy first.' }));
        } else if (code === 0) {
          bus.info('custom_nodes reset to baseline. Reinstall what you need in ComfyUI Manager.', {
            level: 'success',
            instanceId: inst.id,
          });
          resolve({ ok: true, output: out.slice(-500) });
        } else {
          bus.info(`Reset failed (exit ${code}).`, { level: 'error', instanceId: inst.id });
          resolve(reply.code(500).send({ ok: false, message: out.slice(-300) }));
        }
      });
    });
  });

  /**
   * Download a single HF model file into models/<subdir>/ on the instance's
   * volume. Renders the instance's template (so download_model exists), writes
   * a one-off caller, and runs `modal run`. Progress streams over SSE.
   *
   * Body: { repo: string, filepath: string, subdir: string }
   *   repo      — HF repo id ("user/model") OR a full hf.co URL (parsed).
   *   filepath  — file path within the repo (e.g. "flux1-dev-fp8.safetensors"
   *               or "split_files/vae/wan2.1_vae.safetensors").
   *   subdir    — which models/ subdir it lands in (whitelisted in the template).
   */
  app.post('/api/instances/:id/download-model', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = liveInstances.get(id) ?? getPersistedInstance(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });

    // download_model is ComfyUI-only (lives in comfyapp.py.tpl). AI Toolkit has
    // its own HF cache layout under /data/hf-cache and a different downloader.
    const target = inst.config.target ?? 'comfyui';
    if (target === 'ai-toolkit') {
      return reply.code(400).send({
        ok: false,
        message: 'Manual model download is a ComfyUI-only feature for now. This is an AI Toolkit instance.',
      });
    }

    const body = (req.body ?? {}) as { repo?: string; filepath?: string; subdir?: string };
    const rawRepo = (body.repo ?? '').trim();
    const filepath = (body.filepath ?? '').trim();
    // Normalize subdir: strip whitespace, lowercase, drop any trailing slash
    // so "Checkpoints/" from a sloppy client becomes "checkpoints".
    const subdir = (body.subdir ?? '').trim().toLowerCase().replace(/\/+$/, '');
    if (!rawRepo || !filepath || !subdir) {
      return reply.code(400).send({ ok: false, message: 'repo, filepath, and subdir are all required.' });
    }

    // Parse the repo input — accept "user/model", "user/model:filename",
    // https://huggingface.co/user/model/resolve/main/path, or hf.co URLs.
    let repo = rawRepo;
    let fileFromUrl = '';
    // Match hf.co URLs — escape every / inside the regex so tsc doesn't read it
    // as the regex terminator. [^/]+ becomes [^\/]+.
    const urlMatch = rawRepo.match(/^https?:\/\/(?:www\.)?(?:huggingface\.co|hf\.co)\/([^\/]+\/[^\/]+)(?:\/.*)?$/);
    if (urlMatch) {
      repo = urlMatch[1];
      // /resolve/main/<path> or /blob/main/<path>
      const pathMatch = rawRepo.match(/\/(?:resolve|blob)\/[^\/]+\/(.+)$/);
      if (pathMatch) fileFromUrl = pathMatch[1];
    } else {
      // "user/model:filename" shorthand
      const colonMatch = rawRepo.match(/^([^\/]+\/[^\/:]+):(.+)$/);
      if (colonMatch) {
        repo = colonMatch[1];
        fileFromUrl = colonMatch[2];
      }
    }
    const finalFile = filepath || fileFromUrl;
    if (!finalFile) {
      return reply.code(400).send({ ok: false, message: 'Could not determine the file path. Pass filepath explicitly.' });
    }

    // Reuse the instance's stored config so the volume name matches the app.
    const cfg: DeployConfig = { ...inst.config, accountId: inst.accountId };

    const account = getAccount(inst.accountId);
    if (!account) {
      return reply.code(404).send({ ok: false, message: 'Account for this instance no longer exists.' });
    }

    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { spawn } = await import('node:child_process');
    const workdir = mkdtempSync(join(tmpdir(), 'easymodal-dlmodel-'));
    writeFileSync(join(workdir, 'comfyapp.py'), renderTemplate(cfg), { mode: 0o600 });
    // Embed args as a JSON literal to avoid shell-escaping pitfalls with paths
    // that contain spaces, quotes, or unicode. Read on stdin in the runner.
    const argsJson = JSON.stringify({ repo, filepath: finalFile, subdir });
    writeFileSync(
      join(workdir, 'run_dlmodel.py'),
      `import json, sys, modal\n` +
        `args = json.loads(sys.stdin.read())\n` +
        `app = modal.App.lookup("${inst.config.appName}", create_if_missing=False)\n` +
        `if app is None:\n` +
        `    print("APP_NOT_FOUND")\n` +
        `else:\n` +
        `    from comfyapp import download_model\n` +
        `    print(download_model.remote(args["repo"], args["filepath"], args["subdir"]))\n`,
      { mode: 0o600 },
    );

    bus.info(
      `Downloading model ${repo}/${finalFile} -> models/${subdir}/ on "${inst.config.appName}"…`,
      { instanceId: inst.id },
    );

    try {
      await activateAccountProfile(inst.accountId, account.modalTokenId, account.modalTokenSecret);
    } catch (e) {
      rmSync(workdir, { recursive: true, force: true });
      return reply.code(400).send({
        ok: false,
        message: `Could not activate account: ${String((e as Error).message || e).slice(0, 200)}`,
      });
    }

    return new Promise((resolve) => {
      // Pass args via stdin (cleaner than argv for paths with spaces/quotes).
      const child = spawn('modal', ['run', 'run_dlmodel.py'], {
        cwd: workdir,
        env: modalEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdin?.end(argsJson);
      let out = '';
      child.stdout?.on('data', (c: Buffer) => (out += c.toString('utf8')));
      child.stderr?.on('data', (c: Buffer) => (out += c.toString('utf8')));
      child.on('exit', (code) => {
        rmSync(workdir, { recursive: true, force: true });
        if (out.includes('APP_NOT_FOUND')) {
          bus.info('Model download skipped — app not deployed. Deploy first.', {
            level: 'warn',
            instanceId: inst.id,
          });
          resolve(reply.code(404).send({ ok: false, message: 'App not deployed yet — deploy first.' }));
        } else if (code === 0) {
          bus.info(`Model saved to models/${subdir}/${finalFile.split('/').pop()}.`, {
            level: 'success',
            instanceId: inst.id,
          });
          resolve({ ok: true, output: out.slice(-500) });
        } else {
          bus.info(`Model download failed (exit ${code}).`, { level: 'error', instanceId: inst.id });
          resolve(reply.code(500).send({ ok: false, message: out.slice(-400) }));
        }
      });
    });
  });

  /**
   * Switch account for this instance: just swap which Modal account/token the
   * instance is bound to. No volume wipe is needed — each account has its own
   * isolated volume (wan-models-{accountId} / ai-toolkit-{accountId}), so the
   * new account's next deploy targets a fresh volume with zero bleed from the
   * previous account's nodes/outputs/uploads.
   *
   * Works for both ComfyUI and AI Toolkit (no per-template function call needed
   * — the wipe was the only target-specific part, and it's gone).
   */
  app.post('/api/instances/:id/switch-account', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { accountId: newAccountId } = (req.body ?? {}) as { accountId?: string };
    const inst = liveInstances.get(id) ?? getPersistedInstance(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });
    if (!newAccountId) return reply.code(400).send({ ok: false, message: 'accountId is required.' });
    const newAccount = getAccount(newAccountId);
    if (!newAccount) return reply.code(404).send({ ok: false, message: 'New account not found.' });

    // Activate the new account's Modal token (validates it + targets future deploys).
    try {
      await activateAccountProfile(newAccountId, newAccount.modalTokenId, newAccount.modalTokenSecret);
    } catch (e) {
      return reply.code(400).send({
        ok: false,
        message: `Could not activate new account: ${String((e as Error).message || e).slice(0, 200)}`,
      });
    }

    // Rebind the instance to the new account. The stored config carries the
    // accountId, so the next deploy/reset renders a template whose volume name
    // matches the new account — no manual wipe, no cross-account data leak.
    setActiveAccount(newAccountId);
    inst.accountId = newAccountId;
    upsertPersistedInstance(inst);
    bus.info(`Switched to "${newAccount.label}". Next deploy targets its own isolated volume.`, {
      level: 'success',
      instanceId: inst.id,
    });
    return { ok: true, message: `Switched to ${newAccount.label}.` };
  });
}
