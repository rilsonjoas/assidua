import { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { usePrivacyStore } from '../store/privacyStore';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { authenticateWithBiometrics } from '../services/biometrics';
import { AppText as Text } from './AppText';

// Bloqueio biométrico (2026-09-11, item 4 da rodada de transparência —
// "bora retomar, com todo cuidado e teste possível"). Mesmo padrão
// visual/de posição do OfflineBanner/PrivacyBlur (overlay montado uma
// vez em `_layout.tsx`, cobre a tela inteira quando ativo) — mais
// simples que reestruturar a árvore pra "envolver" o app inteiro.
//
// Só na ABERTURA do app (decisão confirmada com o Rilson: não é app
// financeiro, e o público mais idoso do app sofreria mais com fricção
// repetida do que ganharia em segurança pedindo de novo toda vez que
// volta de segundo plano). `unlocked` é local a este componente, que só
// monta 1x por processo — reabrir o app do zero cria uma instância
// nova (pede de novo); trocar de app rapidinho e voltar não desmonta
// nada, continua liberado.
//
// Só ativa com usuário autenticado + onboarding completo — mesma
// condição que já liga `registerPushToken`/`startAutoSync` no
// AuthGuard, ver `_layout.tsx`. Sem isso, mostraria a tela de bloqueio
// por cima do login, que não tem nada sensível pra proteger ainda.
export function BiometricLockScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isBiometricsEnabled = usePrivacyStore((s) => s.isBiometricsEnabled);
  const privacyHasHydrated = usePrivacyStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const onboardingHasHydrated = useOnboardingStore((s) => s.hasHydrated);

  // Achado da auditoria de segurança (2026-09-11) — falha FECHADA, não
  // aberta: enquanto os stores persistidos ainda não terminaram de
  // reidratar do AsyncStorage (assíncrono, corrida real com o boot do
  // app — mesma classe de bug já achada uma vez em
  // `store/onboardingStore.ts`), `isBiometricsEnabled` pode estar lendo
  // o default `false` mesmo pra quem tinha o bloqueio ligado de
  // verdade. `readyToDecide` represa a decisão até os dois hidratarem;
  // `stillDeciding` cobre a tela nesse meio-tempo (sem ainda saber se
  // precisa pedir biometria) em vez de arriscar mostrar o app de
  // verdade por uma fresta.
  const readyToDecide = privacyHasHydrated && onboardingHasHydrated;
  const shouldLock = readyToDecide && isBiometricsEnabled && !!user && hasCompletedOnboarding;
  const stillDeciding = !readyToDecide && !!user && hasCompletedOnboarding;

  const [unlocked, setUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const attempted = useRef(false);

  async function attemptUnlock() {
    setAuthenticating(true);
    // Sem `disableDeviceFallback` — já vem `false` por padrão dentro de
    // `authenticateWithBiometrics` (fallback pra PIN/senha do aparelho
    // sozinho, sem código novo aqui).
    const success = await authenticateWithBiometrics(t('profile.biometricLockPrompt'));
    setAuthenticating(false);
    if (success) setUnlocked(true);
  }

  useEffect(() => {
    // Dispara sozinho assim que precisa travar, sem esperar a pessoa
    // tocar em nada — igual ao "portão na entrada" que o toggle promete.
    if (shouldLock && !unlocked && !attempted.current) {
      attempted.current = true;
      attemptUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLock]);

  if ((!shouldLock && !stillDeciding) || unlocked) return null;

  return (
    <View
      style={[styles.overlay, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
      testID="biometric-lock-overlay"
    >
      <MaterialCommunityIcons name="shield-lock" size={64} color={colors.brand} />
      <Text style={[styles.title, { color: colors.text }]}>Assídua</Text>
      {/* `stillDeciding` (2026-09-11, achado da auditoria) — ainda não
          sabe se precisa pedir biometria (aguardando reidratar o
          store), então não mostra nem o texto nem o botão de "tentar
          de novo" ainda — só a marca, cobrindo por segurança. Vira a
          tela real (pedindo ou não) assim que `readyToDecide` resolver. */}
      {!stillDeciding && (
        <>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('profile.biometricLockScreenText')}
          </Text>
          {/* Sem brecha (2026-09-11, decisão confirmada com o Rilson):
              sem botão de "pular"/"continuar sem autenticar" — cancelar
              ou falhar só deixa "Tentar de novo", nunca um jeito de ver
              o app sem passar pela autenticação. */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.brand }]}
            onPress={attemptUnlock}
            disabled={authenticating}
            accessibilityRole="button"
            accessibilityLabel={t('profile.biometricLockRetry')}
          >
            <Text style={[styles.buttonText, { color: colors.onBrand }]}>{t('profile.biometricLockRetry')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000, // acima até do PrivacyBlur (99999) — precisa cobrir tudo, sempre.
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  button: {
    marginTop: 28, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { fontWeight: '600', fontSize: 15 },
});
