import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Achado real de uso (2026-08-14), corrigido no mesmo dia: schedule de
// intervalo (ex.: de 8 em 8h) gera mais de uma dose por dia, mas o
// lembrete local era agendado só no horário-âncora, 1x/dia. Este arquivo
// testa scheduleScheduleNotifications isoladamente (mockando o SDK do
// Expo) pra travar o cálculo de ocorrências — os testes de tela mockam
// o módulo inteiro e não pegariam uma regressão aqui.
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn<(...args: unknown[]) => Promise<void>>();
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

// reconcileScheduledNotifications (2026-09-11) — busca perfis/remédios
// via api.get/getMedications, não via módulo nativo; mock próprio,
// controlado por teste, em vez de bater na rede de verdade.
const mockApiGet = jest.fn<(url: string) => Promise<{ data: unknown }>>();
jest.mock('../services/api', () => ({ api: { get: (url: string) => mockApiGet(url) } }));

import {
  scheduleScheduleNotifications,
  rescheduleTodayOccurrences,
  reconcileScheduledNotifications,
  scheduleRefillAlert,
} from '../services/notifications';
import { usePrivacyStore } from '../store/privacyStore';

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

  // Achado real do Rilson (2026-09-09) — Ibuprofeno de 8 em 8h a
  // partir das 10h no aparelho dele: o lembrete das 02h (ocorrência que
  // "atravessa" a meia-noite, calculada pra trás a partir da âncora)
  // nunca era agendado — a pessoa nunca era avisada pra tomar essa
  // dose, em dia nenhum. Mesmo conserto do backend
  // (GenerateScheduleOccurrences), espelhado aqui.
  it('de 8 em 8h a partir das 10:00 agenda 3 lembretes (02:00, 10:00, 18:00), incluindo o de madrugada', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 6,
      time: '10:00',
      days_of_week: null,
      interval_hours: 8,
      medicationName: 'Ibuprofeno',
      dosage: '1',
      unit: 'comprimido',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(3);
    const hours = mockScheduleNotificationAsync.mock.calls.map((c: any) => c[0].trigger.hour);
    expect(hours).toEqual([2, 10, 18]);
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

// Achado real do Rilson (2026-09-11): notificação chegando de remédio
// que não existe mais na lista de hoje ("Vick Vaporub", "Dorflex",
// "Pantoprazol" — nenhum dos 3 estava mais cadastrado). Causa raiz: o
// gatilho DAILY do SO fica agendado pra sempre até alguém cancelar
// explicitamente, e "excluir medicamento" só passou a cancelar a
// partir de 08/09 — qualquer remédio apagado antes disso ficou com
// notificação órfã. reconcileScheduledNotifications varre tudo
// agendado no SO contra o estado real (todos os perfis da conta, não
// só o ativo) e cancela o que sobrou.
describe('reconcileScheduledNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancela notificação de schedule que não existe mais em nenhum perfil', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/profiles') return { data: [{ id: 1 }] };
      // /profiles/1/medications — nenhum remédio tem mais o schedule 99
      // (o "Vick Vaporub" do achado real: apagado, notificação ficou).
      return { data: [] };
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'schedule_99_daily' },
    ]);

    await reconcileScheduledNotifications();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('schedule_99_daily');
  });

  it('não cancela notificação de schedule ativo de verdade', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/profiles') return { data: [{ id: 1 }] };
      return {
        data: [
          {
            id: 10,
            is_active: true,
            is_paused: false,
            schedules: [{ id: 7, is_active: true }],
          },
        ],
      };
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'schedule_7_daily' },
    ]);

    await reconcileScheduledNotifications();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancela notificação de remédio pausado (is_paused true continua "existindo", mas não deveria mais avisar)', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/profiles') return { data: [{ id: 1 }] };
      return {
        data: [
          { id: 10, is_active: true, is_paused: true, schedules: [{ id: 7, is_active: true }] },
        ],
      };
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'schedule_7_daily' },
    ]);

    await reconcileScheduledNotifications();

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('schedule_7_daily');
  });

  it('considera schedules de TODOS os perfis da conta, não só um', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/profiles') return { data: [{ id: 1 }, { id: 2 }] };
      if (url === '/profiles/1/medications') {
        return { data: [{ id: 10, is_active: true, is_paused: false, schedules: [{ id: 7, is_active: true }] }] };
      }
      // Schedule do perfil 2 (ex.: paciente sob cuidado) — deve continuar
      // avisando mesmo sem ser o perfil ativo na tela no momento.
      return { data: [{ id: 20, is_active: true, is_paused: false, schedules: [{ id: 8, is_active: true }] }] };
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'schedule_7_daily' },
      { identifier: 'schedule_8_daily' },
    ]);

    await reconcileScheduledNotifications();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('não mexe em notificações que não são de schedule (ex.: refill_)', async () => {
    mockApiGet.mockImplementation(async (url: string) => {
      if (url === '/profiles') return { data: [{ id: 1 }] };
      return { data: [] };
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'refill_10' },
    ]);

    await reconcileScheduledNotifications();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

// "Modo Privacidade" também nas notificações (2026-09-11, achado real
// do Rilson: a tela de bloqueio é a superfície mais exposta de todas,
// e era a única coisa no app que ignorava o Modo Privacidade). Lê
// `usePrivacyStore` no momento em que a notificação é AGENDADA — ver
// comentário completo em `services/notifications.ts`.
describe('Modo Privacidade — notificações não revelam o nome do remédio quando ligado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
    usePrivacyStore.setState({ isPrivate: false });
  });

  afterEach(() => {
    usePrivacyStore.setState({ isPrivate: false });
  });

  it('scheduleScheduleNotifications: com o modo desligado, título mostra o nome real', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 8, time: '08:00', days_of_week: null,
      medicationName: 'Losartana', dosage: '50', unit: 'mg',
    });

    expect((mockScheduleNotificationAsync.mock.calls[0] as any)[0].content.title).toBe('Hora de tomar Losartana');
  });

  it('scheduleScheduleNotifications: com o modo ligado, título vira genérico (sem o nome)', async () => {
    usePrivacyStore.setState({ isPrivate: true });

    await scheduleScheduleNotifications({
      scheduleId: 8, time: '08:00', days_of_week: null,
      medicationName: 'Losartana', dosage: '50', unit: 'mg',
    });

    const title = (mockScheduleNotificationAsync.mock.calls[0] as any)[0].content.title;
    expect(title).toBe('Hora de tomar seu remédio');
    expect(title).not.toContain('Losartana');
  });

  it('rescheduleTodayOccurrences: com o modo ligado, título também vira genérico', async () => {
    usePrivacyStore.setState({ isPrivate: true });
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T14:00:00.000Z'));

    await rescheduleTodayOccurrences({
      scheduleId: 7,
      todayOccurrences: ['2026-08-08T18:00:00+00:00'],
      medicationName: 'Losartana',
      dosage: '50',
      unit: 'mg',
    });

    const title = (mockScheduleNotificationAsync.mock.calls[0] as any)[0].content.title;
    expect(title).not.toContain('Losartana');
    jest.useRealTimers();
  });

  it('scheduleRefillAlert: com o modo desligado, título e corpo mostram o nome real', async () => {
    await scheduleRefillAlert({
      medicationId: 10, medicationName: 'Losartana', daysRemaining: 3, thresholdDays: 7,
    });

    const call = (mockScheduleNotificationAsync.mock.calls[0] as any)[0];
    expect(call.content.title).toBe('Estoque acabando');
    expect(call.content.body).toContain('Losartana');
  });

  it('scheduleRefillAlert: com o modo ligado, corpo vira genérico (sem o nome)', async () => {
    usePrivacyStore.setState({ isPrivate: true });

    await scheduleRefillAlert({
      medicationId: 10, medicationName: 'Losartana', daysRemaining: 3, thresholdDays: 7,
    });

    const call = (mockScheduleNotificationAsync.mock.calls[0] as any)[0];
    expect(call.content.body).not.toContain('Losartana');
    expect(call.content.body).toContain('Um remédio vai acabar em 3 dias');
  });
});
