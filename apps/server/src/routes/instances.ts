import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getAccount } from '../repo/configStore.js';
import {
  deployRenderedTemplate,
  DEFAULT_DEPLOY_CONFIG,
  type DeployConfig,
} from '../modal/cli.js';
import { classifyLine } from '../modal/milestones.js';
import { bus } from '../events/bus.js';
import type { InstanceStatus, Milestone } from '@wan22/shared';

/** In-memory instance registry (Phase 6 will persist this to disk). */
interface InstanceRecord {
  id: string;
  accountId: string;
  name: string;
  status: InstanceStatus;
  config: DeployConfig;
  url?: string;
  lastDeployedAt?: string;
  lastError?: string;
}

const instances = new Map<string, InstanceRecord>();

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

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/instances', async () => {
    return { instances: [...instances.values()] };
  });

  app.get('/api/instances/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = instances.get(id);
    if (!inst) return reply.code(404).send({ ok: false, message: 'Instance not found.' });
    return inst;
  });

  /** Deploy: render template, run `modal deploy`, stream milestones over SSE. */
  app.post('/api/instances/deploy', async (req, reply) => {
    const { accountId, config } = (req.body ?? {}) as DeployBody;
    if (!accountId) {
      return reply.code(400).send({ ok: false, message: 'accountId is required.' });
    }
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
    instances.set(inst.id, inst);

    const instShort = inst.id.slice(0, 8);
    bus.info(`Starting deploy of "${cfg.appName}" (${cfg.gpu}, max ${cfg.maxInputs})…`, {
      instanceId: inst.id,
    });

    // Run the deploy asynchronously so we can return the instance id immediately.
    deployRenderedTemplate(cfg, {
      onStdout: (line) => {
        const { milestone, message } = classifyLine(line);
        const level = milestone === 'failed' ? 'error' : 'info';
        bus.info(message, { level, milestone, instanceId: inst.id });
        if (milestone) {
          const newStatus = MILESTONE_TO_STATUS[milestone];
          if (newStatus && newStatus !== inst.status) {
            inst.status = newStatus;
          }
          if (milestone === 'url-ready') {
            // Try to extract a URL from the line.
            const urlMatch = message.match(/https?:\/\/\S+/);
            if (urlMatch) inst.url = urlMatch[0];
          }
          if (milestone === 'failed') {
            inst.lastError = message;
          }
        }
      },
      onStderr: (line) => {
        bus.info(`[stderr] ${line}`, { level: 'warn', instanceId: inst.id });
        if (/error|failed|exception/i.test(line)) {
          inst.status = 'failed';
          inst.lastError = line;
        }
      },
      onExit: (code) => {
        if (code === 0) {
          if (inst.status !== 'failed') {
            inst.status = inst.url ? 'ready' : 'serving';
          }
          bus.info(`Deploy finished successfully.`, {
            level: 'success',
            milestone: 'url-ready',
            instanceId: inst.id,
          });
          // If we didn't capture a URL, derive the canonical one.
          if (!inst.url) inst.url = `https://${account.label.toLowerCase().replace(/\s+/g, '-')}--${cfg.appName}-ui.modal.run`;
        } else {
          inst.status = 'failed';
          inst.lastError = inst.lastError || `modal deploy exited with code ${code}`;
          bus.info(`Deploy failed (exit ${code}): ${inst.lastError}`, {
            level: 'error',
            milestone: 'failed',
            instanceId: inst.id,
          });
        }
      },
    });

    void instShort;
    return reply.code(202).send({ ok: true, instanceId: inst.id, status: inst.status });
  });

  app.delete('/api/instances/:id', async (req) => {
    const { id } = req.params as { id: string };
    return { ok: instances.delete(id) };
  });
}
