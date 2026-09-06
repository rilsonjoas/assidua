import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Profile {
  id: number;
  user_id: number;
  name: string;
  color: string;
  avatar_emoji: string;
  is_active: boolean;
  // Fase 1.5 — ausente em respostas antigas/outros endpoints que não
  // passaram por ProfileController::index(); tratar como true nesse
  // caso (perfil próprio é o padrão histórico).
  is_owner?: boolean;
  // Fase de fuso horário (2026-08-10) — usado só pra decidir se precisa
  // autocorrigir (ver services/device.ts); a exibição em si não depende
  // disso no cliente, é o backend que usa pra calcular "hoje".
  timezone?: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  // Achado real de uso (2026-09-02): "fecho e reabro o app e ele volta pro
  // perfil Demonstração". Causa: `activeProfile` vivia só em memória — todo
  // cold boot começava com `null` e `setProfiles` (chamado no mount de Hoje
  // e Perfis) caía pro primeiro da lista por não ter nada salvo pra
  // preservar. Só o id é persistido (não o Profile inteiro): o objeto
  // completo sempre vem fresco da API, pra não servir nome/cor/avatar
  // desatualizado de um perfil editado ou apagado enquanto o app tava
  // fechado.
  activeProfileId: number | null;
  hasHydrated: boolean;
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (profile: Profile) => void;
  setHasHydrated: (value: boolean) => void;
  resolveActiveProfile: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfile: null,
      activeProfileId: null,
      hasHydrated: false,
      // Reidratação do AsyncStorage e o `api.get('/profiles')` do mount
      // correm em paralelo, sem garantia de quem termina primeiro — isolado
      // aqui pra ser chamado dos dois lados (setProfiles e setHasHydrated)
      // sempre que um deles "chegar atrasado" em relação ao outro.
      resolveActiveProfile: () => {
        const { profiles, activeProfile, activeProfileId } = get();
        if (profiles.length === 0) return;
        // Preserva a seleção em memória se a tela só remontou ao trocar de
        // aba (achado de 2026-08-22); senão usa o id restaurado do disco.
        const currentId = activeProfile?.id ?? activeProfileId;
        const resolved = (currentId && profiles.find((p) => p.id === currentId)) || profiles[0];
        set({ activeProfile: resolved, activeProfileId: resolved?.id ?? null });
      },
      setProfiles: (profiles) => {
        set({ profiles });
        get().resolveActiveProfile();
      },
      setActiveProfile: (activeProfile) => set({ activeProfile, activeProfileId: activeProfile.id }),
      setHasHydrated: (hasHydrated) => {
        set({ hasHydrated });
        if (!hasHydrated) return;
        // Achado real (2026-09-05, escrevendo o teste desta correção):
        // se os perfis da API já tinham chegado (e caído no fallback
        // profiles[0]) antes da reidratação terminar, chamar
        // `resolveActiveProfile()` aqui não bastava — ela prioriza
        // `activeProfile` já em memória sobre o id do disco (de
        // propósito, pra sobreviver a remontagem de aba), então o
        // fallback errado "vencia" o id certo que acabou de chegar.
        // Esta correção só acontece uma vez, no instante em que a
        // reidratação termina: se o id salvo existir na lista já
        // carregada, ele tem prioridade absoluta aqui — depois disso,
        // resolveActiveProfile volta a preservar a seleção normalmente.
        const { profiles, activeProfileId } = get();
        if (activeProfileId === null) return;
        const persisted = profiles.find((p) => p.id === activeProfileId);
        if (persisted) set({ activeProfile: persisted });
      },
    }),
    {
      name: 'profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ activeProfileId: state.activeProfileId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
