import { create } from 'zustand';

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
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (profile: Profile) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  // Achado real (2026-08-22, durante automação de screenshot): Hoje e
  // Perfis buscam a lista no mount e chamam isto — se a tela remonta ao
  // trocar de aba (não só perde foco), a pessoa escolhe "Demonstração"
  // na Home, vai pra Remédios, e a seleção volta sozinha pro primeiro
  // perfil. Preserva a escolha atual se ela ainda existir na lista nova;
  // só cai pro primeiro perfil quando não há seleção ou ela sumiu
  // (perfil apagado).
  setProfiles: (profiles) => {
    const current = get().activeProfile;
    const stillExists = current && profiles.some((p) => p.id === current.id);
    set({ profiles, activeProfile: stillExists ? current : (profiles[0] ?? null) });
  },
  setActiveProfile: (activeProfile) => set({ activeProfile }),
}));
