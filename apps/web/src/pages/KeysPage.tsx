import { useEffect, useState } from 'react';
import { api, type PublicAccount, type ValidationResult } from '../api/client';
import { Banner } from '../components/Banner';
import { KeyInput } from '../components/KeyInput';
import { useAppStore } from '../store/appStore';

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string };
const IDLE: TestState = { status: 'idle' };

export function KeysPage() {
  const setStep = useAppStore((s) => s.setStep);
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Add-account form state.
  const [label, setLabel] = useState('');
  const [modalId, setModalId] = useState('');
  const [modalSecret, setModalSecret] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [modalTest, setModalTest] = useState<TestState>(IDLE);
  const [hfTest, setHfTest] = useState<TestState>(IDLE);
  const [saving, setSaving] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<TestState>(IDLE);

  async function refreshAccounts() {
    try {
      const { accounts } = await api.listAccounts();
      setAccounts(accounts);
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    refreshAccounts();
  }, []);

  async function testModal() {
    setModalTest({ status: 'testing' });
    try {
      const r = await api.validateModal(modalId, modalSecret);
      setModalTest({ status: r.ok ? 'ok' : 'fail', message: r.message });
    } catch (e) {
      setModalTest({ status: 'fail', message: String((e as Error).message || e) });
    }
  }

  async function testHf() {
    setHfTest({ status: 'testing' });
    try {
      const r = await api.validateHf(hfToken);
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
          message: hfToken && !r.huggingface.ok ? `Saved, but HF: ${r.huggingface.message}` : 'Account saved!',
        });
        // Reset the form + refresh the list.
        setLabel('');
        setModalId('');
        setModalSecret('');
        setHfToken('');
        setModalTest(IDLE);
        setHfTest(IDLE);
        refreshAccounts();
      }
    } catch (e) {
      setGlobalMsg({ status: 'fail', message: String((e as Error).message || e) });
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount(id: string, lbl: string) {
    if (!confirm(`Remove account "${lbl}"? This won't delete anything on Modal.`)) return;
    await api.deleteAccount(id);
    refreshAccounts();
  }

  const modalValid = modalTest.status === 'ok';
  const canSave = modalId && modalSecret && modalValid && !saving;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Keys</h2>
      <p className="mt-1 text-sm text-slate-400">
        Connect one or more Modal accounts. Switch between them when deploying. Tokens are stored locally on your machine.
      </p>

      {/* Saved accounts list */}
      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-300">Connected accounts ({accounts.length})</h3>
        {loadingList ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 px-4 py-4 text-sm text-slate-500">
            No accounts yet — add your first below.
          </p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{a.label}</p>
                  <p className="truncate text-xs text-slate-500">
                    {a.modalTokenId} · {a.modalTokenSecretMasked}
                    {a.hasHuggingFace ? ' · HF ✓' : ' · no HF'}
                  </p>
                </div>
                <button
                  onClick={() => removeAccount(a.id, a.label)}
                  className="flex-none rounded-md border border-red-900 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add account form */}
      <section className="mt-6 space-y-6">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Add a Modal account</h3>
          <KeyInput label="Account label (optional)" value={label} onChange={setLabel} placeholder="e.g. Personal / Team" />
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
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">HuggingFace (for model downloads)</h3>
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
        </div>

        {globalMsg.status !== 'idle' && (
          <Banner variant={globalMsg.status === 'ok' ? 'success' : 'error'}>{globalMsg.message}</Banner>
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-sky-500"
        >
          {saving ? 'Saving & validating…' : 'Add account'}
        </button>
      </section>

      {accounts.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setStep('configure')}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Continue → Configure
          </button>
        </div>
      )}
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
