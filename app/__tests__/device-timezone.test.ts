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

  it('não quebra se a atualização falhar (best-effort) — devolve array vazio, não undefined', async () => {
    mockedApi.put.mockRejectedValueOnce(new Error('offline'));
    const deviceTz = getDeviceTimezone();
    const staleTz = deviceTz === 'UTC' ? 'America/Sao_Paulo' : 'UTC';

    // "Transparência total" (2026-09-11, entrevista de decisões de
    // horário — ver ROADMAP.md, item 1/6): a função deixou de devolver
    // `void` — agora devolve o que REALMENTE mudou, pro chamador (Home)
    // mostrar um toast. Uma falha silenciosa continua best-effort (não
    // lança), mas o resultado precisa refletir "nada mudou de verdade",
    // não `undefined`.
    await expect(
      syncOwnedProfileTimezones([{ id: 1, is_owner: true, timezone: staleTz }]),
    ).resolves.toEqual([]);
  });

  it('devolve o que mudou de verdade (profileId, fuso antigo e novo)', async () => {
    const deviceTz = getDeviceTimezone();
    const staleTz = deviceTz === 'UTC' ? 'America/Sao_Paulo' : 'UTC';

    const result = await syncOwnedProfileTimezones([{ id: 1, is_owner: true, timezone: staleTz }]);

    expect(result).toEqual([{ profileId: 1, oldTimezone: staleTz, newTimezone: deviceTz }]);
  });
});
