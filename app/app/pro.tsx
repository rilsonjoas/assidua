import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from '../components/AppText';
import { getCurrentOffering, isPurchasesConfigured, purchasePackage, restorePurchases } from '../services/purchases';
import { getMe } from '../services/auth';

// "Plano Pro" (2026-08-13, fluxo de compra real ligado em 2026-08-21) —
// decisão registrada: L1 (cobrança de verdade) continua sendo tratado
// com cautela — apostar na diferenciação do cuidador remoto veio antes
// de monetizar (2026-08-09). Os limites abaixo são reais, batem
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
  const { user, setUser } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPro = user?.subscription_tier === 'pro';

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (isPro) {
      setLoadingOffering(false);
      return;
    }
    getCurrentOffering()
      .then(setOffering)
      .finally(() => setLoadingOffering(false));
  }, [isPro]);

  async function refreshUser() {
    const me = await getMe();
    setUser(me);
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasingId(pkg.identifier);
    try {
      await purchasePackage(pkg);
      await refreshUser();
    } catch (error: any) {
      // userCancelled: a pessoa fechou a tela nativa de compra sozinha —
      // não é erro, não mostra alerta nenhum.
      if (!error?.userCancelled) {
        Alert.alert(t('common.error'), t('pro.purchaseError'));
      }
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await restorePurchases();
      await refreshUser();
    } catch {
      Alert.alert(t('common.error'), t('pro.restoreError'));
    } finally {
      setRestoring(false);
    }
  }

  const showPurchaseFlow = !isPro && isPurchasesConfigured() && !loadingOffering && !!offering?.availablePackages.length;
  const showComingSoon = !isPro && (!isPurchasesConfigured() || (!loadingOffering && !offering?.availablePackages.length));

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

      {!isPro && loadingOffering && (
        <ActivityIndicator style={styles.loading} color={colors.brand} />
      )}

      {showPurchaseFlow && (
        <View style={styles.packages}>
          {offering!.availablePackages.map((pkg) => (
            <TouchableOpacity
              key={pkg.identifier}
              style={styles.subscribeButton}
              onPress={() => handlePurchase(pkg)}
              disabled={purchasingId !== null}
              accessibilityRole="button"
              accessibilityLabel={t('pro.subscribeLabel', { price: pkg.product.priceString })}
              accessibilityState={{ busy: purchasingId === pkg.identifier, disabled: purchasingId !== null }}
            >
              {purchasingId === pkg.identifier
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.subscribeButtonText}>{t('pro.subscribeButton', { price: pkg.product.priceString })}</Text>
              }
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityState={{ busy: restoring, disabled: restoring }}
          >
            <Text style={styles.restoreLink}>{restoring ? t('pro.restoring') : t('pro.restore')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showComingSoon && (
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
    loading: { marginTop: 20 },
    packages: { width: '100%', marginTop: 20, gap: 12 },
    subscribeButton: {
      backgroundColor: c.brand, borderRadius: 12, paddingVertical: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    subscribeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    restoreLink: { textAlign: 'center', fontSize: 13, color: c.textMuted, fontWeight: '600', marginTop: 4, padding: 8 },
    comingSoonBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20,
      backgroundColor: c.surfaceSecondary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    },
    comingSoonText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
  });
}
