import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { AppText as Text } from './AppText';

interface AdherenceRingProps {
  taken: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  // Contexto de fundo variável (header colorido na Home vs. superfície
  // normal em outros lugares) — sem cor fixa, deixa o chamador decidir
  // o que contrasta certo onde o anel é usado.
  trackColor?: string;
  textColor?: string;
}

// Anel de progresso de adesão do dia (v1.3, aprovado 2026-09-02) —
// mesmas cores de severidade já validadas no AdherenceChart semanal
// (≥80% ótimo, 50-79% atenção, <50% baixo), só que aqui é sobre HOJE,
// enchendo ao longo do dia conforme as doses são marcadas.
export function AdherenceRing({ taken, total, size = 56, strokeWidth = 6, trackColor, textColor }: AdherenceRingProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const ringColor = total === 0 ? colors.border : pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.error;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('home.adherenceRingLabel', { count: taken, total })}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? colors.surfaceSecondary}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {total > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            originX={size / 2}
            originY={size / 2}
          />
        )}
      </Svg>
      <View style={styles.centerLabel} pointerEvents="none">
        <Text style={[styles.pctText, { color: textColor ?? colors.text }]}>{pct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctText: { fontSize: 13, fontWeight: '700' },
});
