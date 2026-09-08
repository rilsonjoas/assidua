import { useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
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
import { maskMedicationName } from '../../lib/privacy';
import { getTodayDoses, getAdherenceStreak, logDose, undoDose, reactToDose, DoseLog } from '../../services/doses';
import { LOW_STOCK_DAYS_THRESHOLD, formatDosageUnit, recalculateScheduleToday } from '../../services/medications';
import { api } from '../../services/api';
import { syncOwnedProfileTimezones } from '../../services/device';
import { rescheduleTodayOccurrences } from '../../services/notifications';
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
  const { isPrivate, togglePrivacy } = usePrivacyStore();
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
  const [customTimeDose, setCustomTimeDose] = useState<DoseLog | null>(null);
  const [customTime, setCustomTime] = useState('');

  function openCustomTimeModal(dose: DoseLog) {
    const now = new Date();
    setCustomTime(format(now, 'HH:mm'));
    setCustomTimeDose(dose);
  }

  function closeCustomTimeModal() {
    setCustomTimeDose(null);
    setCustomTime('');
  }

  function confirmCustomTime() {
    if (!customTimeDose) return;
    if (!/^\d{2}:\d{2}$/.test(customTime)) {
      showAlert(t('home.errorInvalidTimeFormat'));
      return;
    }
    const [hour, minute] = customTime.split(':').map(Number);
    if (hour > 23 || minute > 59) {
      showAlert(t('home.errorInvalidTimeFormat'));
      return;
    }
    // Base no DIA do horário previsto, não "hoje" (achado de revisão de
    // código, 2026-09-08): sem isso, registrar depois da meia-noite uma
    // dose de antes dela (ex.: prevista 23:50, só registrada às 00:10)
    // jogava o horário digitado pro dia seguinte — 13h+ no futuro em vez
    // de minutos atrás — distorcendo o cálculo de diferença/recálculo.
    const takenAt = parseISO(customTimeDose.scheduled_at);
    takenAt.setHours(hour, minute, 0, 0);
    const dose = customTimeDose;
    closeCustomTimeModal();
    markDose.mutate({ dose, takenAt });
  }

  useEffect(() => {
    api.get('/profiles').then(({ data }) => {
      setProfiles(data);
      // Best-effort, silencioso — autocorrige quem já tinha perfil antes
      // do fuso existir (ver services/device.ts).
      syncOwnedProfileTimezones(data);
    });
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
  });

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
        taken_at: (takenAt ?? new Date()).toISOString(),
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

      // "Dose fora do horário": oferece recalcular o resto do dia só
      // quando (a) a pessoa realmente escolheu um horário diferente,
      // (b) o remédio é modo intervalo — horário fixo não tem "próxima
      // dose" pra deslocar, só registra atrasado (decisão de produto
      // confirmada, ver roadmap item 8) — e (c) a diferença é grande o
      // bastante pra valer a pena perguntar (limiar de 30min também
      // decidido: atraso pequeno não interrompe com pergunta nenhuma).
      if (takenAt && dose.dose_schedule.interval_hours != null) {
        const diffMinutes = Math.abs(takenAt.getTime() - parseISO(dose.scheduled_at).getTime()) / 60000;
        if (diffMinutes >= 30) {
          offerRecalculateToday(dose.dose_schedule_id, takenAt, dose.medication);
        }
      }
    },
  });

  function offerRecalculateToday(
    scheduleId: number,
    anchor: Date,
    medication: { name: string; dosage: string | null; unit: string },
  ) {
    // `anchorLabel` (HH:mm no fuso do APARELHO) é só pra mostrar na
    // mensagem — a pessoa lendo está olhando o próprio aparelho, então
    // mostrar a hora local dela aqui é o certo. O que vai pro backend é
    // `anchor.toISOString()`, o instante absoluto (2026-09-08, achado
    // de auditoria de fuso horário) — o backend converte pro fuso do
    // PERFIL antes de gravar, não confia mais num "H:i" nu que
    // presumia aparelho e perfil no mesmo fuso.
    const anchorLabel = format(anchor, 'HH:mm');
    showAlert(
      t('home.recalculateTitle'),
      t('home.recalculateMessage', { time: anchorLabel }),
      {
        label: t('home.recalculateAction'),
        onPress: async () => {
          try {
            const result = await recalculateScheduleToday(scheduleId, anchor.toISOString());
            queryClient.invalidateQueries({ queryKey: ['today-doses'] });
            showToast(t('home.recalculatedToast'));
            // Resincroniza os lembretes locais (2026-09-08, revisitando
            // a limitação aceita) — best-effort, de propósito: a tela
            // Hoje já está correta pelo invalidateQueries acima
            // (fonte de verdade real); se o agendamento de notificação
            // falhar (permissão negada, etc.), não desfaz o recálculo
            // nem assusta a pessoa com um erro sobre algo secundário.
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
        },
      },
    );
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
            onPress={togglePrivacy}
            accessibilityRole="button"
            accessibilityLabel={t('profile.privacyToggle')}
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
            const missed = item.status === 'missed';
            const time = format(parseISO(item.scheduled_at), 'HH:mm');
            const maskedName = maskMedicationName(item.medication.name, isPrivate);
            return (
              <View style={[styles.card, (taken || skipped) && styles.cardDone, isWide && { flex: 1 }]}>
                <View style={[styles.colorBar, { backgroundColor: missed ? colors.warning : item.medication.color }]} />
                <View style={styles.timeCol}>
                  <Text style={[styles.time, missed && { color: colors.warning }]}>{time}</Text>
                  {missed && <Text style={styles.missedLabel}>{t('home.delayed')}</Text>}
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
                {!taken && !skipped && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.takeButton}
                      onPress={() => markDose.mutate({ dose: item })}
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
                      onPress={() => openCustomTimeModal(item)}
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
                )}
                {taken && isCaregiverView && (
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
                {taken && !isCaregiverView && !!item.reacted_at && (
                  <View style={styles.reactedIndicator} accessible accessibilityLabel={t('home.reactedByLabel', { name: item.reacted_by_name })}>
                    <MaterialCommunityIcons name="heart" size={14} color={colors.brand} />
                  </View>
                )}
                {skipped && (
                  <TouchableOpacity
                    style={styles.statusBadge}
                    onPress={() => undoMutation.mutate(item)}
                    disabled={undoMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.skippedLabel', { name: item.medication.name, time })}
                    accessibilityHint={t('home.undoHint')}
                  >
                    <MaterialCommunityIcons name="minus-circle" size={18} color={colors.textMuted} />
                    <Text style={styles.skippedText}>{t('home.skipped')}</Text>
                    <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                  </TouchableOpacity>
                )}
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
      {/* "Foi em outro horário?" (item 8, 2026-09-08) — mesmo padrão de
          entrada HH:MM já usado no formulário de horário do remédio
          (texto simples, não um seletor nativo novo — menos risco,
          mais consistente com o resto do app). */}
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
            <TextInput
              style={styles.customTimeInput}
              value={customTime}
              onChangeText={setCustomTime}
              placeholder="14:30"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              autoFocus
              accessibilityLabel={t('home.customTimeInputLabel')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={closeCustomTimeModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmCustomTime}
                accessibilityRole="button"
                accessibilityLabel={t('home.customTimeConfirm')}
              >
                <Text style={styles.modalConfirmText}>{t('home.customTimeConfirm')}</Text>
              </TouchableOpacity>
            </View>
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
      alignItems: 'center', overflow: 'hidden',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardDone: { opacity: 0.6 },
    colorBar: { width: 5, alignSelf: 'stretch' },
    timeCol: { paddingHorizontal: 12, alignItems: 'center' },
    time: { fontSize: 15, fontWeight: '700', color: c.brand },
    missedLabel: { fontSize: 10, fontWeight: '600', color: c.warning, marginTop: 2 },
    cardBody: { flex: 1, paddingVertical: 16 },
    medName: { fontSize: 15, fontWeight: '600', color: c.text },
    medDosage: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    pendingSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    pendingSyncText: { fontSize: 10, color: c.textMuted },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12 },
    // minHeight 48 nos 3 botões da fileira de ações (WCAG AAA, auditoria
    // de toque mínimo 2026-09-08) — Tomei/Outro horário/Pular ficam lado
    // a lado, então dividem a mesma altura mínima pra ficar alinhados.
    takeButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: c.brand,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, minHeight: 48,
    },
    takeButtonText: { color: c.onBrand, fontWeight: '600', fontSize: 13 },
    // "Foi em outro horário" (item 8, 2026-09-08; rótulo visível
    // adicionado em 2026-09-08 num achado de UX à parte — ícone sozinho
    // não dava pra entender o que fazia). Ganhou texto, então não usa
    // mais o mesmo padding quadrado do skipButton ao lado.
    customTimeButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minHeight: 48,
      backgroundColor: c.surfaceSecondary,
    },
    customTimeButtonText: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    // Sem minWidth/minHeight aqui de propósito — ícone "X" sozinho, lado
    // a lado com dois botões que já têm texto; crescer o quadrado pra
    // 48x48 inflava a fileira inteira. hitSlop no JSX (ver abaixo)
    // resolve o toque mínimo sem mexer no visual.
    skipButton: { padding: 6, borderRadius: 8, backgroundColor: c.surfaceSecondary },
    // Modal "Foi em outro horário?" — mesmo padrão visual de
    // ConfirmDialog/AlertDialog (backdrop escuro, card claro, cantos
    // arredondados), só que local a esta tela por precisar de um
    // TextInput no meio (os dois componentes genéricos não suportam).
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    modalContent: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface,
      borderRadius: 18, padding: 20,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 14 },
    customTimeInput: {
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 14, fontSize: 18, color: c.text, textAlign: 'center',
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    // minHeight 48 + justifyContent (WCAG AAA, 2026-09-08) — column
    // layout, botão de largura cheia dentro do modal, crescer aqui é
    // só um botão normal ficando mais alto, sem efeito colateral visual.
    modalCancelBtn: { flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    modalCancelText: { color: c.textSecondary, fontWeight: '600' },
    modalConfirmBtn: { flex: 1, backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    modalConfirmText: { color: c.onBrand, fontWeight: '600' },
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
