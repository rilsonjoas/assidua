import { useEffect } from 'react';
import i18next from '../i18n';
import { useLanguageStore } from '../store/languageStore';
import { getDeviceLanguage, SupportedLanguage } from '../services/device';

// Mesmo padrão do useTheme: 'system' resolve pro idioma do aparelho,
// escolha explícita do usuário tem prioridade e fica salva.
export function useLanguage(): { language: SupportedLanguage; setLanguage: (l: 'system' | SupportedLanguage) => void; mode: 'system' | SupportedLanguage } {
  const { mode, setMode } = useLanguageStore();
  const language = mode === 'system' ? getDeviceLanguage() : mode;

  useEffect(() => {
    if (i18next.language !== language) {
      i18next.changeLanguage(language);
    }
  }, [language]);

  return { language, setLanguage: setMode, mode };
}
