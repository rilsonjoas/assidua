import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FontScaleMode = 'normal' | 'large' | 'extraLarge';

// Valores escolhidos pra dar diferença perceptível sem quebrar layout —
// a auditoria de responsividade (2026-08-13) foi feita justamente pra
// isto ter margem de sobra até 1.3x.
export const FONT_SCALE_VALUES: Record<FontScaleMode, number> = {
  normal: 1,
  large: 1.15,
  extraLarge: 1.3,
};

interface FontScaleState {
  mode: FontScaleMode;
  setMode: (mode: FontScaleMode) => void;
}

// Mesmo padrão do themeStore/languageStore — escolha explícita
// persiste e sobrevive a reabertura do app. Complementa (não substitui)
// a fonte dinâmica do sistema, que já funciona (nenhum
// `allowFontScaling={false}` no app) — quem também aumenta a fonte do
// aparelho tem os dois efeitos somados, de propósito.
export const useFontScaleStore = create<FontScaleState>()(
  persist(
    (set) => ({
      mode: 'normal',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'font-scale-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
