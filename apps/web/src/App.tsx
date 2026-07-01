import type { InstanceStatus } from '@wan22/shared';

const statuses: InstanceStatus[] = ['idle', 'building', 'downloading', 'serving', 'ready'];

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>Wan2.2Animate Deploy</h1>
      <p style={{ fontSize: '1.1rem', color: '#444' }}>
        Modal is powerful but miserable to set up. This is the missing UI.
      </p>
      <p>
        <strong>Phase 1 scaffold.</strong> Shared types linked — instance statuses:
      </p>
      <ul>
        {statuses.map((s) => (
          <li key={s}>
            <code>{s}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
