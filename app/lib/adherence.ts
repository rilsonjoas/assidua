import { ThemeColors } from '../constants/theme';

// Limiares de severidade de adesão — mesmos valores usados em
// AdherenceRing (anel do dia), AdherenceCalendar (mês) e AdherenceChart
// (semana). Extraído (2026-09-05) depois de colar a mesma conta em 3
// componentes — só decide a cor pra quem já sabe que TEM dado; "sem
// dado nenhum" é decisão de cada chamador (cada um trata isso de um
// jeito visual diferente: `colors.border` no gráfico, `null` que vira
// cinza neutro no calendário, etc. — não dava pra generalizar sem
// perder a nuance de cada um).
export function getAdherenceColor(percentage: number, colors: ThemeColors): string {
  if (percentage >= 80) return colors.success;
  if (percentage >= 50) return colors.warning;
  return colors.error;
}
