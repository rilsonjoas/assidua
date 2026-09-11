import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { requestNotificationPermission, scheduleScheduleNotifications, scheduleRefillAlert } from '../services/notifications.web';
import { usePrivacyStore } from '../store/privacyStore';

describe('notifications.web', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna false para permissão quando Notification não está disponível', async () => {
    const granted = await requestNotificationPermission();
    expect(granted).toBe(false);
  });

  it('executa scheduleScheduleNotifications sem lançar exceções no ambiente web', async () => {
    await expect(
      scheduleScheduleNotifications({
        scheduleId: 1,
        time: '08:00',
        days_of_week: null,
        medicationName: 'Dipirona',
        dosage: '500',
        unit: 'mg',
      })
    ).resolves.not.toThrow();
  });

  it('executa scheduleRefillAlert sem lançar exceções', async () => {
    await expect(
      scheduleRefillAlert({
        medicationId: 10,
        medicationName: 'Paracetamol',
        daysRemaining: 2,
        thresholdDays: 5,
      })
    ).resolves.not.toThrow();
  });
});

// "Modo Privacidade" também nas notificações web (2026-09-11) — mesmo
// achado/mesma correção da versão nativa, ver `notifications.test.ts`
// e o comentário completo em `services/notifications.web.ts`. Este
// ambiente de teste não tem `window.Notification` de verdade (por isso
// os testes acima só checam "não lança exceção") — aqui mockamos o
// construtor pra poder inspecionar o título/corpo de verdade.
describe('notifications.web — Modo Privacidade mascara o nome do remédio', () => {
  const mockNotificationCtor = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    usePrivacyStore.setState({ isPrivate: false });
    (global as any).window = (global as any).window ?? {};
    class FakeNotification {
      static permission = 'granted';
      constructor(title: string, options?: NotificationOptions) {
        mockNotificationCtor(title, options);
      }
    }
    (global as any).window.Notification = FakeNotification;
    (global as any).Notification = FakeNotification;
  });

  afterEach(() => {
    usePrivacyStore.setState({ isPrivate: false });
    delete (global as any).window.Notification;
    delete (global as any).Notification;
  });

  it('com o modo desligado, mostra o nome real', async () => {
    await scheduleScheduleNotifications({
      scheduleId: 1, time: '08:00', days_of_week: null,
      medicationName: 'Dipirona', dosage: '500', unit: 'mg',
    });

    expect(mockNotificationCtor).toHaveBeenCalledWith('Lembrete: Dipirona', expect.anything());
  });

  it('com o modo ligado, esconde o nome do remédio no lembrete de dose', async () => {
    usePrivacyStore.setState({ isPrivate: true });

    await scheduleScheduleNotifications({
      scheduleId: 1, time: '08:00', days_of_week: null,
      medicationName: 'Dipirona', dosage: '500', unit: 'mg',
    });

    const [title, options] = mockNotificationCtor.mock.calls[0] as [string, { body: string }];
    expect(title).not.toContain('Dipirona');
    expect(options.body).not.toContain('Dipirona');
  });

  it('com o modo ligado, esconde o nome do remédio no alerta de estoque', async () => {
    usePrivacyStore.setState({ isPrivate: true });

    await scheduleRefillAlert({
      medicationId: 10, medicationName: 'Paracetamol', daysRemaining: 2, thresholdDays: 5,
    });

    const [title, options] = mockNotificationCtor.mock.calls[0] as [string, { body: string }];
    expect(title).not.toContain('Paracetamol');
    expect(options.body).not.toContain('Paracetamol');
  });
});
