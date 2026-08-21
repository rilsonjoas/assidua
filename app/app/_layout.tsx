import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';
import '../i18n';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { getMe } from '../services/auth';
import { registerPushToken } from '../services/notifications';
import { startAutoSync } from '../services/sync';
import { initPurchases } from '../services/purchases';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { queryClient } from '../services/queryClient';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// enabled: false sem DSN — SDK vira no-op, não tenta mandar nada.
// Mesmo padrão do backend (config/sentry.php lê de env, sem quebrar
// sem a chave configurada).
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  tracesSampleRate: 1.0,
});

// L1 — monetização (2026-08-21). Mesmo padrão do Sentry acima: sem
// EXPO_PUBLIC_REVENUECAT_ANDROID_KEY configurada (realidade hoje, antes
// da conta/produto existirem), initPurchases() é no-op — não precisa de
// flag extra pra "desligar" isso depois.
initPurchases();

// Exportado só pra ser testável em isolamento (`__tests__/auth-guard.test.tsx`)
// sem precisar montar o <Stack> inteiro do RootLayout — AuthGuard não
// renderiza nada visível, só efeitos de navegação.
export function AuthGuard() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  // Achado real de uso (2026-08-14): onboarding aparecia em *toda*
  // abertura do app, não só na primeira. `setCompleted()` já era
  // chamado certinho — o bug era ler `hasCompletedOnboarding` antes do
  // zustand-persist terminar de reidratar do AsyncStorage (assíncrono,
  // corrida com o boot do app); nesse intervalo o valor em memória
  // ainda é o `false` padrão. `hasHydrated` deixa esperar a
  // reidratação de verdade acabar antes de decidir navegar.
  const hasOnboardingHydrated = useOnboardingStore((s) => s.hasHydrated);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then((me) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading || !hasOnboardingHydrated) return;
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }
    if (user && !hasCompletedOnboarding && !inOnboarding) {
      router.replace('/(onboarding)');
      return;
    }
    // Rede de segurança: se por algum outro caminho a pessoa chegou no
    // onboarding já tendo completado antes (ex.: outra corrida que a
    // gente não previu), volta sozinho em vez de prender ali.
    if (user && hasCompletedOnboarding && inOnboarding) {
      router.replace('/(tabs)/');
      return;
    }
    if (user && inAuth) router.replace('/(tabs)/');

    // Fase 1.5 — refresca o token a cada abertura pra quem já passou
    // pelo onboarding (token do Expo pode mudar entre instalações).
    // Quem está indo pro onboarding agora já registra lá dentro.
    if (user && hasCompletedOnboarding) {
      registerPushToken();
      // Offline support (2026-08-17) — drena a fila local de doses
      // marcadas sem internet + fica ouvindo reconexão pro resto da
      // sessão. Idempotente (startAutoSync já ignora chamada repetida).
      startAutoSync();
    }
  }, [user, isLoading, hasCompletedOnboarding, hasOnboardingHydrated, segments]);

  return null;
}

function ThemedLayout() {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation();
  useLanguage(); // mantém i18next sincronizado com languageStore/idioma do aparelho
  const isLoading = useAuthStore((s) => s.isLoading);
  const hasOnboardingHydrated = useOnboardingStore((s) => s.hasHydrated);

  // Achado real de uso (2026-08-14): mesmo com o fix de `hasHydrated`
  // no AuthGuard, a tela de onboarding ainda "piscava" por meio segundo
  // toda abertura, mesmo pra quem já tinha completado antes. Causa:
  // `AuthGuard` decide pra onde navegar dentro de um `useEffect`, que
  // só roda *depois* da primeira renderização — o `<Stack>` sempre
  // montava a tela padrão (a primeira registrada) antes da decisão
  // correta acontecer. Não renderiza o `<Stack>` até auth + reidratação
  // do onboarding estarem prontos; mostra só a cor de fundo do tema
  // nesse intervalo curto, nunca uma tela real errada.
  if (isLoading || !hasOnboardingHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen
          name="medication/[id]"
          options={{
            headerShown: true,
            title: t('medicationModal.title'),
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="pro"
          options={{
            headerShown: true,
            title: t('pro.headerTitle'),
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="help"
          options={{
            headerShown: true,
            title: t('help.headerTitle'),
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </>
  );
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <ThemedLayout />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
