import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrivacyState {
  isPrivate: boolean;
  isBiometricsEnabled: boolean;
  togglePrivacy: () => void;
  setPrivate: (value: boolean) => void;
  toggleBiometrics: () => void;
  setBiometricsEnabled: (value: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      isPrivate: false,
      isBiometricsEnabled: false,
      togglePrivacy: () => set((state) => ({ isPrivate: !state.isPrivate })),
      setPrivate: (isPrivate) => set({ isPrivate }),
      toggleBiometrics: () => set((state) => ({ isBiometricsEnabled: !state.isBiometricsEnabled })),
      setBiometricsEnabled: (isBiometricsEnabled) => set({ isBiometricsEnabled }),
    }),
    {
      name: 'privacy-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
