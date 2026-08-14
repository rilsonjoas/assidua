import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupportedLanguage } from '../services/device';

export type LanguageMode = 'system' | SupportedLanguage;

interface LanguageState {
  mode: LanguageMode;
  setMode: (mode: LanguageMode) => void;
}

// Mesmo padrão do themeStore — 'system' segue o idioma do aparelho,
// escolha explícita fica salva e sobrevive a reabertura do app.
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'language-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
