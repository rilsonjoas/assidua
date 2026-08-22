import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';
import { setAuthToken, deleteAuthToken } from './tokenStorage';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  subscription_tier: 'free' | 'pro';
  has_password: boolean;
}

// Login sem senha (2026-08-14) — o backend não tem mais /auth/login nem
// /auth/register (ver AuthController::requestMagicLink). Um endpoint só:
// e-mail de conta existente recebe link de acesso; e-mail novo exige
// `name` e cria a conta na hora. Não retorna token — o token só chega
// depois, quando a pessoa toca o link recebido por e-mail, que abre o
// app via deep link direto em auth-callback.tsx (mesmo caminho que o
// login com Google já usa).
export async function requestMagicLink(email: string, name?: string): Promise<void> {
  const payload: Record<string, string> = name ? { email, name } : { email };

  // Web (W1, 2026-08-22): pede pro backend devolver o redirect do
  // e-mail pra /auth-callback desta origem. O backend valida contra
  // allowlist (WEB_AUTH_ORIGINS) — origem desconhecida é rejeitada.
  if (Platform.OS === 'web') {
    payload.redirect_origin = window.location.origin;
  }

  await api.post('/auth/magic-link', payload);
}

export async function logout() {
  await api.post('/auth/logout');
  await deleteAuthToken();
}

export async function deleteAccount(password?: string) {
  await api.delete('/auth/account', { data: password ? { password } : undefined });
  await deleteAuthToken();
}

export async function getMe(): Promise<User | null> {
  try {
    const { data } = await api.get('/auth/me');
    return data;
  } catch {
    return null;
  }
}

const RETURN_URL = 'meusremedios://auth-callback';

export async function loginWithGoogle(): Promise<User> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost/api';

  // Web (W1, 2026-08-22): redirect completo na própria aba. O scheme
  // `meusremedios://` não navega no browser — o return_url precisa ser
  // URL http da MESMA origem, e a rota /auth-callback já lê os query
  // params que o backend devolve (mesmo contrato do deep link nativo,
  // achado de 2026-08-14). A Promise nunca resolve de propósito: a
  // página sai na navegação e o AuthGuard assume quando ela voltar.
  if (Platform.OS === 'web') {
    const returnUrl = `${window.location.origin}/auth-callback`;
    const webGoogleUrl = `${base}/auth/google?return_url=${encodeURIComponent(returnUrl)}`;
    window.location.assign(webGoogleUrl);
    await new Promise<User>(() => {});
  }

  const googleUrl = `${base}/auth/google?return_url=${encodeURIComponent(RETURN_URL)}`;

  const result = await WebBrowser.openAuthSessionAsync(googleUrl, RETURN_URL);

  if (result.type !== 'success') {
    throw new Error('Login com Google cancelado.');
  }

  const url = new URL(result.url);
  const token = url.searchParams.get('token');

  if (!token) {
    throw new Error('Token não recebido do Google.');
  }

  await setAuthToken(token);

  const user: User = {
    id: Number(url.searchParams.get('id')),
    name: url.searchParams.get('name') ?? '',
    email: url.searchParams.get('email') ?? '',
    avatar_url: null,
    subscription_tier: (url.searchParams.get('subscription_tier') as 'free' | 'pro') ?? 'free',
    has_password: false,
  };

  return user;
}
