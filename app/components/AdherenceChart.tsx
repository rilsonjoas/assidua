import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { WeeklyAdherencePoint } from '../services/doses';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

const MAX_BAR_HEIGHT = 72;
const MIN_BAR_HEIGHT = 4;

// "Gráfico de adesão" (Fase 2, 2026-08-13) — barras semanais acessíveis para
// idosos e cuidadores, com datas por extenso/resumidas, trilho visual de
// porcentagem (0-100%) e legenda clara de cores.
export function AdherenceChart({ data }: { data: WeeklyAdherencePoint[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (data.length === 0) return null;

  const hasAnyData = data.some((point) => point.percentage !== null);
  if (!hasAnyData) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('history.chartTitle')}</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('history.chartEmptyState')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('history.chartTitle')}</Text>

      <View style={styles.barsRow}>
        {data.map((point) => {
          const hasData = point.percentage !== null;
          const pct = point.percentage ?? 0;
          const barColor = !hasData
            ? colors.border
            : pct >= 80
              ? colors.success
              : pct >= 50
                ? colors.warning
                : colors.error;
          const barHeight = hasData ? Math.max(MIN_BAR_HEIGHT, (pct / 100) * MAX_BAR_HEIGHT) : MIN_BAR_HEIGHT;
          const weekLabel = point.week_start ? format(parseISO(point.week_start), 'dd/MM') : '';

          return (
            <View
              key={point.week_start}
              style={styles.barColumn}
              accessible
              accessibilityLabel={
                hasData
                  ? t('history.chartWeekLabel', { percentage: pct })
                  : t('history.chartNoData')
              }
            >
              <Text style={[styles.barValue, hasData && { color: barColor }]}>
                {hasData ? `${pct}%` : '—'}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.barDateLabel}>{weekLabel}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>≥80% Ótimo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>50-79% Atenção</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>&lt;50% Baixo</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.surface,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      padding: 16,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    title: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 12 },
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
    barColumn: { flex: 1, alignItems: 'center' },
    barValue: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 6 },
    barTrack: {
      height: MAX_BAR_HEIGHT,
      justifyContent: 'flex-end',
      width: '100%',
      backgroundColor: c.surfaceSecondary,
      borderRadius: 6,
      overflow: 'hidden',
      padding: 1,
    },
    bar: { width: '100%', borderRadius: 4, minWidth: 6, alignSelf: 'center' },
    barDateLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginTop: 6 },
    legendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: c.textSecondary, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingVertical: 12 },
    emptyStateText: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19 },
  });
}
