// Web Push & Browser Notifications implementation for Web platform (2026-08-23).
//
// Metro resolve `.web.ts` no lugar de `.ts` no bundle web.
// Suporta a API nativa Notification do navegador para solicitar permissões
// e exibir alertas de doses e estoque em desktops e navegadores.

import { usePrivacyStore } from '../store/privacyStore';

// Mesmo achado/mesma correção da versão nativa (2026-09-11) — ver
// `services/notifications.ts` pro comentário completo. Duplicado aqui
// (não extraído pra um arquivo `.ts` neutro) só porque as duas
// implementações já divergem bastante no resto da função; o helper em
// si é pequeno o bastante pra não valer a indireção.
function maskedName(name: string): string {
  return usePrivacyStore.getState().isPrivate ? 'seu remédio' : name;
}

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

// Banner de permissão (2026-09-11) — mesma assinatura da nativa.
// `Notification.permission` do navegador já usa exatamente esses 3
// valores ('granted'/'denied'/'default'), só 'default' precisa virar
// 'undetermined' pra bater com o tipo compartilhado.
export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'undetermined';
  }
  return Notification.permission === 'default' ? 'undetermined' : Notification.permission;
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
    const name = maskedName(params.medicationName);
    showWebNotification(`Lembrete: ${name}`, {
      body: `Horário de tomar ${name}${params.dosage ? ` (${params.dosage} ${params.unit})` : ''} - ${params.time}`,
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
    const isPrivate = usePrivacyStore.getState().isPrivate;
    const title = isPrivate ? 'Aviso de Estoque Baixo' : `Aviso de Estoque Baixo: ${params.medicationName}`;
    const subject = isPrivate ? 'Um remédio' : params.medicationName;
    showWebNotification(title, {
      body: `${subject} está acabando (restam ${params.daysRemaining} dias).`,
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

// No-op no web (2026-09-11) — sem contraparte da nativa: nada aqui fica
// "agendado" no SO pra virar órfão, a notificação web é disparada na
// hora (ver showWebNotification) e não persiste entre sessões. Existe
// só pra manter a mesma assinatura importável de app/_layout.tsx nas
// duas plataformas.
export async function reconcileScheduledNotifications(): Promise<void> {}
