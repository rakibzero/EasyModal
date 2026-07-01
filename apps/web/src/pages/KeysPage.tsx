import { useState } from 'react';
import { api, type ValidationResult } from '../api/client';
import { Banner } from '../components/Banner';
import { KeyInput } from '../components/KeyInput';
import { useAppStore } from '../store/appStore';

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string };

const IDLE: TestState = { status: 'idle' };

export function KeysPage() {
  const setStep = useAppStore((s) => s.setStep);

  const [label, setLabel] = useState('');
  const [modalId, setModalId] = useState('');
  const [modalSecret, setModalSecret] = useState('');
  const [hfToken, setHfToken] = useState('');

  const [modalTest, setModalTest] = useState<TestState>(IDLE);
  const [hfTest, setHfTest] = useState<TestState>(IDLE);
  const [saving, setSaving] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<TestState>(IDLE);

  async function testModal() {
    setModalTest({ status: 'testing' });
    try {
      const r: ValidationResult = await api.validateModal(modalId, modalSecret);
      setModalTest({ status: r.ok ? 'ok' : 'fail', message: r.message });
    } catch (e) {
      setModalTest({ status: 'fail', message: String((e as Error).message || e) });
    }
  }

  async function testHf() {
    setHfTest({ status: 'testing' });
    try {
      const r: ValidationResult = await api.validateHf(hfToken);
      setHfTest({ status: r.ok ? 'ok' : 'fail', message: r.username ? `${r.message} (${r.username})` : r.message });
    } catch (e) {
      setHfTest({ status: 'fail', message: String((e as Error).message || e) });
    }
  }

  async function save() {
    setSaving(true);
    setGlobalMsg(IDLE);
    try {
      const r = await api.saveAccount({
        label: label || undefined,
        modalTokenId: modalId,
        modalTokenSecret: modalSecret,
        huggingfaceToken: hfToken || undefined,
      });
      if (r.ok) {
        setGlobalMsg({
          status: 'ok',
          message: hfToken && !r.huggingface.ok ? `Saved, but HF: ${r.huggingface.message}` : 'Saved! Ready to deploy.',
        });
        setStep('deploy');
      }
    } catch (e) {
      const msg = String((e as Error).message || e);
      setGlobalMsg({ status: 'fail', message: msg });
    } finally {
      setSaving(false);
    }
  }

  const modalValid = modalTest.status === 'ok';
  const canSave = modalId && modalSecret && modalValid && !saving;

  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Keys</h2>
      <p className="mt-1 text-sm text-slate-400">
        Add your Modal and HuggingFace tokens. They're stored locally on your machine.
      </p>

      <div className="mt-6 space-y-6">
        {/* Modal card */}
        <Card title="Modal Account">
          <KeyInput label="Account label (optional)" value={label} onChange={setLabel} placeholder="My Modal Account" />
          <KeyInput label="Modal token ID" value={modalId} onChange={setModalId} placeholder="ak-…" />
          <KeyInput label="Modal token secret" value={modalSecret} onChange={setModalSecret} placeholder="as-…" />
          <div className="flex items-center gap-3">
            <button
              onClick={testModal}
              disabled={!modalId || !modalSecret || modalTest.status === 'testing'}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-slate-600"
            >
              {modalTest.status === 'testing' ? 'Testing…' : 'Test Modal token'}
            </button>
            <TestBadge state={modalTest} />
          </div>
          <p className="text-xs text-slate-500">
            Get a token at <code>modal.com</code> → Settings → API Tokens (New Token → "Workspace" or "Account").
          </p>
        </Card>

        {/* HF card */}
        <Card title="HuggingFace (for model downloads)">
          <KeyInput label="HuggingFace read token" value={hfToken} onChange={setHfToken} placeholder="hf_…" />
          <div className="flex items-center gap-3">
            <button
              onClick={testHf}
              disabled={!hfToken || hfTest.status === 'testing'}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-slate-600"
            >
              {hfTest.status === 'testing' ? 'Testing…' : 'Test HF token'}
            </button>
            <TestBadge state={hfTest} />
          </div>
          <p className="text-xs text-slate-500">
            Create a read token at <code>huggingface.co/settings/tokens</code>.
          </p>
        </Card>

        {globalMsg.status !== 'idle' && (
          <Banner variant={globalMsg.status === 'ok' ? 'success' : 'error'}>
            {globalMsg.message}
          </Banner>
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-sky-500"
        >
          {saving ? 'Saving & validating…' : 'Save & continue'}
        </button>
        {!modalValid && (
          <p className="text-center text-xs text-slate-500">
            Test your Modal token first — it must pass before you can save.
          </p>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function TestBadge({ state }: { state: TestState }) {
  if (state.status === 'idle' || state.status === 'testing') return null;
  return (
    <span className={`text-sm ${state.status === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
      {state.message}
    </span>
  );
}
