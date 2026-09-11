import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { formatDosageUnit, getMedications } from './medications';
import { usePrivacyStore } from '../store/privacyStore';

// "Modo Privacidade" também nas notificações (2026-09-11, achado real
// do Rilson: a tela de bloqueio é a superfície mais exposta de todas —
// nem precisa desbloquear o aparelho — e era a única coisa no app que
// ignorava o Modo Privacidade). Lê o estado global direto (mesmo
// padrão não-hook já usado em `lib/privacy.ts`/`services/sync.ts`), no
// momento em que a notificação é AGENDADA — decisão confirmada com o
// Rilson: aceitável o texto só atualizar na próxima vez que o lembrete
// for recriado (editar remédio/horário, etc.), não precisa reagendar
// tudo na hora que a pessoa liga/desliga o modo.
function doseTitle(medicationName: string): string {
  return usePrivacyStore.getState().isPrivate
    ? 'Hora de tomar seu remédio'
    : `Hora de tomar ${medicationName}`;
}

function refillBody(medicationName: string, daysRemaining: number): string {
  const subject = usePrivacyStore.getState().isPrivate ? 'Um remédio' : medicationName;
  return `${subject} vai acabar em ${daysRemaining} dia${daysRemaining === 1 ? '' : 's'}. Hora de repor.`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// "Permissão negada é invisível pra sempre" (2026-09-11, achado real do
// Rilson revendo o app) — antes disto, a permissão só era pedida 1 vez
// no onboarding; se a pessoa negasse (ou revogasse depois, nas configs
// do aparelho), os lembretes paravam de chegar sem NENHUM aviso em
// lugar nenhum. Usado por `components/NotificationPermissionBanner.tsx`,
// que reconsulta sempre que o app volta a ficar ativo (AppState) — pega
// tanto quem nunca autorizou quanto quem revogou depois, fora do app.
export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

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
  // (api/app/Actions/GenerateScheduleOccurrences.php).
  //
  // Achado real do Rilson (2026-09-09): quando a âncora não divide 24h
  // de forma exata (ex.: 10:00 de 8 em 8h — 10h, 18h, 02h do dia
  // seguinte), o cálculo andava só pra frente e nunca gerava o lembrete
  // que "atravessa" a meia-noite (02h aqui) — a pessoa nunca era
  // avisada pra tomar essa dose, em dia nenhum. Corrigido andando pra
  // trás a partir da âncora primeiro (mesmo achado/conserto do
  // backend), só então pra frente até (sem ultrapassar) a meia-noite.
  if (interval_hours != null) {
    const occurrences: { hour: number; minute: number }[] = [];
    const intervalMinutes = interval_hours * 60;
    let totalMinutes = hour * 60 + minute;
    while (totalMinutes - intervalMinutes >= 0) {
      totalMinutes -= intervalMinutes;
    }
    const endOfDayMinutes = 23 * 60 + 59; // mesmo corte de "endOfDay" do backend
    while (totalMinutes <= endOfDayMinutes) {
      occurrences.push({ hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
      totalMinutes += intervalMinutes;
    }

    await Promise.all(
      occurrences.map((occ, index) =>
        Notifications.scheduleNotificationAsync({
          identifier: `schedule_${scheduleId}_interval_${index}`,
          content: {
            title: doseTitle(medicationName),
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
        title: doseTitle(medicationName),
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
          title: doseTitle(medicationName),
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
      body: refillBody(medicationName, daysRemaining),
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

// "Recalcular hoje" resincroniza os lembretes locais (2026-09-08,
// revisitando a limitação aceita do item 8). O gatilho DAILY do Expo
// não tem conceito de "só hoje" — cancelar o recorrente de hoje também
// cancelaria o de amanhã, e restaurar depois exigiria um job de
// background (nada garantido sem o app aberto, mesmo risco/esforço já
// descartado antes). Em vez de mexer no recorrente, ADICIONA lembretes
// avulsos (gatilho `DATE`, dispara uma vez só) nos horários novos de
// hoje. O recorrente antigo continua existindo e ainda dispara nos
// horários de antes — não é perfeito (pode chegar um aviso a mais, no
// horário velho), mas resolve o problema real (não ficar SEM aviso no
// horário novo) sem arriscar quebrar os lembretes de amanhã.
export async function rescheduleTodayOccurrences(params: {
  scheduleId: number;
  todayOccurrences: string[]; // ISO — vem de recalculateScheduleToday
  medicationName: string;
  dosage: string | null;
  unit: string;
}): Promise<void> {
  const { scheduleId, todayOccurrences, medicationName, dosage, unit } = params;
  const body = formatDosageUnit(dosage, unit);
  const prefix = `schedule_${scheduleId}_todayOverride_`;

  // Cancela avulsos de uma recalculada anterior no mesmo dia, senão
  // recalcular duas vezes seguidas acumula lembretes duplicados.
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const now = Date.now();
  await Promise.all(
    todayOccurrences
      .map((iso) => new Date(iso))
      // Só o que ainda vai acontecer — agendar gatilho DATE no passado
      // dispara na hora (ou dá erro, dependendo da versão do SO).
      .filter((date) => date.getTime() > now)
      .map((date, index) =>
        Notifications.scheduleNotificationAsync({
          identifier: `${prefix}${index}`,
          content: {
            title: doseTitle(medicationName),
            body,
            sound: true,
            data: { scheduleId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
          },
        }),
      ),
  );
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

// Achado real do Rilson (2026-09-11): notificação chegando de remédio
// que não está mais na lista de hoje (ex.: "Vick Vaporub", "Dorflex",
// "Pantoprazol" — nada disso existe mais no perfil ativo). Causa raiz:
// todo cancelamento acima é OPORTUNISTA — só roda no caminho de UI que
// pausa/edita/exclui um horário (medication/[id].tsx). O gatilho DAILY
// do SO fica agendado pra sempre até alguém cancelar explicitamente;
// "excluir medicamento" só passou a cancelar a partir de 08/09 (3 dias
// atrás) — qualquer remédio apagado ANTES disso ficou com a
// notificação órfã, tocando todo dia, sem nenhum jeito de se
// autocorrigir. Esta função varre TUDO que está agendado no SO e
// cancela o que não corresponde a nenhum schedule ativo de nenhum
// perfil da conta (não só o perfil ativo no momento — um cuidador quer
// continuar sendo avisado do remédio do paciente mesmo com outra aba
// aberta). Roda 1x por abertura do app (ver app/_layout.tsx), no mesmo
// lugar que já resincroniza push token — barata (só GETs), e cobre
// tanto o histórico órfão quanto qualquer futuro caminho de mutação
// que a gente esqueça de cancelar.
export async function reconcileScheduledNotifications(): Promise<void> {
  const { data: profiles } = await api.get('/profiles');
  const medicationsByProfile = await Promise.all(
    (profiles as Array<{ id: number }>).map((p) => getMedications(p.id).catch(() => [])),
  );
  const liveScheduleIds = new Set(
    medicationsByProfile
      .flat()
      .filter((m) => m.is_active && !m.is_paused)
      .flatMap((m) => m.schedules.filter((s) => s.is_active).map((s) => s.id)),
  );

  const all = await Notifications.getAllScheduledNotificationsAsync();
  const orphaned = all.filter((n) => {
    const match = n.identifier.match(/^schedule_(\d+)_/);
    if (!match) return false; // não mexe em refill_/outros tipos de aviso
    return !liveScheduleIds.has(Number(match[1]));
  });
  await Promise.all(orphaned.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}
