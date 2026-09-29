import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import { useIsWideScreen } from '../hooks/useBreakpoint';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from '../components/AppText';
import { getCurrentOffering, isPurchasesConfigured, purchasePackage, restorePurchases } from '../services/purchases';
import { getMe } from '../services/auth';
import { useAlertDialog } from '../hooks/useAlertDialog';
import { rounded, spacing, type } from '../constants/tokens';

// "Plano Pro" (2026-08-13, fluxo de compra real ligado em 2026-08-21) —
// decisão registrada: L1 (cobrança de verdade) continua sendo tratado
// com cautela — apostar na diferenciação do cuidador remoto veio antes
// de monetizar (2026-08-09). Os limites abaixo são reais, batem
// exatamente com o que o backend já aplica hoje (não são number
// arredondado/inventado):
// - MedicationController::store — 15 medicamentos/perfil grátis, sem limite Pro
// - ProfileController::store — 4 perfis grátis, sem limite Pro
//
// T1 (2026-09-25): as linhas `history` ("30 dias" grátis) e `chart`
// ("4 semanas" grátis) foram REMOVIDAS desta tabela. Elas pararam de
// ser verdade quando o histórico deixou de ser paywall de leitura — o
// paciente não perde o acesso ao próprio registro por causa de plano
// (ver `HISTORY_FLOOR_DAYS` em DoseLogController e a regra em
// CLAUDE.md). Deixar a tabela anunciando um limite que o backend não
// aplica é pior do que tabela curta: é a tela de venda mentindo.
//
// Pendente de planejar (não implementado): a tabela agora tem só 2
// linhas e omite os benefícios Pro que realmente diferem — cuidador
// remoto, relatório em PDF, e o resumo de consulta de 30→90 dias.
const BENEFITS: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; key: string }[] = [
  { icon: 'account-multiple-outline', key: 'profiles' },
  { icon: 'pill', key: 'medications' },
];

export default function ProScreen() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const isPro = user?.subscription_tier === 'pro';

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const { showAlert, alertDialog } = useAlertDialog();

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
        showAlert(t('common.error'), t('pro.purchaseError'));
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
      showAlert(t('common.error'), t('pro.restoreError'));
    } finally {
      setRestoring(false);
    }
  }

  const showPurchaseFlow = !isPro && isPurchasesConfigured() && !loadingOffering && !!offering?.availablePackages.length;
  const showComingSoon = !isPro && (!isPurchasesConfigured() || (!loadingOffering && !offering?.availablePackages.length));

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.inner, isWide && styles.innerWide]}>
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
            // hitSlop (WCAG AAA, auditoria de toque mínimo 2026-09-08) —
            // "Restaurar compra" é de propósito um link discreto, não
            // um botão; hitSlop cresce a área de toque sem inflar o
            // visual. 8px de padding no Text + 8 de hitSlop = 48.
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
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
      {alertDialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: spacing.xxl, alignItems: 'center', paddingBottom: spacing.xxxl },
    innerWide: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
    iconCircle: {
      width: 72, height: 72, borderRadius: rounded.xxl, backgroundColor: 'rgba(251,191,36,0.15)',
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
    },
    title: { fontSize: type.heading, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: { fontSize: type.caption, color: c.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl, lineHeight: 20 },
    table: { width: '100%', backgroundColor: c.surface, borderRadius: rounded.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', backgroundColor: c.surfaceSecondary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    tableHeaderCell: { flex: 1, fontSize: type.microTight, fontWeight: '700', color: c.textMuted },
    tableHeaderCenter: { textAlign: 'center' },
    tableHeaderPro: { color: c.brand },
    tableRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    tableLabelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tableLabel: { fontSize: type.micro, color: c.text, fontWeight: '500', flexShrink: 1 },
    tableValue: { flex: 1, fontSize: type.micro, color: c.textMuted, textAlign: 'center' },
    tableValuePro: { color: c.brand, fontWeight: '700' },
    loading: { marginTop: spacing.xl },
    packages: { width: '100%', marginTop: spacing.xl, gap: spacing.md },
    // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08).
    subscribeButton: {
      backgroundColor: c.brand, borderRadius: rounded.md, paddingVertical: spacing.md, minHeight: 48,
      alignItems: 'center', justifyContent: 'center',
    },
    subscribeButtonText: { color: '#fff', fontSize: type.label, fontWeight: '700' },
    restoreLink: { textAlign: 'center', fontSize: type.micro, color: c.textMuted, fontWeight: '600', marginTop: spacing.xs, padding: spacing.sm },
    comingSoonBox: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl,
      backgroundColor: c.surfaceSecondary, borderRadius: rounded.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    },
    comingSoonText: { fontSize: type.micro, color: c.textMuted, fontWeight: '600' },
  });
}
