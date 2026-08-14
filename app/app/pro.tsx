import { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from '../components/AppText';

// "Plano Pro" (2026-08-13) — decisão real registrada: L1 (cobrança de
// verdade) continua deliberadamente não implementado, é decisão de
// 2026-08-09 (apostar na diferenciação do cuidador remoto antes de
// monetizar). Mas mostrar "Plano Gratuito" sem contexto nenhum também é
// ruim — parece feature quebrada, não "ainda não lançamos". Esta tela
// só *explica* a diferença, sem processar pagamento nenhum — o botão é
// "Em breve", não um checkout. Os limites abaixo são reais, batem
// exatamente com o que o backend já aplica hoje (não são number
// arredondado/inventado):
// - MedicationController::store — 15 medicamentos/perfil grátis, sem limite Pro
// - ProfileController::store — 4 perfis grátis, sem limite Pro
// - DoseLogController::history — 30 dias de histórico grátis, 3650 Pro
// - DoseLogController::weeklyAdherence — 4 semanas de gráfico grátis, 8 Pro
const BENEFITS: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; key: string }[] = [
  { icon: 'account-multiple-outline', key: 'profiles' },
  { icon: 'pill', key: 'medications' },
  { icon: 'history', key: 'history' },
  { icon: 'chart-bar', key: 'chart' },
];

export default function ProScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPro = user?.subscription_tier === 'pro';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="star" size={40} color="#fbbf24" />
      </View>
      <Text style={styles.title}>{t('pro.title')}</Text>
      <Text style={styles.subtitle}>
        {isPro ? t('pro.alreadyPro') : t('pro.subtitle')}
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderCell} />
          <Text style={[styles.tableHeaderCell, styles.tableHeaderCenter]}>{t('profile.free')}</Text>
          <Text style={[styles.tableHeaderCell, styles.tableHeaderCenter, styles.tableHeaderPro]}>{t('profile.pro')}</Text>
        </View>
        {BENEFITS.map((b) => (
          <View key={b.key} style={styles.tableRow}>
            <View style={styles.tableLabelCell}>
              <MaterialCommunityIcons name={b.icon} size={16} color={colors.textMuted} />
              <Text style={styles.tableLabel}>{t(`pro.benefit.${b.key}`)}</Text>
            </View>
            <Text style={styles.tableValue}>{t(`pro.free.${b.key}`)}</Text>
            <Text style={[styles.tableValue, styles.tableValuePro]}>{t(`pro.pro.${b.key}`)}</Text>
          </View>
        ))}
      </View>

      {!isPro && (
        <View style={styles.comingSoonBox} accessible accessibilityLabel={t('pro.comingSoonLabel')}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={colors.textMuted} />
          <Text style={styles.comingSoonText}>{t('pro.comingSoon')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 24, alignItems: 'center', paddingBottom: 48 },
    iconCircle: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(251,191,36,0.15)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    title: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
    table: { width: '100%', backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', backgroundColor: c.surfaceSecondary, paddingVertical: 10, paddingHorizontal: 12 },
    tableHeaderCell: { flex: 1, fontSize: 12, fontWeight: '700', color: c.textMuted },
    tableHeaderCenter: { textAlign: 'center' },
    tableHeaderPro: { color: c.brand },
    tableRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    tableLabelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    tableLabel: { fontSize: 13, color: c.text, fontWeight: '500', flexShrink: 1 },
    tableValue: { flex: 1, fontSize: 13, color: c.textMuted, textAlign: 'center' },
    tableValuePro: { color: c.brand, fontWeight: '700' },
    comingSoonBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20,
      backgroundColor: c.surfaceSecondary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    },
    comingSoonText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  });
}
