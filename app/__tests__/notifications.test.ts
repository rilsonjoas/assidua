import { describe, it, expect, beforeEach, jest } from '@jest/globals';

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
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));

import { scheduleScheduleNotifications } from '../services/notifications';

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
