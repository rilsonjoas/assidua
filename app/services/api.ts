import axios from 'axios';
import { getAuthToken, setAuthToken, deleteAuthToken } from './tokenStorage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh em voo único — achado real (2026-08-23): quando duas ou mais
// chamadas caem em 401 ao mesmo tempo (ex.: tela abre e dispara várias
// requests em paralelo logo quando o token expira), cada uma chamava
// /auth/refresh por conta própria. A primeira tinha sucesso e salvava o
// token novo; a segunda ainda usava o token velho (já invalidado pela
// primeira no backend), tomava 401 do próprio refresh e apagava o token
// novo que a primeira acabara de salvar — logout indevido mesmo com o
// token válido guardado segundos antes. Agora todo 401 concorrente
// aguarda a MESMA promise de refresh em vez de disparar uma nova.
let refreshPromise: Promise<string | null> | null = null;

function refreshToken(authHeader: string): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, {}, { headers: { Authorization: authHeader } })
      .then(async ({ data }) => {
        if (!data?.token) return null;
        await setAuthToken(data.token);
        return data.token as string;
      })
      .catch(async (refreshError: any) => {
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          await deleteAuthToken();
        }
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // Se for erro de rede (offline, timeout, ENOTFOUND), JAMAIS apaga o token!
    if (!error.response) {
      return Promise.reject(error);
    }

    if (error.response.status === 401 && originalRequest && !originalRequest._retry) {
      // /auth/logout já limpa o token localmente em qualquer cenário
      // (services/auth.ts) — se o próprio logout tomar 401 (token já
      // expirado), não vale a pena tentar renovar só pra deslogar.
      if (originalRequest.url?.includes('/auth/logout')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      const newToken = await refreshToken(originalRequest.headers.Authorization);
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);
