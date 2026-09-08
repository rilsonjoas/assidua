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
import { usePrivacyStore } from '../../store/privacyStore';
import { useMedicationsSortStore, MedicationsSort } from '../../store/medicationsSortStore';
import { maskMedicationName } from '../../lib/privacy';
import { getMedications, formatDosageUnit } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AppText as Text } from '../../components/AppText';

// "Ordenar por" (2026-09-07, item 11) — v1 traz só as duas baratas
// (dado já pronto, sem mudança de backend): nome já vem em toda
// resposta, `days_remaining` já é calculado no backend
// (`Medication.php`, `$appends`). "Próxima dose" fica pra depois — pra
// horário de intervalo, o horário real depende de quando a última dose
// foi tomada de verdade, dado que hoje só existe na tela Hoje.
const SORT_OPTIONS: { key: MedicationsSort; labelKey: string }[] = [
  { key: 'alphabetical', labelKey: 'medications.sortAlphabetical' },
  { key: 'stock-low', labelKey: 'medications.sortStockLow' },
];

export default function MedicationsScreen() {
  const { t, i18n } = useTranslation();
  const { activeProfile } = useProfileStore();
  const { isPrivate } = usePrivacyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const sort = useMedicationsSortStore((s) => s.sort);
  const setSort = useMedicationsSortStore((s) => s.setSort);

  const { data: rawMedications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const medications = useMemo(() => {
    const list = [...rawMedications];
    if (sort === 'alphabetical') {
      list.sort((a, b) => a.name.localeCompare(b.name, i18n.language));
    } else {
      // "Estoque acabando primeiro" — `days_remaining` nulo (sem
      // estoque rastreado ainda) vai pro fim, não pro topo: ausência de
      // dado não é a mesma coisa que urgência.
      list.sort((a, b) => {
        if (a.days_remaining === null && b.days_remaining === null) return 0;
        if (a.days_remaining === null) return 1;
        if (b.days_remaining === null) return -1;
        return a.days_remaining - b.days_remaining;
      });
    }
    return list;
  }, [rawMedications, sort, i18n.language]);

  return (
    <View style={styles.container}>
      {!isLoading && medications.length > 0 && (
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => {
            const label = t(option.labelKey);
            const active = sort === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSort(option.key)}
                accessibilityRole="button"
                accessibilityLabel={t('medications.sortAccessibilityLabel', { label })}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {isLoading ? (
        <SkeletonList lines={3} />
      ) : (
        <FlatList
          data={medications}
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.gridRow : undefined}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          ListEmptyComponent={
            // Achado real de uso (2026-09-05): lista vazia era só um
            // texto cinza, sem convite claro — pra quem abre o app pela
            // primeira vez, um beco sem saída visual em vez de um
            // próximo passo óbvio (mesmo padrão já validado na Home,
            // ver `home.noDosesTitle`). Cuidador não cadastra remédio
            // (FAB também já fica oculto pra ele), então mantém só o
            // texto simples nesse caso.
            activeProfile?.is_owner !== false ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="pill" size={56} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>{t('medications.emptyTitle')}</Text>
                <Text style={styles.emptyText}>{t('medications.emptyText')}</Text>
                <Link href="/medication/new" asChild>
                  <TouchableOpacity style={styles.emptyBtn} accessibilityRole="button">
                    <Text style={styles.emptyBtnText}>{t('medications.addLabel')}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            ) : (
              <Text style={styles.empty}>{t('medications.empty')}</Text>
            )
          }
          renderItem={({ item }) => {
            const maskedName = maskMedicationName(item.name, isPrivate);
            return (
              <Link href={`/medication/${item.id}`} asChild>
                <TouchableOpacity
                  style={StyleSheet.flatten([styles.card, item.is_paused && styles.cardPaused, isWide && { flex: 1 }])}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.is_paused
                      ? `${t('medicationForm.pausedNotice')} ${t('medications.cardLabel', { count: item.schedules.length, name: maskedName, dosageUnit: formatDosageUnit(item.dosage, item.unit) })}`
                      : t('medications.cardLabel', { count: item.schedules.length, name: maskedName, dosageUnit: formatDosageUnit(item.dosage, item.unit) })
                  }
                >
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
                      <Text style={styles.name}>{maskedName}</Text>
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
          );
        }}
        />
      )}

      {activeProfile?.is_owner !== false && (
        <Link href="/medication/new" asChild>
          <TouchableOpacity style={styles.fab} accessibilityRole="button" accessibilityLabel={t('medications.addLabel')}>
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </Link>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // "Ordenar por" (2026-09-07, item 11) — chips no topo, mesmo padrão
    // visual já usado em presets de dias/intervalo no cadastro de
    // remédio, não um menu escondido.
    sortRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      paddingHorizontal: 16, paddingTop: 16,
    },
    sortChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    sortChipActive: { backgroundColor: c.brand, borderColor: c.brand },
    sortChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    sortChipTextActive: { color: c.onBrand },
    list: { padding: 16, gap: 12 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24 },
    gridRow: { gap: 12 },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, fontSize: 16 },
    // Mesmo padrão visual do estado vazio da Home (emptyBox/emptyTitle/
    // emptyText/emptyBtn) — ícone, título, texto de apoio e CTA.
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10, marginTop: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    // minHeight 48 (WCAG AAA, achado revisando toque mínimo 2026-09-05).
    emptyBtn: { backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8, minHeight: 48, justifyContent: 'center' },
    emptyBtnText: { color: c.onBrand, fontWeight: '600', fontSize: 15 },
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
