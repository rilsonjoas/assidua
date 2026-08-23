import { create } from 'zustand';

interface SyncState {
  lastSyncAt: string | null;
  failedSyncCount: number;
  isSyncing: boolean;
  setSyncing: (isSyncing: boolean) => void;
  recordSyncResult: (synced: number, failed: number) => void;
  clearFailedSync: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  lastSyncAt: null,
  failedSyncCount: 0,
  isSyncing: false,
  setSyncing: (isSyncing) => set({ isSyncing }),
  recordSyncResult: (_synced, failed) =>
    set((state) => ({
      lastSyncAt: new Date().toISOString(),
      failedSyncCount: state.failedSyncCount + failed,
      isSyncing: false,
    })),
  clearFailedSync: () => set({ failedSyncCount: 0 }),
}));
