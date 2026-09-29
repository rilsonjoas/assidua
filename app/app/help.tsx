import { useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { useIsWideScreen } from '../hooks/useBreakpoint';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from '../components/AppText';
import { rounded, spacing, type } from '../constants/tokens';

// "Ajuda" (2026-08-14) — pergunta direta do Rilson: "não tem como
// facilitar pra novos usuários com um guia?". O onboarding (3 telas)
// já existia, mas só aparece uma vez, na primeira abertura — se a
// pessoa esquecer o que aquilo significava (ou nunca chegou a ver,
// porque quem configurou foi o cuidador), não tinha pra onde voltar.
// Esta tela é permanente, sempre em Perfil → Ajuda, e cobre os
// conceitos que a auditoria de "elderly friendly" (mesmo dia)
// encontrou como confusos sem explicação: perfil, status de dose,
// cuidado compartilhado, estoque.
const TOPICS: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; key: string }[] = [
  { icon: 'account-multiple-outline', key: 'profiles' },
  { icon: 'clipboard-check-outline', key: 'doseStatus' },
  { icon: 'account-heart-outline', key: 'sharedCare' },
  { icon: 'package-variant-closed', key: 'stock' },
  { icon: 'format-size', key: 'appearance' },
  { icon: 'hand-heart-outline', key: 'settingUpForSomeoneElse' },
];

export default function HelpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();

  async function shareGuide() {
    await Share.share({ message: t('help.shareText') });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.inner, isWide && styles.innerWide]}>
      <Text style={styles.subtitle}>{t('help.subtitle')}</Text>

      {TOPICS.map((topic) => (
        <View key={topic.key} style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name={topic.icon} size={22} color={colors.brand} />
            <Text style={styles.cardTitle}>{t(`help.${topic.key}.title`)}</Text>
          </View>
          <Text style={styles.cardText}>{t(`help.${topic.key}.text`)}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.shareBtn}
        onPress={shareGuide}
        accessibilityRole="button"
        accessibilityLabel={t('help.shareLabel')}
      >
        <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.onBrand} />
        <Text style={styles.shareBtnText}>{t('help.shareButton')}</Text>
      </TouchableOpacity>
      <Text style={styles.shareHint}>{t('help.shareHint')}</Text>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: spacing.xl, paddingBottom: spacing.xxxl },
    innerWide: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
    subtitle: { fontSize: type.caption, color: c.textSecondary, lineHeight: 20, marginBottom: spacing.xl },
    card: {
      backgroundColor: c.surface, borderRadius: rounded.lg, padding: spacing.lg, marginBottom: spacing.md,
      borderWidth: 1, borderColor: c.border,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    cardTitle: { fontSize: type.body, fontWeight: '700', color: c.text, flexShrink: 1 },
    cardText: { fontSize: type.caption, color: c.textSecondary, lineHeight: 21 },
    // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08).
    shareBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.brand, borderRadius: rounded.md, paddingVertical: spacing.md, marginTop: spacing.sm, minHeight: 48,
    },
    shareBtnText: { color: c.onBrand, fontWeight: '700', fontSize: type.label },
    shareHint: { fontSize: type.microTight, color: c.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 17 },
  });
}
