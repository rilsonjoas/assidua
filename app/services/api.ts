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
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
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
      } catch {
        await deleteAuthToken();
      }
    } else if (error.response?.status === 401) {
      await deleteAuthToken();
    }
    return Promise.reject(error);
  }
);
