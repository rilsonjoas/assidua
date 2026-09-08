import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Achado real de uso (2026-08-14), corrigido no mesmo dia: schedule de
// intervalo (ex.: de 8 em 8h) gera mais de uma dose por dia, mas o
// lembrete local era agendado só no horário-âncora, 1x/dia. Este arquivo
// testa scheduleScheduleNotifications isoladamente (mockando o SDK do
// Expo) pra travar o cálculo de ocorrências — os testes de tela mockam
// o módulo inteiro e não pegariam uma regressão aqui.
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn<(...args: unknown[]) => Promise<{ identifier: string }[]>>();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockGetAllScheduledNotificationsAsync(...args),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval', DATE: 'date' },
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { scheduleScheduleNotifications, rescheduleTodayOccurrences } from '../services/notifications';

describe('scheduleScheduleNotifications — modo intervalo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
  });

  it('de 8 em 8h a partir das 07:00 agenda 3 lembretes diários (07:00, 15:00, 23:00)', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 1,
      time: '07:00',
      days_of_week: null,
      interval_hours: 8,
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(3);
    const hours = mockScheduleNotificationAsync.mock.calls.map((c: any) => c[0].trigger.hour);
    const minutes = mockScheduleNotificationAsync.mock.calls.map((c: any) => c[0].trigger.minute);
    expect(hours).toEqual([7, 15, 23]);
    expect(minutes).toEqual([0, 0, 0]);
    // não deixa passar da meia-noite (07 + 8 + 8 + 8 = 31h, não vira "07:00" do dia seguinte aqui)
    expect(hours.every((h: number) => h < 24)).toBe(true);
  });

  it('de 12 em 12h a partir das 06:00 agenda 2 lembretes (06:00, 18:00), não 3', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 2,
      time: '06:00',
      days_of_week: null,
      interval_hours: 12,
      medicationName: 'Metformina',
      dosage: null,
      unit: 'mg',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const hours = mockScheduleNotificationAsync.mock.calls.map((c: any) => c[0].trigger.hour);
    expect(hours).toEqual([6, 18]);
  });

  it('cada ocorrência de intervalo vira um identifier único prefixado com o scheduleId (pra cancelamento funcionar)', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 5,
      time: '08:00',
      days_of_week: null,
      interval_hours: 6,
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    const identifiers = mockScheduleNotificationAsync.mock.calls.map((c: any) => c[0].identifier);
    expect(identifiers.every((id: string) => id.startsWith('schedule_5_'))).toBe(true);
    expect(new Set(identifiers).size).toBe(identifiers.length); // sem duplicatas
  });

  it('modo fixo (sem interval_hours) continua agendando 1 lembrete diário, sem regressão', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 3,
      time: '08:00',
      days_of_week: null,
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'schedule_3_daily',
        trigger: expect.objectContaining({ type: 'daily', hour: 8, minute: 0 }),
      }),
    );
  });
});

// "Recalcular hoje resincroniza notificações locais" (2026-09-08,
// revisitando a limitação aceita do item 8) — em vez de mexer no
// recorrente DAILY (cancelar hoje cancelaria amanhã também, sem
// conceito de "só hoje" no Expo), adiciona lembretes avulsos (gatilho
// DATE, uma vez só) nos horários novos de hoje.
describe('rescheduleTodayOccurrences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T14:00:00.000Z'));
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('agenda um lembrete avulso (gatilho DATE) por ocorrência futura de hoje', async () => {
    await rescheduleTodayOccurrences({
      scheduleId: 7,
      todayOccurrences: ['2026-08-08T18:00:00+00:00', '2026-08-09T02:00:00+00:00'],
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const calls = mockScheduleNotificationAsync.mock.calls as any[];
    expect(calls[0][0].trigger).toEqual({ type: 'date', date: new Date('2026-08-08T18:00:00+00:00') });
    expect(calls[0][0].identifier).toBe('schedule_7_todayOverride_0');
    expect(calls[0][0].content.title).toContain('Losartana');
  });

  it('não agenda ocorrência que já passou (evita disparo imediato/erro)', async () => {
    await rescheduleTodayOccurrences({
      scheduleId: 7,
      // 14h "agora" (ver beforeEach) — 10h já passou, 18h ainda não.
      todayOccurrences: ['2026-08-08T10:00:00+00:00', '2026-08-08T18:00:00+00:00'],
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect((mockScheduleNotificationAsync.mock.calls[0] as any)[0].trigger.date).toEqual(
      new Date('2026-08-08T18:00:00+00:00'),
    );
  });

  it('cancela avulsos de uma recalculada anterior antes de agendar os novos (sem acumular duplicata)', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'schedule_7_todayOverride_0' },
      { identifier: 'schedule_7_todayOverride_1' },
      // Recorrente normal — não é dessa recalculada, não deve ser tocado.
      { identifier: 'schedule_7_interval_0' },
    ]);

    await rescheduleTodayOccurrences({
      scheduleId: 7,
      todayOccurrences: ['2026-08-08T18:00:00+00:00'],
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('schedule_7_todayOverride_0');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('schedule_7_todayOverride_1');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalledWith('schedule_7_interval_0');
  });
});
