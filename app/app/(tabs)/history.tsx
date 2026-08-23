import { useState, useMemo } from 'react';
import {
  View,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { getDoseHistory, getWeeklyAdherence, getConsultationSummary, DoseLog, HistoryFilters } from '../../services/doses';
import { getMedications, formatDosageUnit } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';
import { AdherenceChart } from '../../components/AdherenceChart';
import { showAlert } from '../../lib/alert';

type StatusFilter = 'all' | 'taken' | 'skipped' | 'missed';

// date-fns não tem locale pt/en/es "genérico" — usa a variante regional
// mais comum pra cada idioma suportado pelo app.
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
    const key = log.scheduled_at.slice(0, 10); // YYYY-MM-DD
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Filtro por medicamento (Fase 2, 2026-08-12) — backend já suportava
  // `medication_id` desde sempre (getDoseHistory/HistoryFilters), só
  // faltava a UI pra usar.
  const [medicationFilter, setMedicationFilter] = useState<number | 'all'>('all');

  const { data: medications = [] } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  // "Gráfico de adesão" (Fase 2, 2026-08-13).
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

  // "Resumo pra consulta" (2026-08-23) — texto pronto pra levar/mandar
  // pro médico: % do período + quais doses faltaram, com data e hora.
  // Não é o histórico completo (isso já existe na tela) — é o recorte
  // que interessa numa consulta.
  const [sharingSummary, setSharingSummary] = useState(false);
  async function handleShareSummary() {
    if (!activeProfile) return;
    setSharingSummary(true);
    try {
      const summary = await getConsultationSummary(activeProfile.id, 30);
      const dateLocale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
      const missedLines = summary.missed
        .map((m) => `• ${m.medication_name} — ${format(parseISO(m.scheduled_at), "d 'de' MMMM, HH:mm", { locale: dateLocale })}`)
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
      showAlert(t('common.error'), err.response?.data?.message ?? t('history.consultationSummaryError'));
    } finally {
      setSharingSummary(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Resumo de adesão */}
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

      <TouchableOpacity
        style={styles.consultationButton}
        onPress={handleShareSummary}
        disabled={sharingSummary}
        accessibilityRole="button"
        accessibilityLabel={t('history.shareConsultationSummary')}
      >
        <MaterialCommunityIcons name="file-document-outline" size={16} color={colors.brand} />
        <Text style={styles.consultationButtonText}>{t('history.shareConsultationSummary')}</Text>
      </TouchableOpacity>

      {/* Filtros de status */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
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
      </ScrollView>

      {/* Filtro por medicamento */}
      {medications.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
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
          {medications.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.filterChip, styles.medicationChip, medicationFilter === m.id && styles.filterChipActive]}
              onPress={() => setMedicationFilter(m.id)}
              accessibilityRole="button"
              accessibilityLabel={t('history.filterLabel', { label: m.name })}
              accessibilityState={{ selected: medicationFilter === m.id }}
            >
              <View style={[styles.medicationChipDot, { backgroundColor: m.color }]} />
              <Text style={[styles.filterChipText, medicationFilter === m.id && styles.filterChipTextActive]}>
                {m.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <SkeletonList lines={2} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.emptyText}>
            {hasActiveFilter ? t('history.emptyFiltered') : t('history.emptyGeneric')}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.missed;
            const time = format(parseISO(item.scheduled_at), 'HH:mm');
            return (
              <View
                style={styles.row}
                accessible
                accessibilityLabel={t('history.rowLabel', {
                  name: item.medication.name,
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
                  <Text style={styles.medName}>{item.medication.name}</Text>
                  <Text style={styles.dosage}>
                    {formatDosageUnit(item.medication.dosage, item.medication.unit)}
                  </Text>
                </View>
                <View style={styles.statusBox}>
                  <MaterialCommunityIcons name={cfg.icon} size={18} color={cfg.color} />
                  <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
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
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      paddingVertical: 16,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 22, fontWeight: '700', color: c.text },
    summaryLabel: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: 4 },
    consultationButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 8,
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
    },
    consultationButtonText: { color: c.brand, fontSize: 13, fontWeight: '600' },
    filterScroll: { maxHeight: 52 },
    filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    filterChipActive: { backgroundColor: c.brandSubtle, borderColor: c.brand },
    filterChipText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    filterChipTextActive: { color: c.brand },
    medicationChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    medicationChipDot: { width: 8, height: 8, borderRadius: 4 },
    list: { padding: 16, paddingTop: 4, gap: 6 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 4 },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingTop: 12,
      paddingBottom: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      overflow: 'hidden',
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    timeBox: { paddingHorizontal: 12, alignItems: 'center', minWidth: 54 },
    time: { fontSize: 14, fontWeight: '700', color: c.brand },
    colorBar: { width: 4, alignSelf: 'stretch' },
    rowBody: { flex: 1, paddingVertical: 14, paddingLeft: 12 },
    medName: { fontSize: 14, fontWeight: '600', color: c.text },
    dosage: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    statusBox: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
    statusLabel: { fontSize: 12, fontWeight: '600' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  });
}
