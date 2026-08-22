import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../hooks/useTheme';
import { User } from '../services/auth';
import { setAuthToken } from '../services/tokenStorage';

// Achado real (2026-08-14): `WebBrowser.openAuthSessionAsync` (usado em
// `services/auth.ts`) deveria interceptar o redirect do Google antes dele
// virar um deep link de verdade, mas em pelo menos um aparelho real
// (Custom Tabs do Samsung) isso não aconteceu — o Android tratou
// `assidua://auth-callback?...` como abertura normal do app, e sem
// rota registrada pra esse caminho, o expo-router mostrava "Unmatched
// Route" com o token inteiro exposto na tela, sem nunca logar.
//
// Essa tela é a rede de segurança: trata a query string sozinha, sem
// depender da Promise do WebBrowser ter resolvido. Vira a fonte de
// verdade do login por Google — o `AuthGuard` em `_layout.tsx` já reage
// a mudança de `user` e decide sozinho pra onde navegar (onboarding vs.
// tabs), então não precisamos duplicar essa lógica aqui.
export default function AuthCallback() {
  const params = useLocalSearchParams<{
    token?: string;
    id?: string;
    name?: string;
    email?: string;
    subscription_tier?: string;
  }>();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const { colors } = useTheme();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!params.token) {
      router.replace('/(auth)/login');
      return;
    }

    (async () => {
      await setAuthToken(params.token as string);
      const user: User = {
        id: Number(params.id),
        name: params.name ?? '',
        email: params.email ?? '',
        avatar_url: null,
        subscription_tier: (params.subscription_tier as 'free' | 'pro') ?? 'free',
        has_password: false,
      };
      setUser(user);
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}
