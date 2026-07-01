import { randomUUID } from 'node:crypto';
import type { LogEvent } from '@easymodal/shared';

type Subscriber = (event: LogEvent) => void;

/**
 * In-process event bus. Holds a rolling buffer of recent events for replay on
 * connect, plus a set of live subscribers (SSE connections).
 */
class EventBus {
  private subscribers = new Set<Subscriber>();
  private buffer: LogEvent[] = [];
  private readonly maxBuffer = 200;

  emit(event: LogEvent): void {
    const full: LogEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.buffer.push(full);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    }
    for (const sub of this.subscribers) {
      try {
        sub(full);
      } catch {
        // subscriber may have disconnected — ignore
      }
    }
  }

  /** Convenience: emit an info-level log line. */
  info(message: string, extra: Partial<LogEvent> = {}): void {
    this.emit({ timestamp: new Date().toISOString(), level: 'info', message, ...extra });
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /** Snapshot of recent events (for SSE replay on connect). */
  recent(): LogEvent[] {
    return [...this.buffer];
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }
}

export const bus = new EventBus();

/** Helper to create a log event id (unused for now, reserved for tracing). */
export function newEventId(): string {
  return randomUUID();
}
