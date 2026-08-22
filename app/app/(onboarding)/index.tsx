import { useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { requestNotificationPermission, registerPushToken } from '../../services/notifications';
import { AppText as Text } from '../../components/AppText';

// Onboarding guiado (Fase 1 do roadmap) — 3 telas na primeira abertura.
// Decisão: carrossel explicativo, não formulário embutido. Quem já usa
// as telas Hoje/Medicamentos tem os próprios "estado vazio" com CTA de
// criar perfil/medicamento (já existentes e testados) — não duplicar
// essa lógica aqui, só contextualizar o que o app faz antes do usuário
// chegar lá. O pedido de notificação, que antes disparava sem
// explicação no boot do app, agora só acontece aqui, no fim do
// onboarding, com contexto — boa prática (não pedir permissão "a frio").
const STEP_ICONS = ['account-group-outline', 'pill', 'bell-ring-outline'] as const;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = useIsWideScreen();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const setCompleted = useOnboardingStore((s) => s.setCompleted);
  const scrollRef = useRef<ScrollView>(null);

  const steps = [
    { icon: STEP_ICONS[0], title: t('onboarding.step1Title'), text: t('onboarding.step1Text') },
    { icon: STEP_ICONS[1], title: t('onboarding.step2Title'), text: t('onboarding.step2Text') },
    { icon: STEP_ICONS[2], title: t('onboarding.step3Title'), text: t('onboarding.step3Text') },
  ];

  const isLast = step === steps.length - 1;

  const finish = async () => {
    await requestNotificationPermission();
    // Fase 1.5 — precisa vir DEPOIS da permissão (sem permissão, o token
    // não existe pra registrar mesmo). Best-effort, não bloqueia o fim
    // do onboarding se falhar.
    await registerPushToken();
    setCompleted();
    router.replace('/(tabs)/');
  };

  // Achado real testando no dispositivo (2026-08-13): a versão anterior
  // só avançava pelo botão "Próximo" — não tinha nenhum gesto de swipe
  // de verdade, mesmo tendo os pontinhos de página sugerindo isso.
  // ScrollView com paginação nativa cobre swipe nos dois sentidos de
  // graça; scrollTo sincroniza quando o avanço vem do botão/pontinho.
  function goToStep(next: number) {
    setStep(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== step) setStep(next);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={finish} accessibilityRole="button" accessibilityLabel={t('onboarding.skipLabel')}>
        <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.pager}
      >
        {steps.map((s, i) => (
          <View
            key={i}
            style={[styles.content, { width }]}
            accessible
            accessibilityLabel={t('onboarding.stepLabel', { current: i + 1, total: steps.length, title: s.title, text: s.text })}
          >
            {/* Wrapper interno com maxWidth (2026-08-22) — a página em si
                precisa ficar exatamente do tamanho da janela pro paging
                funcionar, mas o CONTEÚDO não deveria esticar até a borda
                numa tela larga (achado do Rilson, W2). */}
            <View style={isWide && styles.contentInnerWide}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name={s.icon} size={56} color={colors.brand} />
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.text}>{s.text}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {steps.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goToStep(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.dotLabel', { step: i + 1 })}
            accessibilityState={{ selected: i === step }}
          >
            <View style={[styles.dot, i === step && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.nextBtn, isWide && styles.nextBtnWide]}
        onPress={() => (isLast ? finish() : goToStep(step + 1))}
        accessibilityRole="button"
        accessibilityLabel={isLast ? t('onboarding.finish') : t('onboarding.next')}
      >
        <Text style={styles.nextBtnText}>{isLast ? t('onboarding.finish') : t('onboarding.next')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, paddingTop: 64, paddingBottom: 40 },
    skip: { alignSelf: 'flex-end', marginHorizontal: 24 },
    skipText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    pager: { flex: 1 },
    content: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
    contentInnerWide: { alignItems: 'center', gap: 16, width: '100%', maxWidth: 480 },
    iconCircle: {
      width: 112, height: 112, borderRadius: 56, backgroundColor: c.brandSubtle,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    title: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    text: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 24 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
    dotActive: { backgroundColor: c.brand, width: 20 },
    nextBtn: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginHorizontal: 24 },
    nextBtnWide: { alignSelf: 'center', width: '100%', maxWidth: 480, marginHorizontal: 0 },
    nextBtnText: { color: c.onBrand, fontWeight: '700', fontSize: 15 },
  });
}
