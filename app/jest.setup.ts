// @testing-library/react-native v13+ já inclui os matchers (toBeVisible
// etc.) sem precisar de import separado.

// Import explícito em vez de depender do global ambiente do @types/jest:
// o "module": "preserve" do expo/tsconfig.base não resolve bem o
// namespace `jest` como valor nesse modo (TS2708), import direto resolve.
import { jest } from '@jest/globals';

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
// isolado — troca <Link> por um wrapper que só renderiza os filhos.
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Link: ({ children, ...props }: any) =>
      React.createElement(Text, props, children),
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});
