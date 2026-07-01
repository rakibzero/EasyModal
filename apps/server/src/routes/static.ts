import type { FastifyInstance } from 'fastify';
import { fastifyStatic } from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In the built layout: apps/server/dist/routes/ → apps/web/dist
const WEB_DIST = join(__dirname, '..', '..', '..', 'web', 'dist');

/**
 * Serve the built web bundle from the server (production mode).
 * Skipped if the web dist doesn't exist (dev mode — Vite serves the UI).
 */
export async function staticRoutes(app: FastifyInstance): Promise<void> {
  if (!existsSync(WEB_DIST)) return;

  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: any non-/api route serves index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ ok: false, message: 'Not found.' });
    }
    return reply.sendFile('index.html');
  });
}
