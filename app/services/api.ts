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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // Se for erro de rede (offline, timeout, ENOTFOUND), JAMAIS apaga o token!
    if (!error.response) {
      return Promise.reject(error);
    }

    if (error.response.status === 401 && originalRequest && !originalRequest._retry) {
      // Evita loop no /auth/refresh ou /auth/logout
      if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/logout')) {
        await deleteAuthToken();
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, {
          headers: { Authorization: originalRequest.headers.Authorization },
        });
        if (data?.token) {
          await setAuthToken(data.token);
          originalRequest.headers.Authorization = `Bearer ${data.token}`;
          return api(originalRequest);
        }
      } catch (refreshError: any) {
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          await deleteAuthToken();
        }
      }
    }
    return Promise.reject(error);
  }
);
