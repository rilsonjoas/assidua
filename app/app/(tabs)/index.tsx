import { useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,

  Image,
} from 'react-native';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { maskMedicationName } from '../../lib/privacy';
import { getTodayDoses, getAdherenceStreak, logDose, undoDose, reactToDose, DoseLog } from '../../services/doses';
import { LOW_STOCK_DAYS_THRESHOLD, formatDosageUnit } from '../../services/medications';
import { api } from '../../services/api';
import { syncOwnedProfileTimezones } from '../../services/device';
export { ErrorBoundary } from '../../components/ErrorBoundary';
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
  const { t, i18n } = useTranslation();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

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
    mutationFn: async (dose: DoseLog) => {
      const payload = {
        dose_schedule_id: dose.dose_schedule_id,
        medication_id: dose.medication_id,
        profile_id: dose.profile_id,
        scheduled_at: dose.scheduled_at,
        taken_at: new Date().toISOString(),
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
    onSuccess: (log, dose) => {
      queryClient.setQueryData<DoseLog[]>(['today-doses', dose.profile_id], (old) =>
        old?.map((d) => (d.id === dose.id ? { ...d, ...log } : d)),
      );

      showToast(t('home.doseSuccessToast', { name: maskMedicationName(dose.medication.name, isPrivate) }));

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
      }
    },
  });

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
              <Text style={styles.progress}>{t('home.progress', { count: takenCount, total: doses.length })}</Text>
            )}
          </View>
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
                <View style={styles.cardBody}>
                  <Text style={styles.medName}>{maskedName}</Text>
                  <Text style={styles.medDosage}>{formatDosageUnit(item.medication.dosage, item.medication.unit)}</Text>
                  {item._pendingSync && (
                    <View style={styles.pendingSyncRow}>
                      <MaterialCommunityIcons name="cloud-off-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.pendingSyncText}>{t('home.pendingSync')}</Text>
                    </View>
                  )}
                </View>
                {!taken && !skipped && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.takeButton}
                      onPress={() => markDose.mutate(item)}
                      disabled={markDose.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.markTakenLabel', { name: maskedName, time })}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                      <Text style={styles.takeButtonText}>{t('home.take')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={() => skipDose.mutate(item)}
                      disabled={skipDose.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.skipLabel', { name: maskedName, time })}
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
      {!!toastMessage && (
        <View style={styles.toastContainer} accessible accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
      {alertDialog}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    toastContainer: {
      position: 'absolute',
      bottom: 24,
      left: 20,
      right: 20,
      backgroundColor: c.success,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      zIndex: 999,
    },
    toastText: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
    // overflow hidden mantém a marca d'água recortada dentro do header.
    header: { backgroundColor: c.headerBg, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20, overflow: 'hidden' },
    // Grande e quase transparente: presença de marca sem brigar com
    // data/título por atenção (feedback "nem que seja como marca d'água").
    brandWatermark: {
      position: 'absolute', top: -44, right: -32, width: 170, height: 170, opacity: 0.12,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
    profileChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
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
    emptyBtn: { backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
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
    takeButton: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.brand,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    },
    takeButtonText: { color: c.onBrand, fontWeight: '600', fontSize: 13 },
    skipButton: { padding: 6, borderRadius: 8, backgroundColor: c.surfaceSecondary },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 14, paddingVertical: 4 },
    undoIcon: { marginLeft: 2, opacity: 0.6 },
    reactButton: { paddingHorizontal: 12, paddingVertical: 8 },
    reactedIndicator: { paddingRight: 14 },
    takenText: { color: c.success, fontWeight: '600', fontSize: 13 },
    skippedText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
  });
}
