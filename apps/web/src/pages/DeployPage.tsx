import { Banner } from '../components/Banner';
import { LogStream } from '../components/LogStream';

export function DeployPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Deploy</h2>
      <p className="mt-1 text-sm text-slate-400">
        Build ComfyUI on Modal and prefetch all the models.
      </p>
      <div className="mt-6 space-y-4">
        <Banner variant="info" title="What this step does">
          Clicking <strong>Deploy ComfyUI to Modal</strong> builds the container image,
          downloads all models to your Modal volume, and starts the ComfyUI server. You'll
          see live progress below. (Button + pipeline arrive in Phase 5.)
        </Banner>
        <LogStream />
      </div>
    </div>
  );
}
