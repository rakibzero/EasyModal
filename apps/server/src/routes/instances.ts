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
  DEFAULT_DEPLOY_CONFIG,
  listApps,
  type DeployConfig,
} from '../modal/cli.js';
import { classifyLine } from '../modal/milestones.js';
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
}
