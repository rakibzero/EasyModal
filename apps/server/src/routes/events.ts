import type { FastifyInstance, FastifyReply } from 'fastify';
import type { LogEvent } from '@easymodal/shared';
import { bus } from '../events/bus.js';

const HEARTBEAT_MS = 15_000;

function serialize(event: LogEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/events', async (req, reply: FastifyReply) => {
    // Hijack the socket — we manage the raw SSE stream ourselves, Fastify must
    // NOT auto-serialize/pipe (which causes ERR_STREAM_CANNOT_PIPE).
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Replay recent events to the new client.
    for (const past of bus.recent()) {
      reply.raw.write(serialize(past));
    }

    // Subscribe to live events.
    const unsubscribe = bus.subscribe((event) => {
      reply.raw.write(serialize(event));
    });

    // Heartbeat keeps the connection alive and flushes proxies.
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, HEARTBEAT_MS);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
