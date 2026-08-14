import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './locales/pt.json';
import en from './locales/en.json';
import es from './locales/es.json';
import { getDeviceLanguage } from '../services/device';

// Em teste, trava em 'pt' (2026-08-10) — as suítes existentes fazem
// getByText nos textos literais em português; travar aqui evita
// reescrever toda asserção de texto quando o idioma do idioma real do
// app passou a ser configurável. Comportamento de fato (troca de
// idioma) tem cobertura própria em __tests__/i18n.test.ts.
const initialLanguage = process.env.NODE_ENV === 'test' ? 'pt' : getDeviceLanguage();

i18next
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
    },
    lng: initialLanguage,
    fallbackLng: 'pt',
    interpolation: { escapeValue: false }, // RN não usa HTML, não precisa escapar
    compatibilityJSON: 'v4',
  });

export default i18next;
