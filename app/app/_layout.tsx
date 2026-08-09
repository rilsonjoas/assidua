import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { getMe } from '../services/auth';
import { useTheme } from '../hooks/useTheme';

const queryClient = new QueryClient();

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// enabled: false sem DSN — SDK vira no-op, não tenta mandar nada.
// Mesmo padrão do backend (config/sentry.php lê de env, sem quebrar
// sem a chave configurada).
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  tracesSampleRate: 1.0,
});

function AuthGuard() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then((me) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading) return;
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
    if (user && inAuth) router.replace('/(tabs)/');
  }, [user, isLoading, hasCompletedOnboarding, segments]);

  return null;
}

function ThemedLayout() {
  const { isDark, colors } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="medication/[id]"
          options={{
            headerShown: true,
            title: 'Medicamento',
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
