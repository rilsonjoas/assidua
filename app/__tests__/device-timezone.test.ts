import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getDeviceTimezone, syncOwnedProfileTimezones } from '../services/device';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: { put: jest.fn() },
}));

const mockedApi = jest.mocked(api);

describe('services/device — autocorreção de fuso (2026-08-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.put.mockResolvedValue({ data: {} } as any);
  });

  it('getDeviceTimezone retorna um identificador IANA não vazio', () => {
    const tz = getDeviceTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('atualiza só perfis próprios com fuso desatualizado', async () => {
    const deviceTz = getDeviceTimezone();
    // Valor "desatualizado" precisa ser garantidamente diferente do fuso
    // real da máquina rodando o teste — 'UTC' sozinho falha se a própria
    // máquina de CI/dev estiver configurada em UTC.
    const staleTz = deviceTz === 'UTC' ? 'America/Sao_Paulo' : 'UTC';
    const profiles = [
      { id: 1, is_owner: true, timezone: staleTz }, // desatualizado, próprio -> atualiza
      { id: 2, is_owner: true, timezone: deviceTz }, // já certo -> não mexe
      { id: 3, is_owner: false, timezone: staleTz }, // compartilhado -> não mexe
      { id: 4, timezone: staleTz }, // is_owner ausente = próprio (padrão histórico) -> atualiza
    ];

    await syncOwnedProfileTimezones(profiles);

    expect(mockedApi.put).toHaveBeenCalledTimes(2);
    expect(mockedApi.put).toHaveBeenCalledWith('/profiles/1', { timezone: deviceTz });
    expect(mockedApi.put).toHaveBeenCalledWith('/profiles/4', { timezone: deviceTz });
  });

  it('não quebra se a atualização falhar (best-effort)', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('offline'));

    await expect(
      syncOwnedProfileTimezones([{ id: 1, is_owner: true, timezone: 'UTC' }]),
    ).resolves.toBeUndefined();
  });
});
