import { create } from 'zustand';
import type { DeployConfig, LogEvent, InstanceStatus } from '@wan22/shared';

export type StepId = 'setup' | 'keys' | 'configure' | 'workflows' | 'deploy' | 'launch';

/** Default deploy config surfaced in the Configure step. */
export const DEFAULT_CONFIG: DeployConfig = {
  appName: 'wan22-animate',
  gpu: 'A100-80GB',
  maxInputs: 2,
  timeoutSeconds: 1800,
  memoryMb: 32768,
  cpu: 8,
  packs: ['wan22'],
};

interface AppState {
  currentStep: StepId;
  logs: LogEvent[];
  instanceStatus: InstanceStatus | null;
  sseConnected: boolean;
  /** Chosen deploy config (persisted to localStorage so it survives reloads). */
  deployConfig: DeployConfig;
  setStep: (step: StepId) => void;
  addLog: (event: LogEvent) => void;
  setInstanceStatus: (status: InstanceStatus | null) => void;
  setSseConnected: (connected: boolean) => void;
  setDeployConfig: (patch: Partial<DeployConfig>) => void;
}

const MAX_LOGS = 500;

const LS_KEY = 'wan22-deploy-config';
function loadConfig(): DeployConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

export const useAppStore = create<AppState>((set) => ({
  currentStep: 'setup',
  logs: [],
  instanceStatus: null,
  sseConnected: false,
  deployConfig: loadConfig(),
  setStep: (step) => set({ currentStep: step }),
  addLog: (event) =>
    set((state) => ({ logs: [...state.logs.slice(-(MAX_LOGS - 1)), event] })),
  setInstanceStatus: (status) => set({ instanceStatus: status }),
  setSseConnected: (connected) => set({ sseConnected: connected }),
  setDeployConfig: (patch) =>
    set((state) => {
      const next = { ...state.deployConfig, ...patch };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return { deployConfig: next };
    }),
}));
