// Fachada do token de autenticação (nativo) — W1, 2026-08-22.
//
// Ponto único de acesso ao token: `expo-secure-store` no nativo,
// `localStorage` na web (services/tokenStorage.web.ts, resolvido pelo
// Metro via extensão `.web.ts`). Nenhuma tela importa SecureStore
// diretamente — assim a web não explode em runtime num módulo nativo
// (achado real: ExpoSecureStore.setValueWithKeyAsync is not a function
// em auth-callback.tsx:45).

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export async function setAuthToken(value: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, value);
}

export async function getAuthToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function deleteAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
