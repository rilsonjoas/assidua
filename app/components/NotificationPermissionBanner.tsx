import { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, AppState, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { getNotificationPermissionStatus } from '../services/notifications';
import { useAlertDialog } from '../hooks/useAlertDialog';
import { AppText as Text } from './AppText';

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
// sistema, desliga, volta. Sem isso, o banner só atualizaria na próxima
// vez que o app fosse aberto do zero.
export function NotificationPermissionBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showAlert, alertDialog } = useAlertDialog();
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  // Default 'active' explícito, não `AppState.currentState` cru — no
  // ambiente de teste esse valor não vem garantido como string (achado
  // real rodando a suíte), e semanticamente já é o esperado mesmo: o
  // componente só monta com o app já em primeiro plano.
  const appState = useRef<string>('active');

  useEffect(() => {
    let cancelled = false;
    function check() {
      getNotificationPermissionStatus()
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          // Best-effort — um erro aqui não deveria travar a Home nem
          // mostrar um banner errado; fica sem banner até a próxima
          // checagem.
        });
    }

    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        check();
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // `null` = ainda não checou (evita o banner "piscar" aparecendo e
  // sumindo rápido no boot); 'granted' = nada a avisar.
  if (status === null || status === 'granted') return null;

  function handlePress() {
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
      <TouchableOpacity
        style={[styles.banner, { backgroundColor: colors.warning }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.permissionBannerLabel')}
      >
        <MaterialCommunityIcons name="bell-off-outline" size={16} color="#fff" />
        <Text style={styles.text}>{t('notifications.permissionBannerText')}</Text>
      </TouchableOpacity>
      {alertDialog}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
});
