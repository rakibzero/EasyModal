import type { StepId } from '../store/appStore';

interface Step {
  id: StepId;
  label: string;
  help: string;
}

const STEPS: Step[] = [
  { id: 'setup', label: 'Setup', help: 'Check your computer is ready' },
  { id: 'keys', label: 'Keys', help: 'Add your Modal + HuggingFace tokens' },
  { id: 'configure', label: 'Configure', help: 'Pick GPU, RAM, CPU + workflow packs' },
  { id: 'workflows', label: 'Workflows', help: 'Browse bundled workflow files' },
  { id: 'deploy', label: 'Deploy', help: 'Build ComfyUI on Modal' },
  { id: 'launch', label: 'Launch', help: 'Open your ComfyUI URL' },
];

interface StepRailProps {
  current: StepId;
  onSelect: (step: StepId) => void;
}

export function StepRail({ current, onSelect }: StepRailProps) {
  return (
    <nav className="flex w-60 flex-col gap-1 border-r border-slate-800 p-4">
      <div className="mb-6 px-2">
        <h1 className="text-lg font-bold text-white">Wan2.2Animate</h1>
        <p className="text-xs text-slate-400">Deploy ComfyUI on Modal</p>
      </div>
      {STEPS.map((step, i) => {
        const active = step.id === current;
        return (
          <button
            key={step.id}
            onClick={() => onSelect(step.id)}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
              active ? 'bg-sky-600/20 ring-1 ring-sky-500' : 'hover:bg-slate-800/60'
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                active ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {i + 1}
            </span>
            <span>
              <span className={`block text-sm font-medium ${active ? 'text-white' : 'text-slate-200'}`}>
                {step.label}
              </span>
              <span className="block text-xs text-slate-500">{step.help}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
