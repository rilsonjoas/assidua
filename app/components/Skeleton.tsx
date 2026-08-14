import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, DimensionValue } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';

// Fase 2 (2026-08-12) — substitui o `ActivityIndicator` genérico nas 4
// telas de lista (Hoje, Remédios, Histórico, Estoque) por um placeholder
// que já sugere o formato do conteúdo — mesmo tempo de carregamento
// real, mas sensação de app mais rápido/polido (é percepção, não
// performance de verdade, e tá bom assim: o ganho é isso mesmo).
//
// Animated puro do React Native, sem biblioteca nova — é só opacidade
// pulsando, não precisa de mais que isso.
export function Skeleton({
  width,
  height,
  borderRadius = 8,
}: {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius, backgroundColor: colors.surfaceSecondary, opacity }}
    />
  );
}

// Formato genérico o bastante pra cobrir os 4 tipos de card/linha das
// telas de lista: círculo colorido (ou barra lateral) à esquerda + N
// linhas de texto empilhadas à direita. Não é pixel-perfect de nenhuma
// tela específica de propósito — é o "esqueleto" comum entre elas, o
// suficiente pra sinalizar formato sem duplicar 4 componentes quase
// iguais.
export function SkeletonListItem({ lines = 2 }: { lines?: number }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.card}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={styles.body}>
        <Skeleton width="60%" height={15} />
        {lines >= 2 && <View style={{ height: 8 }} />}
        {lines >= 2 && <Skeleton width="40%" height={12} />}
        {lines >= 3 && <View style={{ height: 6 }} />}
        {lines >= 3 && <Skeleton width="80%" height={11} />}
      </View>
    </View>
  );
}

export function SkeletonList({ count = 4, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <View
      testID="skeleton-list"
      style={styles.list}
      // Um leitor de tela não precisa navegar por "esqueletos" — o
      // estado de loading real já é anunciado por outro lugar (ou nem
      // precisa, é transitório). Evita ruído de navegação.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} lines={lines} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
});

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.surface, borderRadius: 16, padding: 16,
    },
    body: { flex: 1 },
  });
}
