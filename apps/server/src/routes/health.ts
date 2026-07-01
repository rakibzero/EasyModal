import type { FastifyInstance } from 'fastify';
import { checkPrereqs } from '../prereqs/check.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  app.get('/api/prereqs', async () => {
    return checkPrereqs();
  });
}
