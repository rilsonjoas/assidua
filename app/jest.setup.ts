// @testing-library/react-native v13+ já inclui os matchers (toBeVisible
// etc.) sem precisar de import separado.

// Import explícito em vez de depender do global ambiente do @types/jest:
// o "module": "preserve" do expo/tsconfig.base não resolve bem o
// namespace `jest` como valor nesse modo (TS2708), import direto resolve.
import { jest } from '@jest/globals';

// Inicializa o i18next uma vez pra toda a suíte — sem isso, useTranslation()
// nos componentes testados isoladamente (sem passar pelo _layout.tsx real)
// não tem nenhuma instância pra usar e t() devolve a chave crua em vez do
// texto.
//
// Importante: inicializa direto aqui, SEM importar `i18n/index.ts` (que
// puxa `services/device` → `services/api`). Achado real (2026-08-10):
// importar esse caminho no setup fazia `services/api` ser carregado e
// cacheado ANTES do `jest.mock('../services/api', ...)` de cada teste
// rodar — testes que mockam `services/api` (ex: device-timezone.test.ts)
// passavam a bater na instância axios de verdade por trás do mock,
// silenciosamente. i18next é um singleton do pacote `i18next`, então
// inicializar com os mesmos recursos aqui é suficiente pra todo
// `useTranslation()` do app funcionar nos testes, sem esse acoplamento.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './i18n/locales/pt.json';
import en from './i18n/locales/en.json';
import es from './i18n/locales/es.json';
i18next.use(initReactI18next).init({
  // As 3 traduções carregadas (não só pt) — __tests__/i18n.test.tsx testa
  // troca de idioma de verdade, não só que o default funciona.
  resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
  lng: 'pt',
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// AsyncStorage real bate em disco nativo — themeStore usa como storage do
// zustand/persist, precisa do mock oficial pra não quebrar em teste.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SecureStore não existe no ambiente de teste (não é um device real) —
// mock em memória simples, suficiente pro que os testes verificam.
jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
});

// expo-router não tem contexto de rota nos testes de unidade/componente
// isolado — troca <Link> por um wrapper que só renderiza os filhos, e
// useRouter()/useSegments() por versões mockáveis (mesmo objeto `router`
// pra manter push/replace/back espionáveis num lugar só).
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    Link: ({ children, ...props }: any) =>
      React.createElement(Text, props, children),
    router,
    useRouter: () => router,
    useSegments: jest.fn(() => []),
    useLocalSearchParams: jest.fn(() => ({})),
  };
});
