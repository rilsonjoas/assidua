import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { requestNotificationPermission, scheduleScheduleNotifications, scheduleRefillAlert } from '../services/notifications.web';

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
