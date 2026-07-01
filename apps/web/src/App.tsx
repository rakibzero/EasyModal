import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { subscribeEvents } from './api/client';
import { StepRail } from './components/StepRail';
import { StatusDot } from './components/StatusDot';
import { SetupPage } from './pages/SetupPage';
import { KeysPage } from './pages/KeysPage';
import { ConfigurePage } from './pages/ConfigurePage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { DeployPage } from './pages/DeployPage';
import { LaunchPage } from './pages/LaunchPage';

export function App() {
  const currentStep = useAppStore((s) => s.currentStep);
  const setStep = useAppStore((s) => s.setStep);
  const addLog = useAppStore((s) => s.addLog);
  const sseConnected = useAppStore((s) => s.sseConnected);
  const setSseConnected = useAppStore((s) => s.setSseConnected);

  // Connect to the backend SSE event stream on mount.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (msg) => {
      try {
        addLog(JSON.parse(msg.data));
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, [addLog, setSseConnected]);

  // Keep the subscribeEvents import referenced (alternative API for non-React callers).
  void subscribeEvents;

  const page = {
    setup: <SetupPage />,
    keys: <KeysPage />,
    configure: <ConfigurePage />,
    workflows: <WorkflowsPage />,
    deploy: <DeployPage />,
    launch: <LaunchPage />,
  }[currentStep];

  return (
    <div className="flex h-screen w-full">
      <StepRail current={currentStep} onSelect={setStep} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
          <span className="text-sm text-slate-400">
            Modal is powerful but miserable to set up. This is the missing UI.
          </span>
          <StatusDot connected={sseConnected} label={sseConnected ? 'Live' : 'Disconnected'} />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{page}</main>
      </div>
    </div>
  );
}
