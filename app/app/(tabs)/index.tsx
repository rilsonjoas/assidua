import { useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  Platform,
  Image,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { useToastStore } from '../../store/toastStore';
import { maskMedicationName, togglePrivacyWithHint } from '../../lib/privacy';
import { getTodayDoses, getAdherenceStreak, logDose, undoDose, reactToDose, DoseLog } from '../../services/doses';
import { LOW_STOCK_DAYS_THRESHOLD, formatDosageUnit, recalculateScheduleToday, updateSchedule } from '../../services/medications';
import { api } from '../../services/api';
import { syncOwnedProfileTimezones } from '../../services/device';
import { rescheduleTodayOccurrences, scheduleScheduleNotifications } from '../../services/notifications';
export { ErrorBoundary } from '../../components/ErrorBoundary';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { AdherenceRing } from '../../components/AdherenceRing';
import { isNetworkError } from '../../services/sync';
import { enqueueLog, enqueueUndo, cancelPendingLog, applyPendingOverlay } from '../../services/offlineQueue';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';
import { useAlertDialog } from '../../hooks/useAlertDialog';

// Picker nativo de horário (2026-09-11) — módulo nativo, pode não
// existir ainda num build EAS anterior à instalação desse pacote (mesmo
// achado real documentado em medication/[id].tsx pra expo-image-picker:
// import estático no topo travaria a ROTA INTEIRA num build sem o
// código nativo compilado, antes até de renderizar). `require` tardio +
// cache no resultado (não tenta de novo a cada toque, mas também não
// roda no boot do app).
let cachedDateTimePicker: typeof import('@react-native-community/datetimepicker').default | null | undefined;
function getDateTimePicker() {
  if (cachedDateTimePicker === undefined) {
    try {
      cachedDateTimePicker = require('@react-native-community/datetimepicker').default;
    } catch {
      cachedDateTimePicker = null;
    }
  }
  return cachedDateTimePicker;
}

// Atalhos do modal "Foi em outro horário?" (2026-09-11) — cobrem o caso
// comum ("tomei há pouco, num horário diferente do previsto") sem
// exigir leitura/digitação de hora nenhuma. "Agora" fica incluído por
// simetria (chegar aqui sem querer, ou mudar de ideia, não deveria
// forçar cancelar e voltar pro botão "Tomei" principal).
const QUICK_TIME_OFFSETS: Array<{ minutes: number; labelKey: string }> = [
  { minutes: 0, labelKey: 'home.quickTimeNow' },
  { minutes: 15, labelKey: 'home.quickTime15' },
  { minutes: 30, labelKey: 'home.quickTime30' },
  { minutes: 60, labelKey: 'home.quickTime60' },
];

// "Atrasado"/"Perdido" — dois patamares (2026-09-11, entrevista de
// decisões de horário — ver ROADMAP.md, item 14/23). Antes disso o
// backend flipava `status` pra `missed` na hora (zero tolerância);
// agora só flipa depois de 24h (`DoseLog::MISSED_TOLERANCE_HOURS`,
// backend). O patamar de 30min é 100% deste lado — nunca grava nada,
// só decide o que MOSTRAR pra uma dose que o backend ainda considera
// `pending`. As duas constantes precisam bater com o que o backend
// realmente aplica (documentado ali) — não são configuráveis por
// remédio/perfil por enquanto (decisão explícita, YAGNI).
const DELAYED_THRESHOLD_MINUTES = 30;

function isDelayed(scheduledAtIso: string, now: number): boolean {
  return now - parseISO(scheduledAtIso).getTime() >= DELAYED_THRESHOLD_MINUTES * 60000;
}

// "Tomei antes da hora" (2026-09-11, achado real do Rilson com o app em
// mãos: tocar "Tomei" numa dose ainda longe no futuro simplesmente
// gravava o horário AGENDADO como taken_at, sem perguntar nada — a
// pessoa que sempre toma mais cedo nunca via a oferta de "quer adiantar
// o horário?" que o lado atrasado já tinha). Espelha `isDelayed`, mesmo
// limiar (a "diferença grande o bastante pra valer a pena perguntar" já
// decidida vale nos dois sentidos, não só atraso).
function isEarly(scheduledAtIso: string, now: number): boolean {
  return parseISO(scheduledAtIso).getTime() - now >= DELAYED_THRESHOLD_MINUTES * 60000;
}

// Mesmo mapa de locale do date-fns usado no Histórico.
const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;
const DATE_FORMAT: Record<string, string> = {
  pt: "EEEE, d 'de' MMMM",
  es: "EEEE, d 'de' MMMM",
  en: 'EEEE, MMMM d',
};

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  // Toast global (2026-09-05) — extraído daqui, ver store/toastStore.ts.
  const showToast = useToastStore((s) => s.showToast);

  const { activeProfile, profiles, setProfiles, setActiveProfile } = useProfileStore();
  const { isPrivate } = usePrivacyStore();
  const currentUser = useAuthStore((s) => s.user);
  // "Reação do cuidador" (2026-08-22) — só o cuidador (não o dono) reage;
  // is_owner ausente em respostas antigas trata como dono (ver comentário
  // no tipo Profile), então só é colaborador quando explicitamente false.
  const isCaregiverView = activeProfile?.is_owner === false;
  const { showAlert, alertDialog } = useAlertDialog();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const queryClient = useQueryClient();

  // "Dose fora do horário" (item 8, 2026-09-08) — "Tomei" continua 1
  // toque = agora, sem mudança nenhuma no caso comum; este modal só
  // abre por uma ação secundária explícita ("Foi em outro horário"),
  // decisão de produto confirmada com o Rilson pra não virar uma
  // pergunta obrigatória toda vez que alguém marca uma dose.
  //
  // Campo de texto HH:MM trocado por atalhos relativos + picker nativo
  // (2026-09-11, achado do Rilson revendo o app com olhar de usuário
  // menos técnico: digitar hora de cabeça é fácil de errar/confundir).
  // Reverte parte da decisão de 08/09 registrada abaixo — o motivo novo
  // (usabilidade pra público menos técnico) não tinha pesado na decisão
  // original. Ver docs/ROADMAP.md.
  const [customTimeDose, setCustomTimeDose] = useState<DoseLog | null>(null);
  const [customTime, setCustomTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  function openCustomTimeModal(dose: DoseLog) {
    setCustomTime(new Date());
    setShowTimePicker(false);
    setCustomTimeDose(dose);
  }

  function closeCustomTimeModal() {
    setCustomTimeDose(null);
    setShowTimePicker(false);
  }

  // Atalhos ("Agora", "Há 15 min"...) — instante real, calculado direto
  // de "agora menos N minutos". Diferente do picker específico abaixo,
  // não precisa ancorar no dia do horário previsto: já é um Date
  // completo (dia+hora), não só um HH:MM sem data.
  function takeAtOffset(minutesAgo: number) {
    if (!customTimeDose) return;
    const takenAt = new Date(Date.now() - minutesAgo * 60000);
    const dose = customTimeDose;
    closeCustomTimeModal();
    markDose.mutate({ dose, takenAt });
  }

  function openSpecificTimePicker() {
    if (!getDateTimePicker()) {
      showAlert(t('home.timePickerUnavailableTitle'), t('home.timePickerUnavailableText'));
      return;
    }
    setShowTimePicker(true);
  }

  // `pickedTime` opcional (2026-09-11): o botão "Registrar" (iOS/web,
  // spinner sempre visível) usa o valor já salvo em `customTime` por
  // onChange. O Android confirma no próprio evento 'set' do diálogo
  // nativo — nesse caso passa o valor direto, sem esperar o setState
  // (assíncrono) refletir antes de ler `customTime`.
  function confirmCustomTime(pickedTime: Date = customTime) {
    if (!customTimeDose) return;
    // Base no DIA do horário previsto, não "hoje" (achado de revisão de
    // código, 2026-09-08): sem isso, registrar depois da meia-noite uma
    // dose de antes dela (ex.: prevista 23:50, só registrada às 00:10)
    // jogava o horário escolhido pro dia seguinte — 13h+ no futuro em
    // vez de minutos atrás — distorcendo o cálculo de diferença/recálculo.
    // O picker nativo (mode="time") devolve hora/minuto só de HOJE, tem
    // o mesmo problema que o texto livre tinha — a ancoragem continua
    // necessária mesmo trocando o componente de entrada.
    const takenAt = parseISO(customTimeDose.scheduled_at);
    takenAt.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
    const dose = customTimeDose;
    closeCustomTimeModal();
    markDose.mutate({ dose, takenAt });
  }

  // "Tomei numa dose Atrasada" (2026-09-11, item 25/27, revisado no
  // mesmo dia a pedido do Rilson — UI melhor que a original) — o
  // diálogo de confirmação separado ("Sim, no horário previsto" / "Não,
  // foi outro horário") virou redundante com o próprio modal "Outro
  // horário": abre ELE direto (mesmo atalhos/picker de sempre), que
  // agora também tem "No horário previsto" fixado como a primeira
  // opção (ver JSX do modal) — mesmas escolhas de antes, sem
  // transparência nenhuma perdida, só sem a etapa extra de "confirmar
  // que quer escolher" antes de escolher de verdade. O toque simples
  // continua 1 toque = agora pro caso comum, sem fricção nova.
  function handleTakePress(dose: DoseLog) {
    // Early ou Atrasado — mesmo modal pros dois (2026-09-11): a única
    // diferença real é o SINAL da diferença de horário, não o fluxo. Ver
    // `isEarly` acima pro porquê disso ter faltado antes.
    if (dose.status === 'pending' && (isDelayed(dose.scheduled_at, nowTick) || isEarly(dose.scheduled_at, nowTick))) {
      openCustomTimeModal(dose);
      return;
    }
    markDose.mutate({ dose });
  }

  // "No horário previsto" — pinado no topo do modal "Outro horário"
  // quando a dose está Atrasada (ver JSX). Mesmo efeito de sempre do
  // toque simples em "Tomei" (grava o horário AGENDADO, decisão de
  // 2026-09-11 já existente, ver markDose) — só chega até aqui porque
  // veio de uma dose Atrasada, não de um "Tomei" comum.
  function confirmCustomTimeOnSchedule() {
    if (!customTimeDose) return;
    const dose = customTimeDose;
    closeCustomTimeModal();
    markDose.mutate({ dose });
  }

  // "Outro horário" numa dose já "Perdida" de verdade (item 2/9) — só
  // pergunta quando o status ATUAL já é `missed` (Perdido, backend,
  // >24h) — dentro da tolerância (ainda `pending`, só "Atrasado" na
  // tela) "Outro horário" continua abrindo direto, sem pergunta extra
  // (confirmado explicitamente, item 24).
  function handleCustomTimePress(dose: DoseLog) {
    if (dose.status === 'missed') {
      setConfirmDialog({ kind: 'stillMissed', dose });
      return;
    }
    openCustomTimeModal(dose);
  }

  // "Continua perdida" — fecha sem fazer nada; NÃO é automático virar
  // "Tomado" só por ter tocado em "Outro horário" (princípio do Rilson).
  function confirmStillMissedKeep() {
    closeConfirmDialog();
  }

  // "Marcar como tomada" — só AGORA abre o fluxo real de escolher
  // horário (mesmo picker/atalhos de sempre).
  function confirmStillMissedMarkTaken() {
    if (confirmDialog?.kind !== 'stillMissed') return;
    const dose = confirmDialog.dose;
    closeConfirmDialog();
    openCustomTimeModal(dose);
  }

  useEffect(() => {
    api.get('/profiles').then(({ data }) => {
      setProfiles(data);
      // Autocorrige quem já tinha perfil antes do fuso existir (ver
      // services/device.ts). Deixou de ser 100% silencioso (2026-09-11,
      // entrevista de decisões de horário, item 1/6) — princípio do
      // Rilson: "transparência total". O marcador PERMANENTE já fica
      // gravado sozinho no backend (ProfileController::update); aqui só
      // falta o aviso NA HORA (toast) — o resto (ver no Histórico) é
      // responsabilidade da tela de Histórico.
      syncOwnedProfileTimezones(data).then((changes) => {
        for (const change of changes) {
          showToast(t('home.timezoneChangedToast', { timezone: change.newTimezone }));
        }
      });
    });
  }, []);

  // "Ao vivo" (2026-09-11, item 23/26) — Pendente→Atrasado (30min) é
  // 100% calculado aqui, sem rede nenhuma; um timer de 1min já deixa
  // isso instantâneo pro olho humano, sem custo de bateria/dados real.
  // Atrasado→Perdido (24h) é um status de verdade do backend — só o
  // `refetchInterval` da query abaixo consegue pegar esse flip.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const { data: doses = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['today-doses', activeProfile?.id],
    queryFn: async () => {
      const fresh = await getTodayDoses(activeProfile!.id);
      // Sobrepõe ações ainda na fila local — sem isso, reabrir o app
      // ainda offline faria uma dose já marcada parecer não-marcada de
      // novo até a fila drenar (ver offlineQueue.ts).
      return applyPendingOverlay(fresh);
    },
    enabled: !!activeProfile,
    // "Ao vivo" pro flip de Perdido (2026-09-11, item 23/26) — o cron do
    // backend (`doses:check-missed`) roda a cada 15min; 5min aqui
    // detecta o flip com atraso pequeno sem consultar mais rápido do
    // que o próprio backend decide algo novo.
    refetchInterval: 5 * 60 * 1000,
  });

  // Estado unificado pros 2 diálogos de confirmação novos (2026-09-11,
  // entrevista de decisões de horário) — "Outro horário numa dose já
  // Perdida" (item 2/9) e o "só hoje / pra sempre" do recálculo (item
  // 12/13). ("Tomei numa dose Atrasada" tinha um 3º aqui, removido no
  // mesmo dia — virou parte do modal "Outro horário" em vez de um
  // diálogo à parte, UI melhor sugerida a pedido do Rilson.) Nenhum dos
  // 2 cabe no AlertDialog genérico (okLabel fixo "OK", só 1 botão
  // custom) sem ficar confuso — cada um precisa de 2 ações reais e claras.
  type ConfirmDialogState =
    | { kind: 'stillMissed'; dose: DoseLog }
    | {
        kind: 'recalculate';
        scheduleId: number;
        anchor: Date;
        medication: { name: string; dosage: string | null; unit: string };
        isFixedSchedule: boolean;
      };
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  function closeConfirmDialog() {
    setConfirmDialog(null);
  }

  // Streak de adesão (Fase 2, 2026-08-11).
  const { data: streak } = useQuery({
    queryKey: ['adherence-streak', activeProfile?.id],
    queryFn: () => getAdherenceStreak(activeProfile!.id),
    enabled: !!activeProfile,
  });

  // Offline support (2026-08-17): as 3 mutações abaixo tentam a API real
  // primeiro; se falhar por falta de rede (não por erro real do
  // servidor), a ação vai pra fila local (services/offlineQueue.ts) e a
  // UI atualiza otimisticamente do mesmo jeito — sem isso, marcar uma
  // dose sem internet falhava silenciosamente, sem nenhum feedback.
  // logDose já é seguro de reenviar (updateOrCreate no backend pela
  // chave schedule+horário, não por id), então a fila não precisa de
  // nenhuma chave de idempotência própria.

  const markDose = useMutation({
    // "Dose fora do horário" (item 8, 2026-09-08) — achado real do
    // Rilson: só dava pra marcar "tomei" como agora, sem jeito de
    // registrar que foi em outro horário (ex.: tomou o das 8h só às
    // 10h). `takenAt` opcional mantém o caso comum idêntico a antes (1
    // toque, sem seletor nenhum) — só passa um valor quando vem do
    // fluxo "Foi em outro horário" (ver openCustomTimeModal).
    mutationFn: async ({ dose, takenAt }: { dose: DoseLog; takenAt?: Date }) => {
      const payload = {
        dose_schedule_id: dose.dose_schedule_id,
        medication_id: dose.medication_id,
        profile_id: dose.profile_id,
        scheduled_at: dose.scheduled_at,
        // Decisão de produto do Rilson (2026-09-11): "Tomei" (toque
        // simples) grava o horário AGENDADO como taken_at, não o
        // instante do toque — tocar às 00:01 pra uma dose das 00:00 não
        // deveria aparecer como "tomado às 00:01" no Histórico. Só
        // "Outro horário" (takenAt explícito, vindo do modal) registra
        // um horário genuinamente diferente do agendado.
        taken_at: (takenAt ?? parseISO(dose.scheduled_at)).toISOString(),
        status: 'taken' as const,
      };
      try {
        return { ...(await logDose(payload)), _pendingSync: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        await enqueueLog(payload);
        return { ...dose, status: 'taken' as const, taken_at: payload.taken_at, streak_milestone: null, _pendingSync: true };
      }
    },
    onSuccess: (log, { dose, takenAt }) => {
      queryClient.setQueryData<DoseLog[]>(['today-doses', dose.profile_id], (old) =>
        old?.map((d) => (d.id === dose.id ? { ...d, ...log } : d)),
      );

      // haptic: false — o hático desta tela é deliberadamente separado do
      // toast (só vibra na confirmação real do servidor, ver abaixo);
      // com o toastStore vibrando sozinho por padrão, precisa desligar
      // aqui pra não dobrar nem vibrar numa marcação só enfileirada offline.
      showToast(t('home.doseSuccessToast', { name: maskMedicationName(dose.medication.name, isPrivate) }), { haptic: false });

      if (log._pendingSync) return; // offline — o resto acontece quando a fila drenar

      // Haptic feedback (Fase 1) — só no sucesso, não no toque em si:
      // vibrar antes de confirmar que salvou daria falso positivo se a
      // chamada falhar.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });

      if (log.streak_milestone === 7 || log.streak_milestone === 30 || log.streak_milestone === 60) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const key = log.streak_milestone as 7 | 30 | 60;
        showAlert(t(`home.milestone${key}Title`), t(`home.milestone${key}Text`));
        return; // um alerta de cada vez — marco de streak tem prioridade
      }

      // "Dose fora do horário": oferece ajustar quando (a) a pessoa
      // realmente escolheu um horário diferente e (b) a diferença é
      // grande o bastante pra valer a pena perguntar (limiar de 30min
      // decidido — atraso pequeno não interrompe com pergunta nenhuma).
      // Antes só valia pra modo intervalo (horário fixo não tinha
      // "próxima dose" pra deslocar) — a partir de 2026-09-11 (entrevista
      // de decisões de horário, item 3/19) horário fixo também oferece,
      // só que o "ajuste" possível pra ele é diferente (ver offerRecalculateToday).
      if (takenAt) {
        const diffMinutes = Math.abs(takenAt.getTime() - parseISO(dose.scheduled_at).getTime()) / 60000;
        if (diffMinutes >= DELAYED_THRESHOLD_MINUTES) {
          offerRecalculateToday(dose, takenAt);
        }
      }
    },
  });

  // Reescrito (2026-09-11, entrevista de decisões de horário, item
  // 12/13/16) — antes era 1 confirmação só ("Ajustar"), sempre "só
  // hoje", só pra intervalo. Agora sempre pergunta "só hoje ou pra
  // sempre" (nunca decide sozinho — princípio do Rilson: "transparência
  // total, agência total"), e vale pra horário fixo também.
  function offerRecalculateToday(dose: DoseLog, anchor: Date) {
    setConfirmDialog({
      kind: 'recalculate',
      scheduleId: dose.dose_schedule_id,
      anchor,
      medication: dose.medication,
      isFixedSchedule: dose.dose_schedule.interval_hours == null,
    });
  }

  // "Só hoje" — modo intervalo: desloca as ocorrências RESTANTES de
  // hoje (mecanismo `today_override_*` que já existia). Modo fixo: não
  // existe "próxima ocorrência hoje" pra deslocar (um schedule fixo só
  // gera 1 dose/dia) — a dose já foi registrada com o horário certo,
  // não sobra nada a fazer além de confirmar isso pra pessoa.
  async function confirmRecalculateOnlyToday() {
    if (confirmDialog?.kind !== 'recalculate') return;
    const { scheduleId, anchor, medication, isFixedSchedule } = confirmDialog;
    closeConfirmDialog();

    if (isFixedSchedule) {
      showToast(t('home.recalculatedTodayOnlyFixedToast'));
      return;
    }

    try {
      const result = await recalculateScheduleToday(scheduleId, anchor.toISOString());
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      showToast(t('home.recalculatedToast'));
      // Resincroniza os lembretes locais (2026-09-08, revisitando a
      // limitação aceita) — best-effort, de propósito: a tela Hoje já
      // está correta pelo invalidateQueries acima (fonte de verdade
      // real); se o agendamento de notificação falhar (permissão
      // negada, etc.), não desfaz o recálculo nem assusta a pessoa com
      // um erro sobre algo secundário.
      rescheduleTodayOccurrences({
        scheduleId,
        todayOccurrences: result.today_occurrences,
        medicationName: medication.name,
        dosage: medication.dosage,
        unit: medication.unit,
      }).catch((err) => console.warn('[assidua] Falha ao resincronizar lembretes locais:', err));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('home.errorRecalculate'));
    }
  }

  // "Pra sempre" — equivalente a "Editar horário" (mesmo endpoint,
  // `PUT /schedules/{id}`), disparado por este fluxo também. Vale pros
  // dois modos: desloca o `time` permanente do schedule a partir de
  // agora. Notificação: `scheduleScheduleNotifications` já cancela+
  // recria o lembrete por conta própria (mesmo caminho que "Editar
  // horário" usa) — zero duplicata, sem precisar de nenhum código novo
  // de notificação aqui (item 5/21 fechado de graça por reuso).
  async function confirmRecalculateForever() {
    if (confirmDialog?.kind !== 'recalculate') return;
    const { scheduleId, anchor, medication } = confirmDialog;
    closeConfirmDialog();
    const newTime = format(anchor, 'HH:mm');

    try {
      const updated = await updateSchedule(scheduleId, { time: newTime });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      showToast(t('home.recalculatedForeverToast', { time: newTime }));
      scheduleScheduleNotifications({
        scheduleId,
        time: newTime,
        days_of_week: updated.days_of_week,
        interval_hours: updated.interval_hours,
        medicationName: medication.name,
        dosage: medication.dosage,
        unit: medication.unit,
      }).catch((err) => console.warn('[assidua] Falha ao resincronizar lembretes locais:', err));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('home.errorRecalculate'));
    }
  }

  const skipDose = useMutation({
    mutationFn: async (dose: DoseLog) => {
      const payload = {
        dose_schedule_id: dose.dose_schedule_id,
        medication_id: dose.medication_id,
        profile_id: dose.profile_id,
        scheduled_at: dose.scheduled_at,
        status: 'skipped' as const,
      };
      try {
        return { ...(await logDose(payload)), _pendingSync: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        await enqueueLog(payload);
        return { ...dose, status: 'skipped' as const, _pendingSync: true };
      }
    },
    onSuccess: (log, dose) => {
      queryClient.setQueryData<DoseLog[]>(['today-doses', dose.profile_id], (old) =>
        old?.map((d) => (d.id === dose.id ? { ...d, ...log } : d)),
      );
      if (log._pendingSync) return;
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (dose: DoseLog) => {
      if (dose._pendingSync) {
        await cancelPendingLog(dose.dose_schedule_id, dose.scheduled_at);
        return { queued: false };
      }
      try {
        await undoDose(dose.id as number);
        return { queued: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        await enqueueUndo({ dose_log_id: dose.id as number });
        return { queued: true };
      }
    },
    onSuccess: (result, dose) => {
      const time = format(parseISO(dose.scheduled_at), 'HHmm');
      queryClient.setQueryData<DoseLog[]>(['today-doses', dose.profile_id], (old) =>
        old?.map((d) =>
          d.id === dose.id
            ? {
                ...d,
                id: `pending_${dose.dose_schedule_id}_${time}`,
                status: 'pending' as const,
                taken_at: null,
                notes: null,
                _pendingSync: result.queued,
              }
            : d,
        ),
      );
      if (result.queued || dose._pendingSync) return;
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
    },
  });

  const reactMutation = useMutation({
    mutationFn: (dose: DoseLog) => reactToDose(dose.id as number),
    onMutate: async (dose) => {
      queryClient.setQueryData<DoseLog[]>(['today-doses', dose.profile_id], (old) =>
        old?.map((d) =>
          d.id === dose.id ? { ...d, reacted_at: new Date().toISOString(), reacted_by_name: currentUser?.name } : d,
        ),
      );
    },
  });

  const locale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
  const dateFormat = DATE_FORMAT[i18n.language] ?? DATE_FORMAT.pt;
  const today = format(new Date(), dateFormat, { locale });
  const takenCount = doses.filter((d) => d.status === 'taken').length;

  const lowStockNames = Array.from(
    new Set(
      doses
        .filter((d) => {
          const days = d.medication.days_remaining;
          return days !== null && days <= LOW_STOCK_DAYS_THRESHOLD;
        })
        .map((d) => maskMedicationName(d.medication.name, isPrivate)),
    ),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {!isWide && (
          <Image
            source={require('../../assets/logo-mark-white.png')}
            style={styles.brandWatermark}
            accessible={false}
            importantForAccessibility="no"
          />
        )}
        <View style={styles.headerTop}>
          {!isWide && (
            <Image
              source={require('../../assets/logo-mark-white.png')}
              style={styles.brandMark}
              accessible={false}
              importantForAccessibility="no"
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{today}</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t('home.dosesToday')}</Text>
              {!!streak?.current_streak && (
                <View style={styles.streakBadge} accessible accessibilityLabel={t('home.streakLabel', { count: streak.current_streak })}>
                  <MaterialCommunityIcons name="fire" size={14} color="#f59e0b" />
                  <Text style={styles.streakBadgeText}>{streak.current_streak}</Text>
                </View>
              )}
            </View>
            {doses.length > 0 && (
              // O anel ao lado já anuncia a mesma informação (com %) pro
              // leitor de tela — texto aqui evita duplicar o anúncio,
              // mas continua visível pra quem enxerga.
              <Text style={styles.progress} importantForAccessibility="no" accessibilityElementsHidden>
                {t('home.progress', { count: takenCount, total: doses.length })}
              </Text>
            )}
          </View>
          {doses.length > 0 && (
            // Anel de progresso de adesão do dia (v1.3, aprovado
            // 2026-09-02) — usa `react-native-svg`, dependência nova
            // (ver package.json) que só entra de verdade num próximo
            // `eas build`; até lá, o texto acima já cobre a mesma
            // informação, e o ErrorBoundary evita quebrar a tela inteira
            // num build antigo que ainda não tem o módulo nativo linkado
            // (mesmo padrão já usado com expo-image-picker).
            <ErrorBoundary fallback={null}>
              <AdherenceRing
                taken={takenCount}
                total={doses.length}
                trackColor="rgba(255,255,255,0.25)"
                textColor={colors.headerText}
              />
            </ErrorBoundary>
          )}
          <TouchableOpacity
            onPress={togglePrivacyWithHint}
            accessibilityRole="switch"
            accessibilityLabel={t('profile.privacyToggle')}
            accessibilityHint={t('profile.privacyModeHint')}
            accessibilityState={{ checked: isPrivate }}
            style={{ padding: 8 }}
          >
            <MaterialCommunityIcons
              name={isPrivate ? 'eye-off-outline' : 'eye-outline'}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
        {/* "Cuidando de {{nome}}" (2026-09-08, achado real revisando a
            tela) — antes o único sinal de que a pessoa está vendo dados
            de outro perfil era um selo pequeno lá na tela de Perfil. Aqui
            na Home, onde de fato se age (marcar dose), não tinha nenhum
            lembrete de quem são os dados — risco de confundir "é meu
            remédio ou da minha mãe?". */}
        {isCaregiverView && !!activeProfile && (
          <View style={styles.caregiverBanner} accessible accessibilityLabel={t('home.caregiverBanner', { name: activeProfile.name })}>
            <MaterialCommunityIcons name="account-heart-outline" size={14} color={colors.headerText} />
            <Text style={styles.caregiverBannerText}>{t('home.caregiverBanner', { name: activeProfile.name })}</Text>
          </View>
        )}
        {profiles.length > 0 && (
          <FlatList
            data={profiles}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.profileChip, activeProfile?.id === item.id && styles.profileChipActive]}
                onPress={() => setActiveProfile(item)}
                accessibilityRole="button"
                accessibilityLabel={t('home.profileLabel', { name: item.name })}
                accessibilityState={{ selected: activeProfile?.id === item.id }}
              >
                <MaterialCommunityIcons
                  name={(item.avatar_emoji as any) ?? 'account'}
                  size={15}
                  color={activeProfile?.id === item.id ? colors.headerBg : 'rgba(255,255,255,0.9)'}
                />
                <Text style={[styles.profileChipText, activeProfile?.id === item.id && styles.profileChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
            style={styles.profileList}
          />
        )}
      </View>

      {lowStockNames.length > 0 && (
        <View style={styles.stockBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.stockBannerText} numberOfLines={2}>
            {t('home.stockRunningOut', { names: lowStockNames.join(', ') })}
          </Text>
        </View>
      )}

      {!isLoading && profiles.length === 0 && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="account-plus-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('home.noProfileTitle')}</Text>
          <Text style={styles.emptyText}>{t('home.noProfileText')}</Text>
          <Link href="/(tabs)/profile" asChild>
            <TouchableOpacity style={styles.emptyBtn} accessibilityRole="button">
              <Text style={styles.emptyBtnText}>{t('home.createProfile')}</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}

      {!isLoading && activeProfile && doses.length === 0 && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="pill-off" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('home.noDosesTitle')}</Text>
          <Text style={styles.emptyText}>{t('home.noDosesText')}</Text>
          <Link href="/medication/new" asChild>
            <TouchableOpacity style={styles.emptyBtn} accessibilityRole="button">
              <Text style={styles.emptyBtnText}>{t('home.addMedication')}</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}

      {isLoading && <SkeletonList lines={2} />}

      {doses.length > 0 && (
        <FlatList
          data={doses}
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.gridRow : undefined}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const taken = item.status === 'taken';
            const skipped = item.status === 'skipped';
            // "Perdido" (2026-09-11, item 14/15) — renomeado do antigo
            // "Atrasado": mesmo status `missed` do backend, mas agora só
            // acontece depois de 24h (ver DoseLog::MISSED_TOLERANCE_HOURS).
            const missed = item.status === 'missed';
            // "Atrasado" NOVO (2026-09-11, item 14/23) — 100% calculado
            // aqui, nunca gravado: dose ainda `pending` no backend, mas
            // já passou da tolerância de 30min. `nowTick` (timer de 1min)
            // é o que faz isso reavaliar sozinho sem precisar recarregar
            // a tela.
            const delayed = !taken && !skipped && !missed && isDelayed(item.scheduled_at, nowTick);
            // Mesmo bug/fix do Histórico (2026-09-09, "Bug 2" do item 17)
            // — ficou de fora daquela rodada por só ter mexido em
            // history.tsx. Achado real do Rilson (2026-09-11): registrar
            // "Ibuprofeno tomado às 9h" via Outro horário + recalcular
            // atualizava certinho a PRÓXIMA dose (17h), mas o card da
            // PRÓPRIA dose continuava com "10:00" — sempre lia
            // `scheduled_at`, nunca `taken_at`, pra dose já tomada.
            const time = taken && item.taken_at
              ? format(parseISO(item.taken_at), 'HH:mm')
              : format(parseISO(item.scheduled_at), 'HH:mm');
            const maskedName = maskMedicationName(item.medication.name, isPrivate);
            const statusColor = missed ? colors.warning : delayed ? colors.delayed : item.medication.color;
            return (
              <View style={[styles.card, (taken || skipped) && styles.cardDone, isWide && { flex: 1 }]}>
                <View style={[styles.colorBar, { backgroundColor: statusColor }]} />
                {/* Duas fileiras, não uma só (2026-09-09, achado real do
                    Rilson com screenshot): nome+horário numa linha e os
                    botões de ação (Tomei/Outro horário/Pular) na OUTRA,
                    embaixo, cada um com espaço de sobra. Antes, tudo
                    dividia uma fileira só — nome comprido ("Maleato de
                    dexclorfeniramina...") sobrava cada vez menos espaço
                    conforme os botões ganhavam texto (achado de UX
                    anterior), quebrando palavra no meio. Nome do remédio
                    é a informação mais importante do card — não é pra
                    truncar nem espremer. */}
                <View style={styles.cardContent}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.timeCol}>
                      <Text style={[styles.time, (missed || delayed) && { color: statusColor }]}>{time}</Text>
                      {/* "Não tomado" (2026-09-11, achado do Rilson: mais
                          claro pra audiência em português que "Perdido")
                          — reaproveita a MESMA chave que o Histórico já
                          usa (`history.filterMissed`) de propósito, não
                          uma cópia com o mesmo texto — evita as duas
                          telas divergirem de novo no futuro sem
                          ninguém perceber (foi exatamente isso que
                          aconteceu até hoje: "Atrasado" aqui, "Não
                          tomado" lá, pro mesmo status). */}
                      {missed && <Text style={[styles.missedLabel, { color: colors.warning }]}>{t('history.filterMissed')}</Text>}
                      {delayed && <Text style={[styles.missedLabel, { color: colors.delayed }]}>{t('home.delayed')}</Text>}
                    </View>
                    <TouchableOpacity
                      style={styles.cardBody}
                      onPress={() => router.push(`/medication/${item.medication_id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={t('medications.editLabel', { name: maskedName })}
                    >
                      <Text style={styles.medName}>{maskedName}</Text>
                      <Text style={styles.medDosage}>{formatDosageUnit(item.medication.dosage, item.medication.unit)}</Text>
                      {item._pendingSync && (
                        <View style={styles.pendingSyncRow}>
                          <MaterialCommunityIcons name="cloud-off-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.pendingSyncText}>{t('home.pendingSync')}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                  {!taken && !skipped && (
                    <View style={styles.actionsRow}>
                      {/* flex:1 só no Tomei (2026-09-09) — com a fileira
                          própria, sobra espaço; a ação principal usa
                          esse espaço pra virar o botão mais fácil de
                          acertar, em vez de um entre três do mesmo
                          tamanho competindo por atenção. */}
                      <TouchableOpacity
                        style={styles.takeButton}
                        onPress={() => handleTakePress(item)}
                        disabled={markDose.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.markTakenLabel', { name: maskedName, time })}
                      >
                        <MaterialCommunityIcons name="check" size={18} color="#fff" />
                        <Text style={styles.takeButtonText}>{t('home.take')}</Text>
                      </TouchableOpacity>
                      {/* "Dose fora do horário" (item 8, 2026-09-08) — ação
                          secundária explícita, ao lado do botão principal
                          (não escondida atrás de toque longo, mais fácil
                          de descobrir pro público idoso do app). Rótulo
                          visível adicionado depois (achado de UX,
                          2026-09-08): só o ícone confundia — não dava pra
                          adivinhar o que "relógio com lápis" faz. */}
                      <TouchableOpacity
                        style={styles.customTimeButton}
                        onPress={() => handleCustomTimePress(item)}
                        disabled={markDose.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.customTimeLabel', { name: maskedName })}
                      >
                        <MaterialCommunityIcons name="clock-edit-outline" size={16} color={colors.textMuted} />
                        <Text style={styles.customTimeButtonText}>{t('home.customTimeButton')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => skipDose.mutate(item)}
                        disabled={skipDose.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.skipLabel', { name: maskedName, time })}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {taken && (
                    <View style={styles.statusRow}>
                      <TouchableOpacity
                        style={styles.statusBadge}
                        onPress={() => undoMutation.mutate(item)}
                        disabled={undoMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.takenLabel', { name: maskedName, time })}
                        accessibilityHint={t('home.undoHint')}
                      >
                        <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                        <Text style={styles.takenText}>{t('home.taken')}</Text>
                        <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                      </TouchableOpacity>
                      {isCaregiverView && (
                        <TouchableOpacity
                          style={styles.reactButton}
                          onPress={() => reactMutation.mutate(item)}
                          disabled={!!item.reacted_at || reactMutation.isPending}
                          accessibilityRole="button"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityLabel={
                            item.reacted_at
                              ? t('home.alreadyReacted')
                              : t('home.reactLabel', { name: maskedName })
                          }
                        >
                          <MaterialCommunityIcons
                            name={item.reacted_at ? 'heart' : 'heart-outline'}
                            size={18}
                            color={item.reacted_at ? colors.brand : colors.textMuted}
                          />
                        </TouchableOpacity>
                      )}
                      {!isCaregiverView && !!item.reacted_at && (
                        <View style={styles.reactedIndicator} accessible accessibilityLabel={t('home.reactedByLabel', { name: item.reacted_by_name })}>
                          <MaterialCommunityIcons name="heart" size={14} color={colors.brand} />
                        </View>
                      )}
                    </View>
                  )}
                  {skipped && (
                    <View style={styles.statusRow}>
                      <TouchableOpacity
                        style={styles.statusBadge}
                        onPress={() => undoMutation.mutate(item)}
                        disabled={undoMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.skippedLabel', { name: maskedName, time })}
                        accessibilityHint={t('home.undoHint')}
                      >
                        <MaterialCommunityIcons name="minus-circle" size={18} color={colors.textMuted} />
                        <Text style={styles.skippedText}>{t('home.skipped')}</Text>
                        <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
      {/* Achado real de uso (2026-09-02): "+" só existia em Remédios —
          pedido explícito de também ter em Hoje, pra não obrigar trocar
          de aba pra adicionar (ação constante). Só quando já há algo na
          tela — lista vazia já tem seu próprio CTA "Adicionar
          medicamento" acima, o FAB ali seria redundante. Cuidador não
          cadastra remédio (mesma regra já aplicada em medications.tsx). */}
      {doses.length > 0 && !isCaregiverView && (
        <Link href="/medication/new" asChild>
          <TouchableOpacity style={styles.fab} accessibilityRole="button" accessibilityLabel={t('medications.addLabel')}>
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </Link>
      )}
      {/* "Foi em outro horário?" (item 8, 2026-09-08). Campo de texto
          HH:MM trocado (2026-09-11) por atalhos relativos + picker
          nativo — digitar hora de cabeça confundia usuários menos
          técnicos (achado do Rilson). Atalhos cobrem o caso comum sem
          depender de nenhum módulo nativo (funcionam mesmo num build
          antigo); só "Horário específico" precisa do picker nativo
          (getDateTimePicker, guarda de indisponibilidade acima). */}
      <Modal
        visible={!!customTimeDose}
        transparent
        animationType="fade"
        onRequestClose={closeCustomTimeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('home.customTimeModalTitle', {
                name: customTimeDose ? maskMedicationName(customTimeDose.medication.name, isPrivate) : '',
              })}
            </Text>
            {!showTimePicker && (
              <>
                {/* "No horário previsto" (2026-09-11, item 5 da rodada
                    de transparência; estendido no mesmo dia pro caso
                    "cedo demais" — ver `isEarly`) — fixado acima do
                    grid normal quando a dose está Atrasada OU muito
                    adiantada: é exatamente o par de escolhas que o
                    diálogo separado de "Tomei numa dose Atrasada"
                    oferecia (sim/não foi no horário certo), fundido
                    neste modal em vez de uma etapa extra antes dele —
                    mesmas opções, 1 tela a menos. */}
                {customTimeDose?.status === 'pending' &&
                  (isDelayed(customTimeDose.scheduled_at, nowTick) || isEarly(customTimeDose.scheduled_at, nowTick)) && (
                  <TouchableOpacity
                    style={styles.onScheduleChip}
                    onPress={confirmCustomTimeOnSchedule}
                    disabled={markDose.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.onScheduleTime', {
                      time: format(parseISO(customTimeDose.scheduled_at), 'HH:mm'),
                    })}
                  >
                    <Text style={styles.onScheduleChipText}>
                      {t('home.onScheduleTime', { time: format(parseISO(customTimeDose.scheduled_at), 'HH:mm') })}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={styles.quickTimeRow}>
                  {QUICK_TIME_OFFSETS.map(({ minutes, labelKey }) => (
                    <TouchableOpacity
                      key={minutes}
                      style={styles.quickTimeChip}
                      onPress={() => takeAtOffset(minutes)}
                      disabled={markDose.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t(labelKey)}
                    >
                      <Text style={styles.quickTimeChipText}>{t(labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.specificTimeLink}
                  onPress={openSpecificTimePicker}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.customTimeSpecificButton')}
                >
                  <Text style={styles.specificTimeLinkText}>{t('home.customTimeSpecificButton')}</Text>
                </TouchableOpacity>
              </>
            )}
            {showTimePicker && (() => {
              const DateTimePicker = getDateTimePicker();
              if (!DateTimePicker) return null;
              return (
                <DateTimePicker
                  testID="taken-at-native-picker"
                  value={customTime}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selected) => {
                    // Android: o diálogo nativo já tem seu próprio
                    // OK/Cancelar — 'set' já É a confirmação, chama
                    // direto (passando o valor, não esperando o
                    // setState assíncrono refletir em `customTime`
                    // antes de ler). 'dismissed' só volta pros atalhos.
                    if (Platform.OS === 'android') {
                      if (event.type === 'set' && selected) confirmCustomTime(selected);
                      else setShowTimePicker(false);
                      return;
                    }
                    // iOS/web: spinner/input fica visível, só atualiza
                    // o valor — confirma é o botão "Registrar" abaixo.
                    if (selected) setCustomTime(selected);
                  }}
                />
              );
            })()}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={closeCustomTimeModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={() => confirmCustomTime()}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.customTimeConfirm')}
                >
                  <Text style={styles.modalConfirmText}>{t('home.customTimeConfirm')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* 3 diálogos de confirmação novos (2026-09-11, entrevista de
          decisões de horário) — unificados num Modal só (mesmo padrão
          visual dos outros já existentes), o conteúdo muda conforme
          `confirmDialog.kind`. Nenhum cabe no AlertDialog genérico
          (okLabel fixo "OK", só 1 botão custom) sem ficar confuso —
          cada um precisa de 2 ações reais e claramente rotuladas. */}
      <Modal
        visible={!!confirmDialog}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmDialog}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {confirmDialog?.kind === 'stillMissed' && (
              <>
                <Text style={styles.modalTitle}>
                  {t('home.stillMissedTitle', {
                    name: maskMedicationName(confirmDialog.dose.medication.name, isPrivate),
                  })}
                </Text>
                <Text style={styles.modalMessage}>{t('home.stillMissedMessage')}</Text>
                <View style={styles.modalActionsColumn}>
                  <TouchableOpacity
                    style={styles.modalConfirmBtnFull}
                    onPress={confirmStillMissedMarkTaken}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.stillMissedMarkTaken')}
                  >
                    <Text style={styles.modalConfirmText}>{t('home.stillMissedMarkTaken')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalCancelBtnFull}
                    onPress={confirmStillMissedKeep}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.stillMissedKeep')}
                  >
                    <Text style={styles.modalCancelText}>{t('home.stillMissedKeep')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {confirmDialog?.kind === 'recalculate' && (
              <>
                <Text style={styles.modalTitle}>{t('home.recalculateTitle')}</Text>
                <Text style={styles.modalMessage}>
                  {t('home.recalculateMessage', {
                    name: maskMedicationName(confirmDialog.medication.name, isPrivate),
                    time: format(confirmDialog.anchor, 'HH:mm'),
                  })}
                </Text>
                <View style={styles.modalActionsColumn}>
                  <TouchableOpacity
                    style={styles.modalConfirmBtnFull}
                    onPress={confirmRecalculateForever}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.recalculateForever')}
                  >
                    <Text style={styles.modalConfirmText}>{t('home.recalculateForever')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalCancelBtnFull}
                    onPress={confirmRecalculateOnlyToday}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.recalculateOnlyToday')}
                  >
                    <Text style={styles.modalCancelText}>{t('home.recalculateOnlyToday')}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.specificTimeLink}
                  onPress={closeConfirmDialog}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.specificTimeLinkText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      {alertDialog}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // overflow hidden mantém a marca d'água recortada dentro do header.
    header: { backgroundColor: c.headerBg, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20, overflow: 'hidden' },
    // Grande e quase transparente: presença de marca sem brigar com
    // data/título por atenção (feedback "nem que seja como marca d'água").
    brandWatermark: {
      position: 'absolute', top: -44, right: -32, width: 170, height: 170, opacity: 0.12,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    caregiverBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, marginTop: 12,
    },
    caregiverBannerText: { color: c.headerText, fontSize: 13, fontWeight: '600' },
    brandMark: { width: 30, height: 30, opacity: 0.92 },
    date: { color: c.headerSubtext, fontSize: 13, textTransform: 'capitalize' },
    title: { color: c.headerText, fontSize: 24, fontWeight: '700', marginTop: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    streakBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 12,
      paddingHorizontal: 8, paddingVertical: 3, marginTop: 2,
    },
    streakBadgeText: { color: '#f59e0b', fontWeight: '700', fontSize: 13 },
    progress: { color: c.headerSubtext, fontSize: 13, marginTop: 4 },
    profileList: { marginTop: 14 },
    // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08) —
    // troca de perfil ativo, ação real e usada com frequência.
    profileChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48,
      backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
    },
    // Achado real testando no dispositivo (2026-08-13): usava c.surface,
    // que é claro no tema claro (destaca bem) mas escuro no tema escuro
    // — o chip "selecionado" virava o mais escuro da fileira, invertendo
    // a hierarquia visual. c.headerText é claro nos dois temas (é a cor
    // pensada pra ler sobre o header colorido), então o chip ativo
    // sempre fica o mais claro/destacado, não o mais escuro.
    profileChipActive: { backgroundColor: c.headerText },
    profileChipText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
    profileChipTextActive: { color: c.headerBg },
    stockBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, padding: 12,
      backgroundColor: c.brandSubtle, borderRadius: 12,
      borderWidth: 1, borderColor: c.warning,
    },
    stockBannerText: { flex: 1, fontSize: 13, color: c.text, fontWeight: '500' },
    list: { padding: 16, gap: 10 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24 },
    gridRow: { gap: 12 },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10, marginTop: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    // minHeight 48 (WCAG AAA, achado revisando toque mínimo 2026-09-05
    // — mesmo estilo replicado em medications.tsx, mantido igual nos
    // dois pra não virar botão idêntico com altura diferente).
    emptyBtn: { backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8, minHeight: 48, justifyContent: 'center' },
    emptyBtnText: { color: c.onBrand, fontWeight: '600', fontSize: 15 },
    card: {
      backgroundColor: c.surface, borderRadius: 16, flexDirection: 'row',
      overflow: 'hidden',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardDone: { opacity: 0.6 },
    colorBar: { width: 5, alignSelf: 'stretch' },
    // Card virou 2 fileiras (2026-09-09) — `cardContent` é a coluna que
    // segura as duas (nome+horário em cima, ações/status embaixo);
    // `alignSelf: 'stretch'` do colorBar continua acompanhando a altura
    // total, agora maior quando a fileira de ações existe.
    cardContent: { flex: 1, paddingVertical: 14 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center' },
    timeCol: { paddingHorizontal: 12, alignItems: 'center' },
    time: { fontSize: 15, fontWeight: '700', color: c.brand },
    // Sem `color` fixo (2026-09-11) — agora serve tanto "Perdido"
    // (c.warning) quanto "Atrasado" (c.delayed), cor sempre passada
    // inline no JSX conforme o status.
    missedLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
    // paddingRight (não mais paddingVertical, que subiu pro cardContent)
    // — evita o texto colar na borda direita do card.
    cardBody: { flex: 1, paddingRight: 12 },
    medName: { fontSize: 15, fontWeight: '600', color: c.text },
    medDosage: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    pendingSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    pendingSyncText: { fontSize: 10, color: c.textMuted },
    // Fileira própria pras ações (2026-09-09, achado real do Rilson com
    // screenshot) — antes dividia espaço com o nome do remédio na MESMA
    // fileira; num nome comprido ("Maleato de dexclorfeniramina +
    // betametasona"), cada vez sobrava menos espaço pro texto conforme
    // os botões ganhavam rótulo visível (achado de UX anterior),
    // quebrando palavra no meio. Agora nome e ações têm fileira própria,
    // cada uma com a largura toda do card.
    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, marginTop: 10 },
    // minHeight 48 nos 3 (WCAG AAA, 2026-09-08). flex:1 só no Tomei
    // (2026-09-09) — com fileira própria agora, sobra espaço; a ação
    // principal usa esse espaço pra virar o botão mais fácil de
    // acertar, em vez de disputar tamanho igual com os outros dois.
    takeButton: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.brand,
      paddingVertical: 12, borderRadius: 12, minHeight: 48,
    },
    takeButtonText: { color: c.onBrand, fontWeight: '700', fontSize: 14 },
    // "Foi em outro horário" (item 8, 2026-09-08; rótulo visível
    // adicionado em 2026-09-08 num achado de UX à parte — ícone sozinho
    // não dava pra entender o que fazia).
    customTimeButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, minHeight: 48,
      backgroundColor: c.surfaceSecondary,
    },
    customTimeButtonText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    // Sem minWidth/minHeight aqui de propósito — ícone "X" sozinho, lado
    // a lado com dois botões que já têm texto; crescer o quadrado pra
    // 48x48 inflava a fileira inteira. hitSlop no JSX (ver abaixo)
    // resolve o toque mínimo sem mexer no visual.
    skipButton: { padding: 10, borderRadius: 10, backgroundColor: c.surfaceSecondary },
    // Modal "Foi em outro horário?" — mesmo padrão visual de
    // ConfirmDialog/AlertDialog (backdrop escuro, card claro, cantos
    // arredondados), só que local a esta tela por precisar de
    // conteúdo que os dois componentes genéricos não suportam.
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    modalContent: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface,
      borderRadius: 18, padding: 20,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 14 },
    // "No horário previsto" (2026-09-11) — cor de destaque (mesma do
    // botão principal dos outros diálogos), largura cheia, ACIMA do
    // grid neutro dos atalhos — é a resposta mais comum na prática
    // (pequeno atraso trivial), merece ser a mais fácil de achar/tocar.
    onScheduleChip: {
      minHeight: 48, borderRadius: 12, backgroundColor: c.brand,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
      marginBottom: 10,
    },
    onScheduleChipText: { color: c.onBrand, fontWeight: '600', fontSize: 15 },
    // Atalhos relativos (2026-09-11) — grid 2x2, cada chip com o mesmo
    // minHeight 48 dos outros botões do modal (WCAG AAA).
    quickTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    quickTimeChip: {
      flexBasis: '47%', flexGrow: 1, minHeight: 48, borderRadius: 12,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    },
    quickTimeChipText: { color: c.text, fontWeight: '600', fontSize: 15 },
    specificTimeLink: { alignItems: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' },
    specificTimeLinkText: { color: c.brand, fontWeight: '600', fontSize: 14 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    // minHeight 48 + justifyContent (WCAG AAA, 2026-09-08) — column
    // layout, botão de largura cheia dentro do modal, crescer aqui é
    // só um botão normal ficando mais alto, sem efeito colateral visual.
    modalCancelBtn: { flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    modalCancelText: { color: c.textSecondary, fontWeight: '600' },
    modalConfirmBtn: { flex: 1, backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    modalConfirmText: { color: c.onBrand, fontWeight: '600' },
    // Corpo de texto pros 3 diálogos de confirmação novos (2026-09-11)
    // — mesmo estilo do `message` do AlertDialog genérico, mas local
    // aqui (esses diálogos têm 2 ações reais, não cabem nele).
    modalMessage: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginTop: -4, marginBottom: 4 },
    // Empilhado, não lado a lado (2026-09-11) — os 3 diálogos novos têm
    // textos de botão mais longos ("Sempre, a partir de agora",
    // "Marcar como tomada") que ficariam espremidos numa fileira de 2
    // (padrão já usado em `modalActions`, reservado pros diálogos de
    // texto curto como Cancelar/Registrar).
    modalActionsColumn: { gap: 10, marginTop: 20 },
    modalConfirmBtnFull: {
      backgroundColor: c.brand, padding: 13, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center', minHeight: 48,
    },
    modalCancelBtnFull: {
      backgroundColor: c.surfaceSecondary, padding: 13, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center', minHeight: 48,
    },
    // minHeight 48 (2026-09-08) — badge com texto ("Tomado" + ícone de
    // desfazer), não um ícone sozinho; cabe na altura que o card já tem
    // (2 linhas de texto ao lado já passam de 48px), sem esticar nada.
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 14, paddingVertical: 4, minHeight: 48 },
    undoIcon: { marginLeft: 2, opacity: 0.6 },
    // Ícone de coração sozinho — hitSlop, não padding/minHeight
    // (2026-09-08, mesmo raciocínio do skipButton acima): preserva o
    // visual compacto, só expande a área de toque.
    reactButton: { paddingHorizontal: 12, paddingVertical: 8 },
    reactedIndicator: { paddingRight: 14 },
    takenText: { color: c.success, fontWeight: '600', fontSize: 13 },
    skippedText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
    // Mesmo estilo do FAB de Remédios (2026-09-02) — "+" também na Home,
    // pedido explícito pra não obrigar trocar de aba pra adicionar.
    fab: {
      position: 'absolute', right: 24, bottom: 24,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
      elevation: 6, shadowColor: c.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
  });
}
