import { useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
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
import { getTodayDoses, getAdherenceStreak, logDose, undoDose, DoseLog } from '../../services/doses';
import { LOW_STOCK_DAYS_THRESHOLD, formatDosageUnit } from '../../services/medications';
import { api } from '../../services/api';
import { syncOwnedProfileTimezones } from '../../services/device';
import { isNetworkError } from '../../services/sync';
import { enqueueLog, enqueueUndo, cancelPendingLog, applyPendingOverlay } from '../../services/offlineQueue';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';

// Mesmo mapa de locale do date-fns usado no Histórico.
const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;
const DATE_FORMAT: Record<string, string> = {
  pt: "EEEE, d 'de' MMMM",
  es: "EEEE, d 'de' MMMM",
  en: 'EEEE, MMMM d',
};

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { activeProfile, profiles, setProfiles, setActiveProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      if (log._pendingSync) return; // offline — o resto acontece quando a fila drenar

      // Haptic feedback (Fase 1) — só no sucesso, não no toque em si:
      // vibrar antes de confirmar que salvou daria falso positivo se a
      // chamada falhar.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });

      // Streak (Fase 2) — o backend só manda streak_milestone quando esta
      // ação específica fechou o dia num número redondo (7/30/60).
      if (log.streak_milestone) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          t('home.streakMilestoneTitle'),
          t('home.streakMilestoneText', { count: log.streak_milestone }),
        );
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

  // Corrigir dose (Fase 1) — desmarcar "Tomei"/"Pulei" feito por engano.
  const undoMutation = useMutation({
    mutationFn: async (dose: DoseLog) => {
      // Dose marcada offline e ainda não sincronizada — desfazer não
      // precisa contatar o servidor, só cancela a ação enfileirada
      // (senão o servidor chegaria a saber de uma dose que, do ponto de
      // vista de quem usa, nunca existiu de verdade).
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
      if (result.queued || dose._pendingSync) return; // nada mais a fazer agora
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
    },
  });

  const locale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
  const dateFormat = DATE_FORMAT[i18n.language] ?? DATE_FORMAT.pt;
  const today = format(new Date(), dateFormat, { locale });
  const takenCount = doses.filter((d) => d.status === 'taken').length;

  // Refill alert inteligente (Fase 1) — nomes únicos com estoque baixo
  // entre os medicamentos que têm dose hoje, pra um banner compacto.
  const lowStockNames = Array.from(
    new Set(
      doses
        .filter((d) => {
          const days = d.medication.days_remaining;
          return days !== null && days <= LOW_STOCK_DAYS_THRESHOLD;
        })
        .map((d) => d.medication.name),
    ),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* Marca (2026-08-14): feedback do Rilson — o app tinha o
              ícone novo, mas nenhum ponto de ancoragem *dentro* das
              telas. Um só lugar (aqui, a primeira tela que a pessoa vê)
              é de propósito — espalhar o logo em toda tela lê como
              inseguro, não como identidade. Usa a silhueta monocromática
              branca, já pensada pra ficar sobre uma cor sólida. */}
          <Image
            source={require('../../assets/android-icon-monochrome.png')}
            style={styles.brandMark}
            accessible={false}
            importantForAccessibility="no"
          />
          <View>
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
          {/* Achado real de uso, anotado no Obsidian (2026-08-14): o
              botão levava pra lista de Remédios, não pro cadastro
              direto — mais um toque do que precisava. */}
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
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const taken = item.status === 'taken';
            const skipped = item.status === 'skipped';
            const missed = item.status === 'missed';
            const time = format(parseISO(item.scheduled_at), 'HH:mm');
            return (
              <View style={[styles.card, (taken || skipped) && styles.cardDone]}>
                <View style={[styles.colorBar, { backgroundColor: missed ? colors.warning : item.medication.color }]} />
                <View style={styles.timeCol}>
                  <Text style={[styles.time, missed && { color: colors.warning }]}>{time}</Text>
                  {missed && <Text style={styles.missedLabel}>{t('home.delayed')}</Text>}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.medName}>{item.medication.name}</Text>
                  <Text style={styles.medDosage}>{formatDosageUnit(item.medication.dosage, item.medication.unit)}</Text>
                  {/* Offline support (2026-08-17) — só aparece quando a
                      ação ainda está na fila local, esperando conexão. */}
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
                      accessibilityLabel={t('home.markTakenLabel', { name: item.medication.name, time })}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                      <Text style={styles.takeButtonText}>{t('home.take')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={() => skipDose.mutate(item)}
                      disabled={skipDose.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.skipLabel', { name: item.medication.name, time })}
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
                    accessibilityLabel={t('home.takenLabel', { name: item.medication.name, time })}
                    accessibilityHint={t('home.undoHint')}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                    <Text style={styles.takenText}>{t('home.taken')}</Text>
                    <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                  </TouchableOpacity>
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
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { backgroundColor: c.headerBg, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
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
    takenText: { color: c.success, fontWeight: '600', fontSize: 13 },
    skippedText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
  });
}
