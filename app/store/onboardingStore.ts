import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  setCompleted: () => void;
}

// Mesmo padrão do themeStore — persistido, sobrevive a fechar o app.
// "Primeira abertura" (Fase 1 do roadmap) é medido por isto, não por
// profiles.length === 0 (usuário que apaga todos os perfis não deveria
// ver onboarding de novo).
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      setCompleted: () => set({ hasCompletedOnboarding: true }),
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
