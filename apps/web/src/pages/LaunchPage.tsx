import { Banner } from '../components/Banner';

export function LaunchPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Launch</h2>
      <p className="mt-1 text-sm text-slate-400">Open your ComfyUI and start animating.</p>
      <div className="mt-6 space-y-4">
        <Banner variant="success" title="What this step does">
          Once deployed, you'll see a big <strong>Open ComfyUI</strong> button with your Modal
          URL, plus status and controls. (Arrives in Phase 6.)
        </Banner>
      </div>
    </div>
  );
}
