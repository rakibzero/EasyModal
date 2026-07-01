import { Banner } from '../components/Banner';

export function KeysPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Keys</h2>
      <p className="mt-1 text-sm text-slate-400">
        Add your Modal and HuggingFace tokens. They're stored encrypted on your machine.
      </p>
      <div className="mt-6 space-y-4">
        <Banner variant="info" title="What this step does">
          You'll paste your Modal token (id + secret) and a HuggingFace read token. Each is
          validated before saving. (Form arrives in Phase 4.)
        </Banner>
      </div>
    </div>
  );
}
