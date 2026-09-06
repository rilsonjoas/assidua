import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface HighContrastState {
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  setHighContrast: (value: boolean) => void;
}

// Modo Alto Contraste (v1.3, aprovado 2026-09-02) — ortogonal ao
// claro/escuro (`themeStore`), não substitui: quem prefere escuro
// continua no escuro, só que na variante de contraste máximo (ver
// `constants/theme.ts`, mira AAA em vez de AA). Mesmo padrão de
// persistência do `privacyStore`.
export const useHighContrastStore = create<HighContrastState>()(
  persist(
    (set) => ({
      isHighContrast: false,
      toggleHighContrast: () => set((state) => ({ isHighContrast: !state.isHighContrast })),
      setHighContrast: (isHighContrast) => set({ isHighContrast }),
    }),
    {
      name: 'high-contrast-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
