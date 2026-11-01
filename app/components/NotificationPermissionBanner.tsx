import { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, AppState, Linking, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSegments } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { getNotificationPermissionStatus, requestNotificationPermission } from '../services/notifications';
import { useAlertDialog } from '../hooks/useAlertDialog';
import { AppText as Text } from './AppText';
import { spacing, type } from '../constants/tokens';

// "Permissão negada é invisível pra sempre" (2026-09-11, achado real do
// Rilson revendo o app) — antes, notificação só era pedida 1x no
// onboarding; negar ali (ou revogar depois, nas configs do aparelho)
// nunca aparecia em lugar nenhum — os lembretes simplesmente paravam de
// chegar, sem aviso. Mesmo padrão visual/de posição do OfflineBanner
// (montado no _layout.tsx raiz, sempre visível quando relevante), mas
// TOCÁVEL — explica o que fazer, não só avisa que está desligado.
//
// Reconsulta ao voltar pro app (AppState 'active'), não só no mount —
// é exatamente assim que alguém revoga: sai do app, vai nas configs do
// sistema, desliga, volta.
//
// Atualização de UX (2026-11-01):
// 1. Botão "X" de fechar para permitir dispensa durante a sessão (evita
//    barra amarela permanente forçada se a pessoa optar por não ativar).
// 2. Escuta reativa na Web (navigator.permissions + window.focus) para
//    sumir no mesmo milissegundo em que a pessoa der "Permitir" no navegador.
// 3. Clique na Web chama requestNotificationPermission() direto (1 clique).
// 4. Oculto em rotas de autenticação/onboarding.
export function NotificationPermissionBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const segments = useSegments();
  const { showAlert, alertDialog } = useAlertDialog();
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const appState = useRef<string>('active');

  useEffect(() => {
    let cancelled = false;
    function check() {
      getNotificationPermissionStatus()
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          // Best-effort — um erro aqui não deveria travar nada
        });
    }

    check();

    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        check();
      }
      appState.current = next;
    });

    // Escuta reativa na Web: foco da janela e mudança de status de permissão
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', check);
      if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'notifications' as PermissionName })
          .then((statusObj) => {
            statusObj.onchange = () => {
              check();
            };
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', check);
      }
    };
  }, []);

  // Nunca poluir telas de autenticação/onboarding com banner de doses
  const inAuthGroup =
    segments?.[0] === '(auth)' ||
    segments?.[0] === '(onboarding)' ||
    segments?.[0] === 'auth-callback';

  if (inAuthGroup || isDismissed || status === null || status === 'granted') {
    return null;
  }

  async function handlePress() {
    if (Platform.OS === 'web') {
      const granted = await requestNotificationPermission();
      if (granted) {
        setStatus('granted');
        return;
      }
      showAlert(
        t('notifications.permissionBannerWebDialogTitle'),
        t('notifications.permissionBannerWebDialogMessage'),
        {
          label: t('common.understood', { defaultValue: 'Entendi' }),
          onPress: () => {},
        },
      );
      return;
    }

    showAlert(
      t('notifications.permissionBannerDialogTitle'),
      t('notifications.permissionBannerDialogMessage'),
      {
        label: t('notifications.permissionBannerDialogAction'),
        onPress: () => Linking.openSettings(),
      },
    );
  }

  return (
    <>
      <View style={[styles.banner, { backgroundColor: colors.warning }]}>
        <TouchableOpacity
          style={styles.bannerContent}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.permissionBannerLabel')}
        >
          <MaterialCommunityIcons name="bell-off-outline" size={16} color="#fff" />
          <Text style={styles.text}>{t('notifications.permissionBannerText')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => setIsDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.permissionBannerCloseLabel')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      {alertDialog}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 40,
  },
  closeBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  text: {
    color: '#fff',
    fontSize: type.microTight,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
});
