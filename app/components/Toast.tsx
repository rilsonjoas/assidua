import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';
import { useToastStore } from '../store/toastStore';

// Extraído do toast que só existia (ad-hoc, local ao componente) em Hoje
// pra confirmação de dose. Montado uma vez em `_layout.tsx`, igual
// `OfflineBanner`/`PrivacyBlur`, pra qualquer tela poder confirmar uma
// ação (salvar remédio, atualizar estoque, ...) mesmo quando a própria
// tela sai logo em seguida — ver `store/toastStore.ts`.
export function Toast() {
  const message = useToastStore((s) => s.message);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (!message) return null;

  return (
    <View style={styles.container} accessible accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 24,
      left: 20,
      right: 20,
      backgroundColor: c.success,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      zIndex: 999,
    },
    text: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  });
}
