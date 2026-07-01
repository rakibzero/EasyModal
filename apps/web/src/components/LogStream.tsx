import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
  success: 'text-emerald-300',
};

export function LogStream() {
  const logs = useAppStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-slate-500">Waiting for events…</p>
      ) : (
        logs.map((e, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            <span className="text-slate-500">{new Date(e.timestamp).toLocaleTimeString()} </span>
            <span className={LEVEL_COLOR[e.level] ?? 'text-slate-300'}>
              [{e.level.toUpperCase()}]
            </span>{' '}
            <span className="text-slate-200">{e.message}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
