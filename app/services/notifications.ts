import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { formatDosageUnit } from './medications';

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
  interval_hours?: number | null;
  medicationName: string;
  dosage: string | null;
  unit: string;
}): Promise<void> {
  const { scheduleId, time, days_of_week, interval_hours, medicationName, dosage, unit } = params;
  const [hour, minute] = time.split(':').map(Number);
  const body = formatDosageUnit(dosage, unit);

  // Remove notificações antigas deste schedule antes de recriar
  await cancelScheduleNotifications(scheduleId);

  // Achado real de uso (2026-08-14), corrigido no mesmo dia: schedule de
  // intervalo (ex.: de 8 em 8h) gera mais de uma dose por dia — sem isto,
  // o lembrete local era agendado só no horário-âncora, 1x/dia, deixando
  // o remédio "sem aviso" nos horários seguintes mesmo com o backend
  // computando as ocorrências certinho. Espelha GenerateScheduleOccurrences
  // (api/app/Actions/GenerateScheduleOccurrences.php): começa no
  // horário-âncora e repete de X em X horas até (sem ultrapassar) a
  // meia-noite do mesmo dia. O Expo não tem trigger nativo de "intervalo
  // dentro do dia", então isso vira N lembretes DAILY fixos, um por
  // ocorrência.
  if (interval_hours != null) {
    const occurrences: { hour: number; minute: number }[] = [];
    let totalMinutes = hour * 60 + minute;
    const endOfDayMinutes = 23 * 60 + 59; // mesmo corte de "endOfDay" do backend
    while (totalMinutes <= endOfDayMinutes) {
      occurrences.push({ hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
      totalMinutes += interval_hours * 60;
    }

    await Promise.all(
      occurrences.map((occ, index) =>
        Notifications.scheduleNotificationAsync({
          identifier: `schedule_${scheduleId}_interval_${index}`,
          content: {
            title: `Hora de tomar ${medicationName}`,
            body,
            sound: true,
            data: { scheduleId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: occ.hour,
            minute: occ.minute,
          },
        }),
      ),
    );
    return;
  }

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

// Fase 1.5, Etapa 4 — sem isto o backend nunca tem pra onde mandar o
// alerta de dose perdida pro cuidador. Chamada silenciosa (não trava
// nada se falhar — dispositivo físico/simulador sem push configurado
// não deveria quebrar o app) e best-effort: token pode mudar entre
// aberturas (reinstall, etc.), por isso é chamada a cada login/abertura,
// não só uma vez no onboarding.
export async function registerPushToken(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return; // dev local sem EAS configurado — não é erro

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.post('/push-tokens', {
      token: expoPushToken,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
    });
  } catch (err) {
    console.warn('[assidua] Falha ao registrar push token:', err);
  }
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
