import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { useProfileStore } from '../store/profileStore';

// "De quem são esses dados?" em todas as abas (2026-09-11, achado real
// do Rilson: só a Home avisava "Cuidando de {{nome}}" quando o
// cuidador via o perfil de outra pessoa, e só Home/Perfil deixavam
// TROCAR de perfil — Histórico/Remédios/Estoque não tinham nem aviso
// nem troca, mesmo risco de confusão que o banner da Home já existia
// pra evitar, só que sem cobertura ali). Mesmo texto/mesma lógica que
// já existia inline na Home (`isCaregiverView`, `setActiveProfile`),
// extraído aqui pra virar 1 componente reusado nas 4 abas — só a
// aparência muda: aqui roda sobre o cabeçalho NATIVO claro das outras
// abas, não o cabeçalho colorido próprio da Home, então usa tokens de
// tema neutros (`brand`/`surfaceSecondary`) em vez das cores brancas
// fixas que só fazem sentido sobre o roxo. A Home continua com a
// versão dela, própria — não foi convertida pra usar este componente
// pra não arriscar quebrar nada no cabeçalho dela, que já está testado
// e é visualmente mais rico (anel de adesão, streak, etc.) junto.
//
// Só aparece quando tem algo REAL pra mostrar: aviso de cuidador OU
// mais de 1 perfil pra trocar. Com 1 perfil só e sem ser cuidador
// (o caso mais comum), não mostra nada — clutter à toa em 4 telas a
// mais seria pior do que a Home ter isso sempre visível numa só.
export function ProfileContextBar() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { activeProfile, profiles, setActiveProfile } = useProfileStore();
  const isCaregiverView = activeProfile?.is_owner === false;

  if (!isCaregiverView && profiles.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      {isCaregiverView && !!activeProfile && (
        <View
          style={[styles.banner, { backgroundColor: colors.brandSubtle }]}
          accessible
          accessibilityLabel={t('home.caregiverBanner', { name: activeProfile.name })}
        >
          <MaterialCommunityIcons name="account-heart-outline" size={14} color={colors.brand} />
          <Text style={[styles.bannerText, { color: colors.brand }]}>
            {t('home.caregiverBanner', { name: activeProfile.name })}
          </Text>
        </View>
      )}
      {profiles.length > 1 && (
        <FlatList
          data={profiles}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = activeProfile?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceSecondary }]}
                onPress={() => setActiveProfile(item)}
                accessibilityRole="button"
                accessibilityLabel={t('home.profileLabel', { name: item.name })}
                accessibilityState={{ selected: active }}
              >
                <MaterialCommunityIcons
                  name={(item.avatar_emoji as any) ?? 'account'}
                  size={15}
                  color={active ? colors.onBrand : colors.textSecondary}
                />
                <Text style={[styles.chipText, { color: active ? colors.onBrand : colors.textSecondary }]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10,
  },
  bannerText: { fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 12 },
  // minHeight 48 (WCAG AAA, mesmo padrão já auditado na Home) — troca
  // de perfil ativo, ação real e usada com frequência por quem cuida
  // de mais de uma pessoa.
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
});
