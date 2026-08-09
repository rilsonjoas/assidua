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
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (profile: Profile) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  activeProfile: null,
  setProfiles: (profiles) =>
    set({ profiles, activeProfile: profiles[0] ?? null }),
  setActiveProfile: (activeProfile) => set({ activeProfile }),
}));
