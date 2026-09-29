import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { AppText as Text } from './AppText';
import { rounded, spacing, type } from '../constants/tokens';

/**
 * "Não foi possível carregar" — 9.7 (2026-09-25).
 *
 * Existe porque o app, em cinco telas, tratava **falha de rede** como
 * **estado vazio**: a requisição rejects, a lista fica `[]`, e a tela
 * mostra "nada por aqui" com um convite para criar. São duas coisas
 * diferentes e a confusão não era neutra — na Home, o convite era
 * "Criar perfil", ou seja, uma falha de virada resultava em perfil
 * duplicado.
 *
 * `OfflineBanner` NÃO cobre este caso: ele responde "não tem internet",
 * e aqui também falha 403 e 500, que acontecem **com** internet. O estado
 * de erro precisa vir da própria requisição (`isError` do react-query),
 * que é o que este componente recebe.
 */
interface LoadErrorStateProps {
  /** Botão de tentar de novo. `react-query` refaz a query sozinho. */
  onRetry?: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Sobrescreve o texto padrão ("não deu pra carregar isto"). */
  message?: string;
}

export function LoadErrorState({ onRetry, icon = 'wifi-alert', message }: LoadErrorStateProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={styles.box} accessible accessibilityRole="alert">
      <MaterialCommunityIcons name={icon} size={56} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.text }]}>{t('common.loadErrorTitle')}</Text>
      <Text style={[styles.text, { color: colors.textMuted }]}>{message ?? t('common.loadErrorText')}</Text>
      {onRetry && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.brand }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
          onPress={onRetry}
        >
          <Text style={[styles.btnText, { color: colors.onBrand }]}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.huge, gap: spacing.sm, marginTop: spacing.huge },
  title: { fontSize: type.section, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: type.label, textAlign: 'center', lineHeight: 21 },
  btn: { marginTop: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: rounded.md },
  btnText: { fontSize: type.label, fontWeight: '600' },
});
