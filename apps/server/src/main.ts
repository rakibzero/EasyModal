import Fastify from 'fastify';
import type { LogEvent } from '@wan22/shared';

const PORT = Number(process.env.PORT) || 7421;
const HOST = '127.0.0.1';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({
  status: 'ok',
  time: new Date().toISOString(),
}));

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    const url = `http://${HOST}:${PORT}`;
    app.log.info(`Wan2.2Animate Deploy server listening on ${url}`);

    // Prove shared types are linked across the workspace:
    const sample: LogEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'server bootstrapped — shared types linked',
    };
    app.log.info({ sample }, 'workspace linkage confirmed');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
