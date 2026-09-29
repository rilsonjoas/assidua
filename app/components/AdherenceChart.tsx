import { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { format, parseISO } from 'date-fns';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WeeklyAdherencePoint } from '../services/doses';
import { getAdherenceColor } from '../lib/adherence';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';
import { rounded, spacing, type } from '../constants/tokens';

const MAX_BAR_HEIGHT = 72;
const MIN_BAR_HEIGHT = 4;

// "Gráfico de adesão" (Fase 2, 2026-08-13) — barras semanais acessíveis para
// idosos e cuidadores, com datas por extenso/resumidas, trilho visual de
// porcentagem (0-100%) e legenda clara de cores.
//
// Os três estados de rede chegaram em 2026-09-28, junto com os do
// calendário. Antes `data = []` (que é o que chega num erro de rede)
// retornava `null` e o gráfico sumia sem explicação — o mesmo defeito do
// calendário em outra forma: um mintia ("não tomou nada"), este calava.
export function AdherenceChart({
  data,
  isLoading = false,
  isError = false,
  onRetry,
}: {
  data: WeeklyAdherencePoint[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('history.chartTitle')}</Text>
        <View style={styles.feedbackBox} accessible accessibilityLabel={t('history.chartLoading')}>
          <ActivityIndicator size="large" color={colors.textMuted} />
          <Text style={styles.feedbackText}>{t('history.chartLoading')}</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('history.chartTitle')}</Text>
        <View style={styles.feedbackBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.feedbackText}>{t('history.chartError')}</Text>
          {onRetry && (
            <TouchableOpacity
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

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
          const barColor = !hasData ? colors.border : getAdherenceColor(pct, colors);
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
          <Text style={styles.legendText}>{t('history.adherenceLegendGood')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>{t('history.adherenceLegendMid')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>{t('history.adherenceLegendLow')}</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.surface,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: rounded.lg,
      padding: spacing.lg,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    title: { fontSize: type.caption, fontWeight: '700', color: c.textSecondary, marginBottom: spacing.md },
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
    barColumn: { flex: 1, alignItems: 'center' },
    barValue: { fontSize: type.micro, fontWeight: '700', color: c.textMuted, marginBottom: spacing.xs },
    barTrack: {
      height: MAX_BAR_HEIGHT,
      justifyContent: 'flex-end',
      width: '100%',
      backgroundColor: c.surfaceSecondary,
      borderRadius: rounded.sm,
      overflow: 'hidden',
      padding: spacing.none,
    },
    bar: { width: '100%', borderRadius: rounded.sm, minWidth: 6, alignSelf: 'center' },
    barDateLabel: { fontSize: type.microTight, fontWeight: '600', color: c.textMuted, marginTop: spacing.xs },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legendDot: { width: 10, height: 10, borderRadius: rounded.sm },
    legendText: { fontSize: type.microTight, color: c.textSecondary, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingVertical: spacing.md },
    emptyStateText: { fontSize: type.caption, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    feedbackBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
    feedbackText: { fontSize: type.caption, color: c.textSecondary, textAlign: 'center' },
    retryBtn: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
    retryText: { fontSize: type.label, color: c.brand, fontWeight: '600' },
  });
}
