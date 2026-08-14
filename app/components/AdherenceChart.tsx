import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WeeklyAdherencePoint } from '../services/doses';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

const MAX_BAR_HEIGHT = 72;
const MIN_BAR_HEIGHT = 3; // barra de 0% ainda precisa aparecer, senão parece "sem dado"

// "Gráfico de adesão" (Fase 2, 2026-08-13) — barras semanais com Views
// puras (altura proporcional à %), sem biblioteca de gráfico nova. Pra
// N ≤ 8 barras simples isso é suficiente e mais barato que adicionar
// dependência (mesma linha de raciocínio do Skeleton com Animated puro).
export function AdherenceChart({ data }: { data: WeeklyAdherencePoint[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (data.length === 0) return null;

  // Achado real de uso, anotado no Obsidian (2026-08-14): "gráfico de
  // adesão só esqueleto quando não há nada registrado; estranho pro
  // usuário final". Não era bug de loading — quando nenhuma dose foi
  // registrada ainda, todo ponto tem `percentage: null`, e a fileira
  // de barrinhas cinzas com "—" (sem nenhum texto) parece quebrada,
  // não "ainda sem dado". Estado vazio de verdade, com explicação.
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
              <Text style={styles.barValue}>{hasData ? `${pct}%` : '—'}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
              </View>
            </View>
          );
        })}
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
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
    barColumn: { flex: 1, alignItems: 'center' },
    barValue: { fontSize: 10, fontWeight: '600', color: c.textMuted, marginBottom: 4 },
    barTrack: { height: MAX_BAR_HEIGHT, justifyContent: 'flex-end', width: '100%' },
    bar: { width: '100%', borderRadius: 4, minWidth: 8, alignSelf: 'center' },
    emptyState: { alignItems: 'center', paddingVertical: 12 },
    emptyStateText: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19 },
  });
}
