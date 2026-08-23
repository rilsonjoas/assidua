// Web Push & Browser Notifications implementation for Web platform (2026-08-23).
//
// Metro resolve `.web.ts` no lugar de `.ts` no bundle web.
// Suporta a API nativa Notification do navegador para solicitar permissões
// e exibir alertas de doses e estoque em desktops e navegadores.

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

export function showWebNotification(title: string, options?: NotificationOptions): void {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });
    } catch {
      // Ignore notification display errors on unsupported browser states
    }
  }
}

export async function scheduleScheduleNotifications(params: {
  scheduleId: number;
  time: string;
  days_of_week: number[] | null;
  interval_hours?: number | null;
  medicationName: string;
  dosage: string | null;
  unit: string;
}): Promise<void> {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    showWebNotification(`Lembrete: ${params.medicationName}`, {
      body: `Horário de tomar ${params.medicationName}${params.dosage ? ` (${params.dosage} ${params.unit})` : ''} - ${params.time}`,
      tag: `schedule_${params.scheduleId}`,
    });
  }
}

export async function scheduleRefillAlert(params: {
  medicationId: number;
  medicationName: string;
  daysRemaining: number | null;
  thresholdDays: number;
}): Promise<void> {
  if (
    params.daysRemaining !== null &&
    params.daysRemaining <= params.thresholdDays &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    showWebNotification(`Aviso de Estoque Baixo: ${params.medicationName}`, {
      body: `O remédio ${params.medicationName} está acabando (restam ${params.daysRemaining} dias).`,
      tag: `refill_${params.medicationId}`,
    });
  }
}

export async function registerPushToken(): Promise<void> {
  // Web push token handling for desktop browsers
}

export async function cancelScheduleNotifications(scheduleId: number): Promise<void> {
  void scheduleId;
}
