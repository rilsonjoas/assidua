// Shim WEB de services/notifications.ts (W0, 2026-08-22).
//
// Metro resolve `.web.ts` no lugar de `.ts` no bundle web.
//
// Lembretes locais (expo-notifications) não existem no browser — a v1
// web é honesta sobre isso: as funções viram no-op e
// `requestNotificationPermission` retorna false, então as telas tratam
// a web como "sem permissão" e nunca oferecem o que não existe.
// Web Push (VAPID) fica pra W3, como canal adicional do push por
// servidor que já roda no backend.

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
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
  void params;
}

export async function scheduleRefillAlert(params: {
  medicationId: number;
  medicationName: string;
  daysRemaining: number | null;
  thresholdDays: number;
}): Promise<void> {
  void params;
}

export async function registerPushToken(): Promise<void> {}

export async function cancelScheduleNotifications(scheduleId: number): Promise<void> {
  void scheduleId;
}
