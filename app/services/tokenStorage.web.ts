// Fachada WEB do token de autenticação (W1, 2026-08-22).
//
// `expo-secure-store` não funciona no browser (módulo nativo sem
// implementação web) — aqui o token vive no localStorage. Mesmo
// contrato da fachada nativa (`services/tokenStorage.ts`), então
// nenhuma tela/service muda linha pra saber onde está rodando.
//
// localStorage não é criptografado como o Keystore/Keychain nativo —
// aceitável para token Bearer de sessão na web (padrão de SPAs);
// revogação continua no backend via logout/exclusão de conta.

const TOKEN_KEY = 'auth_token';

export async function setAuthToken(value: string): Promise<void> {
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Modo privado/quota cheia: sessão não persiste entre recargas,
    // mas o app segue usável nesta aba.
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function deleteAuthToken(): Promise<void> {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
