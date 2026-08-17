import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

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
  await api.post('/auth/magic-link', name ? { email, name } : { email });
}

export async function logout() {
  await api.post('/auth/logout');
  await SecureStore.deleteItemAsync('auth_token');
}

export async function deleteAccount(password?: string) {
  await api.delete('/auth/account', { data: password ? { password } : undefined });
  await SecureStore.deleteItemAsync('auth_token');
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

  await SecureStore.setItemAsync('auth_token', token);

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
