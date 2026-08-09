import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('doses', {
      name: 'Lembretes de doses',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleScheduleNotifications(params: {
  scheduleId: number;
  time: string; // "HH:mm"
  days_of_week: number[] | null; // null = todos os dias; 0=Dom, 6=Sáb
  medicationName: string;
  dosage: string;
  unit: string;
}): Promise<void> {
  const { scheduleId, time, days_of_week, medicationName, dosage, unit } = params;
  const [hour, minute] = time.split(':').map(Number);
  const body = `${dosage} ${unit}`;

  // Remove notificações antigas deste schedule antes de recriar
  await cancelScheduleNotifications(scheduleId);

  const everyDay = !days_of_week || days_of_week.length === 7;

  if (everyDay) {
    await Notifications.scheduleNotificationAsync({
      identifier: `schedule_${scheduleId}_daily`,
      content: {
        title: `Hora de tomar ${medicationName}`,
        body,
        sound: true,
        data: { scheduleId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } else {
    for (const day of days_of_week) {
      // Expo usa 1=Dom, 2=Seg, ..., 7=Sáb; backend usa 0=Dom, 6=Sáb
      const weekday = day + 1;
      await Notifications.scheduleNotificationAsync({
        identifier: `schedule_${scheduleId}_day_${day}`,
        content: {
          title: `Hora de tomar ${medicationName}`,
          body,
          sound: true,
          data: { scheduleId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        },
      });
    }
  }
}

// Refill alert inteligente (Fase 1) — agenda UM aviso local pra data em
// que o estoque acaba, se estiver dentro do horizonte de alerta. Cancela
// o aviso anterior desse medicamento antes (evita acumular vários se o
// usuário reabastecer e o dia mudar). Não agenda nada se days_remaining
// for null (sem schedule ativo) ou já tiver passado do limiar — não faz
// sentido notificar sobre algo 200 dias no futuro.
export async function scheduleRefillAlert(params: {
  medicationId: number;
  medicationName: string;
  daysRemaining: number | null;
  thresholdDays: number;
}): Promise<void> {
  const { medicationId, medicationName, daysRemaining, thresholdDays } = params;
  const identifier = `refill_${medicationId}`;

  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  if (daysRemaining === null || daysRemaining > thresholdDays) return;

  // Já acabou ou acaba hoje — não dá pra agendar gatilho no passado.
  if (daysRemaining <= 0) return;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Estoque acabando',
      body: `${medicationName} vai acabar em ${daysRemaining} dia${daysRemaining === 1 ? '' : 's'}. Hora de repor.`,
      sound: true,
      data: { medicationId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: daysRemaining * 24 * 60 * 60,
    },
  });
}

export async function cancelScheduleNotifications(scheduleId: number): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `schedule_${scheduleId}_`;
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}
