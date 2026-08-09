import { useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useProfileStore } from '../../store/profileStore';
import { getDoseHistory, DoseLog, HistoryFilters } from '../../services/doses';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

type StatusFilter = 'all' | 'taken' | 'skipped' | 'missed';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'taken', label: 'Tomado' },
  { key: 'skipped', label: 'Pulado' },
  { key: 'missed', label: 'Perdido' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = {
  taken: { label: 'Tomado', color: '#22c55e', icon: 'check-circle' },
  skipped: { label: 'Pulado', color: '#f59e0b', icon: 'minus-circle' },
  missed: { label: 'Perdido', color: '#ef4444', icon: 'close-circle' },
  pending: { label: 'Pendente', color: '#94a3b8', icon: 'clock-outline' },
};

function sectionTitle(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
}

function groupByDate(logs: DoseLog[]): { title: string; data: DoseLog[] }[] {
  const map = new Map<string, DoseLog[]>();
  for (const log of logs) {
    const key = log.scheduled_at.slice(0, 10); // YYYY-MM-DD
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return Array.from(map.entries()).map(([date, data]) => ({
    title: sectionTitle(date + 'T00:00:00'),
    data,
  }));
}

export default function HistoryScreen() {
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filters: HistoryFilters = {};
  if (statusFilter !== 'all') filters.status = statusFilter;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['history', activeProfile?.id, filters],
    queryFn: () => getDoseHistory(activeProfile!.id, filters),
    enabled: !!activeProfile,
  });

  const logs: DoseLog[] = data?.data ?? [];
  const sections = useMemo(() => groupByDate(logs), [logs]);

  const takenCount = logs.filter((l) => l.status === 'taken').length;
  const totalCount = logs.length;
  const adherence = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : null;

  return (
    <View style={styles.container}>
      {/* Resumo de adesão */}
      {adherence !== null && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{takenCount}</Text>
            <Text style={styles.summaryLabel}>Tomadas</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalCount - takenCount}</Text>
            <Text style={styles.summaryLabel}>Perdidas</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: adherence >= 80 ? colors.success : colors.warning }]}>
              {adherence}%
            </Text>
            <Text style={styles.summaryLabel}>Adesão</Text>
          </View>
        </View>
      )}

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
            accessibilityLabel={`Filtrar por ${f.label}`}
            accessibilityState={{ selected: statusFilter === f.key }}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhum registro</Text>
          <Text style={styles.emptyText}>
            {statusFilter !== 'all'
              ? 'Nenhuma dose com esse status no período.'
              : 'Marque doses como tomadas para ver o histórico aqui.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
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
                accessibilityLabel={`${item.medication.name}, ${item.medication.dosage} ${item.medication.unit}, ${time}, ${cfg.label}`}
              >
                <View style={styles.timeBox}>
                  <Text style={styles.time}>{time}</Text>
                </View>
                <View style={[styles.colorBar, { backgroundColor: item.medication.color }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.medName}>{item.medication.name}</Text>
                  <Text style={styles.dosage}>
                    {item.medication.dosage} {item.medication.unit}
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
    list: { padding: 16, paddingTop: 4, gap: 6 },
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
