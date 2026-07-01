import Fastify from 'fastify';
import open from 'open';
import { bus } from './events/bus.js';
import { healthRoutes } from './routes/health.js';
import { eventsRoutes } from './routes/events.js';
import { findFreePort } from './util/port.js';

const DEFAULT_PORT = Number(process.env.PORT) || 7421;
const HOST = '127.0.0.1';
const shouldOpenBrowser = !process.env.NO_OPEN && !process.argv.includes('--no-open');

async function start(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
  });

  // Note: meaningful lifecycle events are also pushed to the event bus via
  // bus.info(...) so the UI can stream them over SSE. Per-line pino log
  // mirroring is intentionally not done (too noisy); we emit targeted events.

  await healthRoutes(app);
  await eventsRoutes(app);

  await app.register(
    async (corsApp) => {
      // Permissive CORS for localhost dev only.
      corsApp.addHook('onRequest', async (req, reply) => {
        const origin = req.headers.origin;
        if (origin && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
          reply.header('Access-Control-Allow-Origin', origin);
          reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type');
        }
        if (req.method === 'OPTIONS') return reply.code(204).send();
      });
    },
    { name: 'cors-local' },
  );

  const port = await findFreePort(DEFAULT_PORT);
  const url = `http://${HOST}:${port}`;

  try {
    await app.listen({ port, host: HOST });
    bus.info(`Wan2.2Animate Deploy server listening on ${url}`);
    app.log.info(`listening on ${url}`);

    if (shouldOpenBrowser) {
      // Open the web UI (Vite dev server in dev; otherwise the served bundle).
      const webUrl = process.env.WEB_URL || url;
      bus.info(`Opening browser to ${webUrl}`);
      open(webUrl).catch(() => app.log.warn('Could not open browser automatically'));
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
