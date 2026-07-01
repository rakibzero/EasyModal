import { Banner } from '../components/Banner';

export function SetupPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Setup</h2>
      <p className="mt-1 text-sm text-slate-400">
        Let's make sure your computer is ready to deploy ComfyUI on Modal.
      </p>
      <div className="mt-6 space-y-4">
        <Banner variant="info" title="What this step does">
          We check that Node.js and the <code>modal</code> CLI are installed, and guide you
          through installing anything that's missing. (Filling in live checks in Phase 4.)
        </Banner>
      </div>
    </div>
  );
}
