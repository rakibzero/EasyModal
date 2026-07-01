import { create } from 'zustand';
import type { LogEvent, InstanceStatus } from '@wan22/shared';

export type StepId = 'setup' | 'keys' | 'deploy' | 'launch';

interface AppState {
  currentStep: StepId;
  logs: LogEvent[];
  instanceStatus: InstanceStatus | null;
  sseConnected: boolean;
  setStep: (step: StepId) => void;
  addLog: (event: LogEvent) => void;
  setInstanceStatus: (status: InstanceStatus | null) => void;
  setSseConnected: (connected: boolean) => void;
}

const MAX_LOGS = 500;

export const useAppStore = create<AppState>((set) => ({
  currentStep: 'setup',
  logs: [],
  instanceStatus: null,
  sseConnected: false,
  setStep: (step) => set({ currentStep: step }),
  addLog: (event) =>
    set((state) => ({ logs: [...state.logs.slice(-(MAX_LOGS - 1)), event] })),
  setInstanceStatus: (status) => set({ instanceStatus: status }),
  setSseConnected: (connected) => set({ sseConnected: connected }),
}));
