import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';

// Irmão de ConfirmDialog.tsx pra aviso/erro de um botão só (sem
// decisão sim/não). Achado real (2026-08-14): mesmo o `Alert.alert`
// nativo de uma mensagem só destoa do resto do app aos olhos de quem
// está testando de verdade — a distinção "só erro pode ser nativo" que
// fizemos antes não se sustentou no uso real.
export interface AlertDialogProps {
  visible: boolean;
  title: string;
  message: string;
  okLabel: string;
  onDismiss: () => void;
}

export function AlertDialog({ visible, title, message, okLabel, onDismiss }: AlertDialogProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity
            style={styles.okBtn}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={okLabel}
          >
            <Text style={styles.okText}>{okLabel}</Text>
          </TouchableOpacity>
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
  });
}
