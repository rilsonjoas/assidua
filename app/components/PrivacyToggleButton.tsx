import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { usePrivacyStore } from '../store/privacyStore';
import { togglePrivacyWithHint } from '../lib/privacy';

// "Modo Privacidade" em todas as abas (2026-09-11, achado real do
// Rilson: o olho só existia no cabeçalho custom da Home — quem
// precisava mascarar em Remédios/Histórico/Estoque tinha que voltar
// pra Home primeiro, mesmo o estado já sendo global). Plugado uma vez
// só em `screenOptions.headerRight` (ver `app/(tabs)/_layout.tsx`), não
// em cada tela — as 4 abas com cabeçalho nativo ganham o mesmo botão,
// sempre no mesmo canto. A Home continua com o dela, próprio (cabeçalho
// custom colorido, ícone branco) — mesma função (`togglePrivacyWithHint`),
// só não usa este componente porque o estilo do cabeçalho é outro.
export function PrivacyToggleButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isPrivate = usePrivacyStore((s) => s.isPrivate);

  return (
    <TouchableOpacity
      onPress={togglePrivacyWithHint}
      accessibilityRole="switch"
      accessibilityLabel={t('profile.privacyToggle')}
      accessibilityHint={t('profile.privacyModeHint')}
      accessibilityState={{ checked: isPrivate }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={styles.button}
    >
      <MaterialCommunityIcons
        name={isPrivate ? 'eye-off-outline' : 'eye-outline'}
        size={24}
        color={colors.text}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { padding: 8, marginRight: 4 },
});
