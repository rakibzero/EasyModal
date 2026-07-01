import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getAccount } from '../repo/configStore.js';
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
import { activateAccountProfile } from '../accounts/modal.js';
import { bus } from '../events/bus.js';
import type { InstanceStatus, Milestone } from '@wan22/shared';

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

    const cfg: DeployConfig = { ...DEFAULT_DEPLOY_CONFIG, ...config };

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
            const urlMatch = message.match(/https?:\/\/\S+/);
            if (urlMatch) inst.url = urlMatch[0];
          }
          if (milestone === 'failed') inst.lastError = message;
          upsertPersistedInstance(inst);
        }
      },
      onStderr: (line) => {
        bus.info(`[stderr] ${line}`, { level: 'warn', instanceId: inst.id });
        if (/error|failed|exception/i.test(line)) {
          inst.status = 'failed';
          inst.lastError = line;
          upsertPersistedInstance(inst);
        }
      },
      onExit: (code) => {
        if (code === 0) {
          if (inst.status !== 'failed') inst.status = inst.url ? 'ready' : 'serving';
          if (!inst.url) {
            inst.url = `https://${cfg.appName}-ui.modal.run`;
          }
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

    const cfg: DeployConfig = {
      appName: inst.config.appName,
      gpu: DEFAULT_DEPLOY_CONFIG.gpu,
      maxInputs: inst.config.maxInputs,
      timeoutSeconds: inst.config.timeoutSeconds,
      memoryMb: inst.config.memoryMb,
      cpu: inst.config.cpu,
      packs: (inst.config as { packs?: string[] }).packs ?? ['wan22'],
    };

    // Write the template + a one-off caller into a temp dir and run modal.
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { spawn } = await import('node:child_process');
    const workdir = mkdtempSync(join(tmpdir(), 'wan22-reset-'));
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

    return new Promise((resolve) => {
      const child = spawn('modal', ['run', 'run_reset.py'], { cwd: workdir, env: process.env });
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
}
