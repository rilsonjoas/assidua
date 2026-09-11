import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrivacyState {
  isPrivate: boolean;
  isBiometricsEnabled: boolean;
  // "Modo Privacidade" espalhado (2026-09-11, achado real do Rilson: o
  // olhinho só existia na Home, precisava voltar lá toda vez) — flag
  // separada só pra saber se já mostrou o toast explicativo uma vez
  // (ver `lib/privacy.ts`, `togglePrivacyWithHint`). Não é sobre
  // reidratação — não precisa de guarda de corrida como `hasHydrated`
  // abaixo, só evita mostrar a mesma explicação toda vez que a pessoa
  // toca no olho.
  hasSeenPrivacyToggleHint: boolean;
  // Achado da auditoria de segurança (2026-09-11) — mesma classe de bug
  // já encontrada e corrigida uma vez neste projeto, em
  // `store/onboardingStore.ts` ("toda abertura mostra o onboarding de
  // novo"): sem isto, `BiometricLockScreen` lia `isBiometricsEnabled`
  // ANTES do zustand-persist terminar de reidratar do AsyncStorage
  // (operação assíncrona) — no intervalo, o valor em memória é o
  // default `false`, então uma pessoa que TINHA o bloqueio ligado
  // podia ver uma fresta do app real antes do bloqueio "descobrir"
  // que devia travar. Pra uma feature de segurança, "falha aberta" por
  // uma corrida é inaceitável — `BiometricLockScreen` agora espera este
  // flag antes de decidir qualquer coisa, cobrindo a tela por padrão
  // enquanto não sabe (falha FECHADA, não aberta).
  hasHydrated: boolean;
  togglePrivacy: () => void;
  setPrivate: (value: boolean) => void;
  toggleBiometrics: () => void;
  setBiometricsEnabled: (value: boolean) => void;
  setHasSeenPrivacyToggleHint: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      isPrivate: false,
      isBiometricsEnabled: false,
      hasSeenPrivacyToggleHint: false,
      hasHydrated: false,
      togglePrivacy: () => set((state) => ({ isPrivate: !state.isPrivate })),
      setPrivate: (isPrivate) => set({ isPrivate }),
      toggleBiometrics: () => set((state) => ({ isBiometricsEnabled: !state.isBiometricsEnabled })),
      setBiometricsEnabled: (isBiometricsEnabled) => set({ isBiometricsEnabled }),
      setHasSeenPrivacyToggleHint: (hasSeenPrivacyToggleHint) => set({ hasSeenPrivacyToggleHint }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'privacy-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
