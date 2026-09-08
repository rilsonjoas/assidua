import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

// Irmão de ConfirmDialog.tsx pra aviso/erro de um botão só (sem
// decisão sim/não). Achado real (2026-08-14): mesmo o `Alert.alert`
// nativo de uma mensagem só destoa do resto do app aos olhos de quem
// está testando de verdade — a distinção "só erro pode ser nativo" que
// fizemos antes não se sustentou no uso real.
//
// `actionLabel`/`onAction` (2026-09-07, item 14) — achado real do
// Rilson: bater no limite de medicamentos do plano gratuito mostrava um
// alerta de um botão só ("OK"), sem caminho pra realmente resolver
// (upgrade pro Pro). Genérico e reaproveitável de propósito — não é um
// componente de upsell dedicado, serve pra qualquer alerta que precise
// de uma ação além de "fechar" (ex.: o mesmo limite em Perfis). Ambos
// opcionais: sem eles, o dialog continua exatamente como antes (só
// "OK"), nenhuma tela existente precisa mudar.
export interface AlertDialogProps {
  visible: boolean;
  title: string;
  message: string;
  okLabel: string;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function AlertDialog({ visible, title, message, okLabel, onDismiss, actionLabel, onAction }: AlertDialogProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const hasAction = !!actionLabel && !!onAction;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {hasAction ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={okLabel}
              >
                <Text style={styles.dismissText}>{okLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onAction}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                <Text style={styles.okText}>{actionLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.okBtn}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={okLabel}
            >
              <Text style={styles.okText}>{okLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    card: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface,
      borderRadius: 18, padding: 20,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 8 },
    message: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    okBtn: { backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    okText: { color: c.onBrand, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    dismissBtn: { flex: 1, padding: 13, borderRadius: 10, alignItems: 'center' },
    dismissText: { color: c.textSecondary, fontWeight: '600' },
    actionBtn: { flex: 1, backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center' },
  });
}
