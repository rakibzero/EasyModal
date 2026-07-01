import type { FastifyInstance } from 'fastify';
import { listWorkflowCatalog, readWorkflowFile } from '../workflows/catalog.js';

/** /api/workflows — bundled workflow catalog + per-file fetch. */
export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/workflows', async () => ({ categories: listWorkflowCatalog() }));

  app.get('/api/workflows/:pack/:filename', async (req, reply) => {
    const { pack, filename } = req.params as { pack: string; filename: string };
    const body = readWorkflowFile(pack, filename);
    if (body === null) {
      return reply.code(404).send({ ok: false, message: 'Workflow not found.' });
    }
    reply.header('Content-Type', 'application/json');
    return body;
  });
}
