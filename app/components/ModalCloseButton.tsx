import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

// Achado real de uso (2026-09-02): "botão de editar sem X — quem abre
// achando que vai sair não encontra como". O back chevron padrão do
// header (nativo do Stack) não bastou como affordance de fechar pra
// quem testou de verdade. Substitui `headerLeft` nas telas em
// `presentation: 'modal'` (medicamento, pro, ajuda) por um X grande e
// inequívoco — mesmo alvo de toque nas três, sem depender de convenção
// de navegação que nem todo usuário reconhece.
export function ModalCloseButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={styles.button}
    >
      <MaterialCommunityIcons name="close" size={24} color={colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // padding some no toque mínimo de 44px já com o hitSlop.
  button: { padding: 8 },
});
