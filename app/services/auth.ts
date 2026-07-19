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

export async function register(name: string, email: string, password: string, password_confirmation: string) {
  const { data } = await api.post('/auth/register', { name, email, password, password_confirmation });
  await SecureStore.setItemAsync('auth_token', data.token);
  return data.user as User;
}

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  await SecureStore.setItemAsync('auth_token', data.token);
  return data.user as User;
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
