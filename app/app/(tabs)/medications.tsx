import { useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { getMedications, formatDosageUnit } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';

export default function MedicationsScreen() {
  const { t } = useTranslation();
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();

  const { data: medications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  return (
    <View style={styles.container}>
      {isLoading ? (
        <SkeletonList lines={3} />
      ) : (
        <FlatList
          data={medications}
          // Grid 2 colunas no desktop (W1 web): remount via key é
          // obrigatório ao mudar numColumns dinamicamente.
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.gridRow : undefined}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          ListEmptyComponent={<Text style={styles.empty}>{t('medications.empty')}</Text>}
          renderItem={({ item }) => (
            <Link href={`/medication/${item.id}`} asChild>
              <TouchableOpacity
                // Achado real testando no dispositivo (2026-08-13):
                // expo-router's <Slot> (por trás do asChild do Link)
                // reclama de estilo em array no filho direto — precisa
                // vir achatado num objeto só, StyleSheet.flatten resolve.
                style={StyleSheet.flatten([styles.card, item.is_paused && styles.cardPaused, isWide && { flex: 1 }])}
                accessibilityRole="button"
                accessibilityLabel={
                  item.is_paused
                    ? `${t('medicationForm.pausedNotice')} ${t('medications.cardLabel', { count: item.schedules.length, name: item.name, dosageUnit: formatDosageUnit(item.dosage, item.unit) })}`
                    : t('medications.cardLabel', { count: item.schedules.length, name: item.name, dosageUnit: formatDosageUnit(item.dosage, item.unit) })
                }
              >
                {/* Foto (2026-08-13) — reconhecer visualmente vale mais
                    que ler o nome pro público idoso/cuidador; sem foto,
                    cai pra bolinha colorida de sempre. */}
                {item.photo_url ? (
                  <Image
                    source={{ uri: item.photo_url }}
                    style={[styles.photoThumb, item.is_paused && styles.colorDotPaused]}
                  />
                ) : (
                  <View style={[styles.colorDot, { backgroundColor: item.color }, item.is_paused && styles.colorDotPaused]} />
                )}
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.is_paused && (
                      <View style={styles.pausedBadge}>
                        <MaterialCommunityIcons name="pause" size={11} color={colors.textMuted} />
                        <Text style={styles.pausedBadgeText}>{t('medications.pausedBadge')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dosage}>{formatDosageUnit(item.dosage, item.unit)}</Text>
                  <Text style={styles.schedules}>
                    {t('medications.scheduleCount', { count: item.schedules.length })} · {item.stock?.current_quantity ?? 0} {item.stock?.unit ?? t('medications.defaultUnit')} {t('medications.stockCount')}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </Link>
          )}
        />
      )}

      <Link href="/medication/new" asChild>
        <TouchableOpacity style={styles.fab} accessibilityRole="button" accessibilityLabel={t('medications.addLabel')}>
          <MaterialCommunityIcons name="plus" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    list: { padding: 16, gap: 12 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24 },
    gridRow: { gap: 12 },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, fontSize: 16 },
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      flexDirection: 'row', alignItems: 'center', padding: 16,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardPaused: { opacity: 0.6 },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 14 },
    colorDotPaused: { opacity: 0.4 },
    photoThumb: { width: 40, height: 40, borderRadius: 8, marginRight: 14 },
    info: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 16, fontWeight: '600', color: c.text },
    pausedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: c.surfaceSecondary, borderRadius: 8,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    pausedBadgeText: { fontSize: 10, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    dosage: { fontSize: 14, color: c.textSecondary, marginTop: 2 },
    schedules: { fontSize: 13, color: c.textMuted, marginTop: 4 },
    fab: {
      position: 'absolute', right: 24, bottom: 24,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
      elevation: 6, shadowColor: c.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
  });
}
