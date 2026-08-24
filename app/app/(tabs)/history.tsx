import { useState, useMemo } from 'react';
import {
  View,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { maskMedicationName } from '../../lib/privacy';
import { generateConsultationReportHtml } from '../../lib/reportHtml';
import { exportConsultationReportPdf } from '../../lib/reportPdf';
import { getDoseHistory, getWeeklyAdherence, getConsultationSummary, DoseLog, HistoryFilters } from '../../services/doses';
import { getMedications, formatDosageUnit } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
export { ErrorBoundary } from '../../components/ErrorBoundary';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';
import { AdherenceChart } from '../../components/AdherenceChart';
import { useAlertDialog } from '../../hooks/useAlertDialog';

type StatusFilter = 'all' | 'taken' | 'skipped' | 'missed';

const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;
const DATE_FORMAT: Record<string, string> = {
  pt: "EEEE, d 'de' MMMM",
  es: "EEEE, d 'de' MMMM",
  en: 'EEEE, MMMM d',
};

function sectionTitle(dateStr: string, lang: string, t: (key: string) => string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return t('history.today');
  if (isYesterday(date)) return t('history.yesterday');
  const locale = DATE_FNS_LOCALES[lang as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
  return format(date, DATE_FORMAT[lang] ?? DATE_FORMAT.pt, { locale });
}

function groupByDate(logs: DoseLog[], lang: string, t: (key: string) => string): { title: string; data: DoseLog[] }[] {
  const map = new Map<string, DoseLog[]>();
  for (const log of logs) {
    const key = log.scheduled_at.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return Array.from(map.entries()).map(([date, data]) => ({
    title: sectionTitle(date + 'T00:00:00', lang, t),
    data,
  }));
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const { activeProfile } = useProfileStore();
  const { isPrivate } = usePrivacyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [medicationFilter, setMedicationFilter] = useState<number | 'all'>('all');

  const { data: medications = [] } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const { data: weeklyAdherence = [] } = useQuery({
    queryKey: ['weekly-adherence', activeProfile?.id],
    queryFn: () => getWeeklyAdherence(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'taken', label: t('history.filterTaken') },
    { key: 'skipped', label: t('history.filterSkipped') },
    { key: 'missed', label: t('history.filterMissed') },
  ];

  const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = {
    taken: { label: t('history.filterTaken'), color: '#22c55e', icon: 'check-circle' },
    skipped: { label: t('history.filterSkipped'), color: '#f59e0b', icon: 'minus-circle' },
    missed: { label: t('history.filterMissed'), color: '#ef4444', icon: 'close-circle' },
    pending: { label: t('history.filterPending'), color: '#94a3b8', icon: 'clock-outline' },
  };

  const filters: HistoryFilters = {};
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (medicationFilter !== 'all') filters.medication_id = medicationFilter;
  const hasActiveFilter = statusFilter !== 'all' || medicationFilter !== 'all';

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['history', activeProfile?.id, filters],
    queryFn: () => getDoseHistory(activeProfile!.id, filters),
    enabled: !!activeProfile,
  });

  const logs: DoseLog[] = data?.data ?? [];
  const sections = useMemo(() => groupByDate(logs, i18n.language, t), [logs, i18n.language]);

  const takenCount = logs.filter((l) => l.status === 'taken').length;
  const totalCount = logs.length;
  const adherence = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : null;

  const [sharingSummary, setSharingSummary] = useState(false);
  const { showAlert, alertDialog } = useAlertDialog();
  async function handleShareSummary() {
    if (!activeProfile) return;
    setSharingSummary(true);
    try {
      const summary = await getConsultationSummary(activeProfile.id, 30);
      const dateLocale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
      const missedLines = summary.missed
        .map((m) => `• ${maskMedicationName(m.medication_name, isPrivate)} — ${format(parseISO(m.scheduled_at), "d 'de' MMMM, HH:mm", { locale: dateLocale })}`)
        .join('\n');
      const message = t('history.consultationSummaryText', {
        profileName: activeProfile.name,
        percentage: summary.percentage ?? 0,
        taken: summary.taken,
        due: summary.due,
        missedList: missedLines || t('history.consultationSummaryNoMissed'),
      });
      await Share.share({ message });
    } catch (err: any) {
      console.error('[shareSummary error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), err.response?.data?.message ?? err.message ?? t('history.consultationSummaryError'));
    } finally {
      setSharingSummary(false);
    }
  }

  async function handlePrintReport() {
    if (!activeProfile) return;
    setSharingSummary(true);
    try {
      const summary = await getConsultationSummary(activeProfile.id, 30);
      await exportConsultationReportPdf({
        profileName: activeProfile.name,
        periodDays: 30,
        percentage: summary.percentage,
        taken: summary.taken,
        due: summary.due,
        missed: summary.missed.map((m) => ({
          ...m,
          medication_name: maskMedicationName(m.medication_name, isPrivate),
        })),
        medications: medications.map((m) => ({
          name: maskMedicationName(m.name, isPrivate),
          dosage: m.dosage,
          unit: m.unit,
          schedules: m.schedules,
        })),
      });
    } catch (err: any) {
      console.error('[printReport error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), err.response?.data?.message ?? err.message ?? t('history.consultationSummaryError'));
    } finally {
      setSharingSummary(false);
    }
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, isWide && styles.listWide]}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {adherence !== null && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{takenCount}</Text>
                  <Text style={styles.summaryLabel}>{t('history.summaryTaken')}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{totalCount - takenCount}</Text>
                  <Text style={styles.summaryLabel}>{t('history.summaryMissed')}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: adherence >= 80 ? colors.success : colors.warning }]}>
                    {adherence}%
                  </Text>
                  <Text style={styles.summaryLabel}>{t('history.summaryAdherence')}</Text>
                </View>
              </View>
            )}

            <AdherenceChart data={weeklyAdherence} />

            <View style={[styles.consultationButtonsRow, isWide && styles.consultationButtonsRowWide]}>
              <TouchableOpacity
                style={[styles.consultationButton, styles.consultationPdfButton]}
                onPress={handlePrintReport}
                disabled={sharingSummary}
                accessibilityRole="button"
                accessibilityLabel={t('history.exportPdf')}
              >
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.onBrand} />
                <Text style={styles.consultationPdfButtonText}>{t('history.exportPdf')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.consultationButton}
                onPress={handleShareSummary}
                disabled={sharingSummary}
                accessibilityRole="button"
                accessibilityLabel={t('history.shareConsultationSummary')}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.brand} />
                <Text style={styles.consultationButtonText}>{t('history.shareConsultationSummary')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filtersWrapper}>
              <View style={styles.filterWrapGroup}>
                {STATUS_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                    onPress={() => setStatusFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.filterLabel', { label: f.label })}
                    accessibilityState={{ selected: statusFilter === f.key }}
                  >
                    <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {medications.length > 0 && (
                <View style={[styles.filterWrapGroup, { marginTop: 10 }]}>
                  <TouchableOpacity
                    style={[styles.filterChip, medicationFilter === 'all' && styles.filterChipActive]}
                    onPress={() => setMedicationFilter('all')}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.filterLabel', { label: t('history.filterAllMedications') })}
                    accessibilityState={{ selected: medicationFilter === 'all' }}
                  >
                    <Text style={[styles.filterChipText, medicationFilter === 'all' && styles.filterChipTextActive]}>
                      {t('history.filterAllMedications')}
                    </Text>
                  </TouchableOpacity>
                  {medications.map((m) => {
                    const maskedMedName = maskMedicationName(m.name, isPrivate);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.filterChip, styles.medicationChip, medicationFilter === m.id && styles.filterChipActive]}
                        onPress={() => setMedicationFilter(m.id)}
                        accessibilityRole="button"
                        accessibilityLabel={t('history.filterLabel', { label: maskedMedName })}
                        accessibilityState={{ selected: medicationFilter === m.id }}
                      >
                        <View style={[styles.medicationChipDot, { backgroundColor: m.color }]} />
                        <Text style={[styles.filterChipText, medicationFilter === m.id && styles.filterChipTextActive]}>
                          {maskedMedName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList lines={2} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {hasActiveFilter ? t('history.emptyFiltered') : t('history.emptyGeneric')}
              </Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderBox}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.brand} />
            <Text style={styles.sectionHeader}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.missed;
          const time = format(parseISO(item.scheduled_at), 'HH:mm');
          const maskedName = maskMedicationName(item.medication.name, isPrivate);
          return (
            <View
              style={styles.row}
              accessible
              accessibilityLabel={t('history.rowLabel', {
                name: maskedName,
                dosageUnit: formatDosageUnit(item.medication.dosage, item.medication.unit),
                time,
                status: cfg.label,
              })}
            >
              <View style={styles.timeBox}>
                <Text style={styles.time}>{time}</Text>
              </View>
              <View style={[styles.colorBar, { backgroundColor: item.medication.color }]} />
              <View style={styles.rowBody}>
                <Text style={styles.medName}>{maskedName}</Text>
                <Text style={styles.dosage}>
                  {formatDosageUnit(item.medication.dosage, item.medication.unit)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: cfg.color + '1f' }]}>
                <MaterialCommunityIcons name={cfg.icon} size={18} color={cfg.color} />
                <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
          );
        }}
      />
      {alertDialog}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerContainer: { paddingBottom: 8 },
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      paddingVertical: 18,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 26, fontWeight: '700', color: c.text },
    summaryLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 4 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    consultationButtonsRow: {
      flexDirection: 'column',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 14,
      marginBottom: 14,
    },
    consultationButtonsRowWide: {
      flexDirection: 'row',
    },
    consultationButton: {
      width: '100%',
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 50,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    consultationButtonText: { color: c.brand, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    consultationPdfButton: { backgroundColor: c.brand, borderColor: c.brand },
    consultationPdfButtonText: { color: c.onBrand, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    filtersWrapper: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
    filterWrapGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.border,
      minHeight: 44,
    },
    filterChipActive: { backgroundColor: c.brandSubtle, borderColor: c.brand },
    filterChipText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    filterChipTextActive: { color: c.brand, fontWeight: '700' },
    medicationChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    medicationChipDot: { width: 10, height: 10, borderRadius: 5 },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 8 },
    sectionHeaderBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: c.background,
    },
    sectionHeader: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 14,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      marginBottom: 10,
    },
    timeBox: { paddingHorizontal: 14, alignItems: 'center', minWidth: 60 },
    time: { fontSize: 16, fontWeight: '700', color: c.brand },
    colorBar: { width: 5, alignSelf: 'stretch' },
    rowBody: { flex: 1, paddingVertical: 16, paddingLeft: 14 },
    medName: { fontSize: 16, fontWeight: '700', color: c.text },
    dosage: { fontSize: 14, color: c.textMuted, marginTop: 4 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      marginRight: 14,
    },
    statusLabel: { fontSize: 13, fontWeight: '700' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textSecondary },
    emptyText: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 },
  });
}
