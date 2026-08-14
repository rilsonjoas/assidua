import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  // Achado real de uso (2026-08-14): "toda vez que entro no app
  // aparece o onboarding, não só na primeira". `setCompleted()` já
  // era chamado certinho no fim do onboarding — o problema é que a
  // leitura de `hasCompletedOnboarding` no `AuthGuard` (`_layout.tsx`)
  // acontecia antes do zustand-persist terminar de reidratar do
  // AsyncStorage (operação assíncrona, corrida com o próprio boot do
  // app). Nesse intervalo o valor em memória ainda é o `false` padrão
  // — decisão de navegar pro onboarding acontecia com dado desatualizado.
  // Este flag deixa o `AuthGuard` esperar a reidratação de verdade
  // acabar antes de decidir.
  hasHydrated: boolean;
  setCompleted: () => void;
  setHasHydrated: (value: boolean) => void;
}

// Mesmo padrão do themeStore — persistido, sobrevive a fechar o app.
// "Primeira abertura" (Fase 1 do roadmap) é medido por isto, não por
// profiles.length === 0 (usuário que apaga todos os perfis não deveria
// ver onboarding de novo).
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hasHydrated: false,
      setCompleted: () => set({ hasCompletedOnboarding: true }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
