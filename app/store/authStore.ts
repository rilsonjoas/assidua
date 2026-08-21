import { create } from 'zustand';
import { User } from '../services/auth';
import { loginPurchases, logoutPurchases } from '../services/purchases';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  // Ponto único de entrada pra troca de usuário (login, logout, callback
  // de magic link/Google, exclusão de conta — todos passam por aqui) —
  // por isso o sync com o RevenueCat (L1, 2026-08-21) fica centralizado
  // no próprio store em vez de espalhado em cada tela que chama setUser.
  // Sem chave configurada, loginPurchases/logoutPurchases são no-op.
  setUser: (user) => {
    const previous = get().user;
    set({ user });

    if (user && user.id !== previous?.id) {
      loginPurchases(user.id);
    } else if (!user && previous) {
      logoutPurchases();
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
}));
