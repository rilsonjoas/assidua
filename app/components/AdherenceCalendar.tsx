import { useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, addMonths, subMonths, startOfMonth, getDay, getDaysInMonth, parseISO } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getDailyAdherence, DailyAdherencePoint } from '../services/doses';
import { bestTextColor } from '../lib/contrast';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;

interface AdherenceCalendarProps {
  profileId: number;
}

// "Calendário de adesão" (v1.3, aprovado 2026-09-02) — um dia por
// célula, verde/amarelo/vermelho (mesmos limiares do AdherenceChart
// semanal: ≥80/50-79/<50), cinza pra dia sem dado (fora do período,
// futuro, ou nenhum schedule devido naquele dia). "Histórico simples"
// de propósito: só navegação de mês, sem toque em dia nenhum — o
// detalhe por dose já está na lista abaixo.
export function AdherenceCalendar({ profileId }: AdherenceCalendarProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const monthKey = format(monthDate, 'yyyy-MM');
  const locale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
  const today = format(new Date(), 'yyyy-MM-dd');
  const canGoNext = monthDate < startOfMonth(new Date());

  const { data: days = [] } = useQuery({
    queryKey: ['daily-adherence', profileId, monthKey],
    queryFn: () => getDailyAdherence(profileId, monthKey),
    enabled: !!profileId,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, DailyAdherencePoint>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const cells = useMemo(() => {
    const daysInMonth = getDaysInMonth(monthDate);
    const firstWeekday = getDay(monthDate); // 0 = domingo, já alinhado com DAY_KEYS
    const list: (DailyAdherencePoint | null)[] = Array(firstWeekday).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = format(new Date(monthDate.getFullYear(), monthDate.getMonth(), day), 'yyyy-MM-dd');
      list.push(byDate.get(dateStr) ?? { date: dateStr, percentage: null, taken: 0, due: 0 });
    }
    return list;
  }, [monthDate, byDate]);

  function cellColor(point: DailyAdherencePoint): string | null {
    // Sem schedule devido (ainda não cadastrado, ou dia da semana sem
    // horário) e dias futuros ficam neutros — não é "baixo", é "não se
    // aplica". Distinção real: 0% (devia e não tomou) é vermelho de
    // propósito, bem diferente de "não tinha nada previsto".
    if (point.due === 0 || point.date > today) return null;
    if (point.percentage! >= 80) return colors.success;
    if (point.percentage! >= 50) return colors.warning;
    return colors.error;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setMonthDate((d) => subMonths(d, 1))}
          accessibilityRole="button"
          accessibilityLabel={t('history.calendarPrevMonth')}
          style={styles.navBtn}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.title}>{format(monthDate, 'MMMM yyyy', { locale })}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setMonthDate((d) => addMonths(d, 1))}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel={t('history.calendarNextMonth')}
          accessibilityState={{ disabled: !canGoNext }}
          style={styles.navBtn}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={canGoNext ? colors.textSecondary : colors.border} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {DAY_KEYS.map((k) => (
          <Text key={k} style={styles.weekdayText}>{t(`medicationForm.daysShort.${k}`)}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((point, i) => {
          if (!point) return <View key={i} style={styles.cellSlot} />;
          const bg = cellColor(point);
          const dayNumber = format(parseISO(point.date), 'd');
          const label = bg === null
            ? t('history.calendarNoDataLabel', { day: dayNumber })
            : t('history.calendarDayLabel', { day: dayNumber, percentage: point.percentage, taken: point.taken, count: point.due });
          return (
            <View key={i} style={styles.cellSlot}>
              <View
                style={[styles.cell, { backgroundColor: bg ?? colors.surfaceSecondary }]}
                accessible
                accessibilityLabel={label}
              >
                <Text style={[styles.cellText, { color: bg ? bestTextColor(bg) : colors.textMuted }]}>
                  {dayNumber}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>{t('history.calendarLegendGood')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>{t('history.calendarLegendMid')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>{t('history.calendarLegendLow')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }]} />
          <Text style={styles.legendText}>{t('history.calendarLegendNoData')}</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    navBtn: { padding: 8 },
    title: { fontSize: 15, fontWeight: '700', color: c.text, textTransform: 'capitalize' },
    weekdayRow: { flexDirection: 'row' },
    weekdayText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: c.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    // 1/7 de largura cada — 7 colunas, quantas linhas o mês precisar.
    cellSlot: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
    cell: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    cellText: { fontSize: 13, fontWeight: '600' },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 14,
      marginTop: 14,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
  });
}
