import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Axios mockado à mão: a instância que `axios.create()` devolve vira a
// própria `api` exportada por services/api.ts. Ela precisa ser chamável
// (pra simular o retry `return api(originalRequest)`) e expor
// `.interceptors.request.use` / `.interceptors.response.use` — o handler
// de erro capturado aqui é chamado direto em cada teste pra simular os
// cenários (401, erro de rede, refresh falhando, refresh concorrente),
// sem precisar de um servidor de verdade.
//
// Tudo isso vive DENTRO do factory do jest.mock (em vez de em variáveis
// do escopo do arquivo) porque `jest.mock(...)` é hoisted pro topo do
// arquivo pelo babel-plugin-jest-hoist — uma variável declarada depois
// dele no código-fonte ainda não existe quando o factory roda de
// verdade (na primeira vez que `services/api.ts` importa `axios`).
jest.mock('axios', () => {
  const apiInstance: any = jest.fn(async () => ({ data: 'retried' }));
  let responseErrorHandler: ((error: any) => any) | undefined;
  apiInstance.interceptors = {
    request: { use: jest.fn() },
    response: {
      use: jest.fn((_success: any, errorHandler: any) => {
        responseErrorHandler = errorHandler;
      }),
    },
  };
  const post = jest.fn();
  const mockHandle = {
    apiInstance,
    post,
    getResponseErrorHandler: () => responseErrorHandler!,
  };
  return {
    __esModule: true,
    // `import axios from 'axios'` resolve pro objeto `default` via
    // interop — por isso `__mock` mora dentro dele, não ao lado.
    default: {
      create: jest.fn(() => apiInstance),
      post,
      __mock: mockHandle,
    },
  };
});

import axios from 'axios';
import { getAuthToken, setAuthToken } from '../services/tokenStorage';
// Só precisa rodar pra registrar os interceptors no mock acima — não usa
// o export `api` diretamente, os testes disparam o handler capturado.
import '../services/api';

const mockAxios = axios as any;
const mockApiInstance = mockAxios.__mock.apiInstance;
const mockPost = mockAxios.__mock.post;
const getResponseErrorHandler = mockAxios.__mock.getResponseErrorHandler as () => (error: any) => any;

function makeError({
  status,
  url = '/medications',
  networkError = false,
}: {
  status?: number;
  url?: string;
  networkError?: boolean;
}) {
  const originalRequest: any = { url, headers: { Authorization: 'Bearer token-velho' } };
  return {
    config: originalRequest,
    response: networkError ? undefined : { status },
  };
}

describe('services/api — interceptor de refresh de token (2026-08-23)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockApiInstance.mockClear();
    mockApiInstance.mockResolvedValue({ data: 'retried' });
    await setAuthToken('token-velho');
  });

  it('erro de rede (offline/timeout/ENOTFOUND) nunca apaga o token', async () => {
    const handler = getResponseErrorHandler();
    const error = makeError({ networkError: true });

    await expect(handler(error)).rejects.toBe(error);

    expect(mockPost).not.toHaveBeenCalled();
    expect(await getAuthToken()).toBe('token-velho');
  });

  it('401 renova o token via /auth/refresh e repete a request original', async () => {
    const handler = getResponseErrorHandler();
    mockPost.mockResolvedValueOnce({ data: { token: 'token-novo' } });
    const error = makeError({ status: 401 });

    await handler(error);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(await getAuthToken()).toBe('token-novo');
    expect(mockApiInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-novo' }),
      }),
    );
  });

  it('refresh que também toma 401/403 apaga o token local', async () => {
    const handler = getResponseErrorHandler();
    mockPost.mockRejectedValueOnce({ response: { status: 401 } });
    const error = makeError({ status: 401 });

    await expect(handler(error)).rejects.toBe(error);

    expect(await getAuthToken()).toBeNull();
  });

  it('refresh falhando por erro de rede NÃO apaga o token (pode tentar de novo depois)', async () => {
    const handler = getResponseErrorHandler();
    mockPost.mockRejectedValueOnce({ response: undefined });
    const error = makeError({ status: 401 });

    await expect(handler(error)).rejects.toBe(error);

    expect(await getAuthToken()).toBe('token-velho');
  });

  it('/auth/logout com 401 não tenta renovar — só rejeita (quem limpa o token é o logout())', async () => {
    const handler = getResponseErrorHandler();
    const error = makeError({ status: 401, url: '/auth/logout' });

    await expect(handler(error)).rejects.toBe(error);

    expect(mockPost).not.toHaveBeenCalled();
    expect(await getAuthToken()).toBe('token-velho');
  });

  it('duas requests em 401 ao mesmo tempo compartilham UM único refresh, sem apagar o token novo (achado real: race condition)', async () => {
    const handler = getResponseErrorHandler();
    mockPost.mockResolvedValueOnce({ data: { token: 'token-novo' } });

    const error1 = makeError({ status: 401, url: '/medications' });
    const error2 = makeError({ status: 401, url: '/profiles' });

    const [result1, result2] = await Promise.allSettled([handler(error1), handler(error2)]);

    // Só UMA chamada de rede pro /auth/refresh, mesmo com dois 401 concorrentes.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(await getAuthToken()).toBe('token-novo');
    expect(result1.status).toBe('fulfilled');
    expect(result2.status).toBe('fulfilled');
  });

  it('depois que o refresh em voo termina, uma nova rodada de 401 dispara um refresh novo', async () => {
    const handler = getResponseErrorHandler();
    mockPost.mockResolvedValueOnce({ data: { token: 'token-novo-1' } });
    await handler(makeError({ status: 401, url: '/a' }));
    expect(await getAuthToken()).toBe('token-novo-1');

    mockPost.mockResolvedValueOnce({ data: { token: 'token-novo-2' } });
    await handler(makeError({ status: 401, url: '/b' }));

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(await getAuthToken()).toBe('token-novo-2');
  });
});
