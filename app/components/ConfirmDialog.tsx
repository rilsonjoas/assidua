import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

// Achado real testando no dispositivo (2026-08-13): `Alert.alert` sempre
// renderiza o diálogo *nativo* do sistema operacional — cor, fonte e
// cantos de fábrica, sem noção de tema claro/escuro do app. Pra decisões
// reais (sair da conta, excluir conta, remover horário — qualquer
// confirmação com 2 escolhas), isso destoa visivelmente do resto do
// app.
// Atualização (2026-08-14): a distinção original — "erro/aviso de uma
// tela só pode continuar nativo" — não se sustentou no teste real; ver
// `AlertDialog.tsx`, o irmão de um botão só deste componente. Ação de
// escolher entre 3+ opções (câmera/galeria/remover foto) continua
// legítima como `Alert.alert` nativo — isso o próprio SO já resolve bem
// como action sheet, não é o mesmo caso.
export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive && styles.confirmBtnDestructive]}
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy: !!busy }}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
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
    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: {
      flex: 1, padding: 13, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, alignItems: 'center',
    },
    cancelText: { color: c.textSecondary, fontWeight: '600' },
    confirmBtn: { flex: 1, backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center' },
    confirmBtnDestructive: { backgroundColor: c.error },
    confirmText: { color: c.onBrand, fontWeight: '600' },
  });
}
