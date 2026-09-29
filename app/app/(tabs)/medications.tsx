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
import { isStockNeverSet, formatStockQuantity } from '../../lib/stockQuantity';
import { getMedications, formatDosageUnit, LOW_STOCK_DAYS_THRESHOLD } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { ProfileContextBar } from '../../components/ProfileContextBar';
import { SkeletonList } from '../../components/Skeleton';
import { LoadErrorState } from '../../components/LoadErrorState';
import { AppText as Text } from '../../components/AppText';
import { rounded, spacing, type } from '../../constants/tokens';

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

  const { data: rawMedications = [], isLoading, isError, refetch } = useQuery({
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
      <ProfileContextBar />
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
      {/* 9.7 — falha de rede não é "você não tem remédios". Antes, um
          reject na query deixava a lista vazia e caía no estado vazio com
          o convite "Adicionar remédio" — a mesma armadilha da Home. */}
      {isError ? (
        <LoadErrorState onRetry={() => refetch()} message={t('medications.loadErrorText')} />
      ) : isLoading ? (
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
            // "Remédios não avisa estoque baixo" (2026-09-08, achado real
            // revisando a tela): só a aba Estoque tinha esse alerta —
            // quem só olha a lista de Remédios no dia a dia não via nada.
            // Mesmo limiar/cor/ícone que já existiam lá (`stock.tsx`).
            const daysRemaining = item.days_remaining;
            const isLow = daysRemaining !== null && daysRemaining <= LOW_STOCK_DAYS_THRESHOLD;
            return (
              <Link href={`/medication/${item.id}`} asChild>
                <TouchableOpacity
                  style={StyleSheet.flatten([styles.card, isLow && styles.cardAlert, item.is_paused && styles.cardPaused, isWide && { flex: 1 }])}
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
                    {/* P4/§10.4 — sem isto o cartão de um resgate
                        aparecia como "0 horários", que parece remendo de
                        cadastro. O badge diz o que ele é: não tem
                        horário porque é para tomar quando precisar. */}
                    {item.is_prn && !item.is_paused && (
                      <View style={styles.prnBadge}>
                        <MaterialCommunityIcons name="medical-bag" size={11} color="#ea580c" />
                        <Text style={styles.prnBadgeText}>{t('prn.badge')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dosage}>{formatDosageUnit(item.dosage, item.unit)}</Text>
                  <Text style={styles.schedules}>
                    {/*
                      P4: para o resgate, "0 horários" era a linha
                      inteira — e é a única informação que a pessoa tem
                      na lista. "sem horário previsto" diz a verdade e
                      evita a leitura de cadastro quebrado.
                    */}
                    {item.is_prn ? t('prn.noSchedule') : t('medications.scheduleCount', { count: item.schedules.length })}
                    {' · '}
                    {/* Mesma distinção do Estoque (2026-09-28): estoque
                        nunca informado NÃO é "0 em estoque". Aqui dizia
                        "0 unid em estoque" liso, enquanto a aba Estoque —
                        com o mesmo dado — dizia "não informado". Para um
                        idoso, "0" significa "estou sem remédio": ele ia
                        à farmácia ou desistia de tomar o que tem em
                        casa. `isStockNeverSet` já existia desde
                        2026-09-05, aplicado só em um dos dois lugares. */}
                    {isStockNeverSet(item.stock) ? (
                      <Text style={styles.neverSetInline}>{t('stock.neverSetShort')}</Text>
                    ) : (
                      <>
                        {/* Mesma unidade do campo próprio da aba Estoque
                            (2026-09-28) — ver `formatStockQuantity`. */}
                        {formatStockQuantity({
                          quantity: item.stock?.current_quantity ?? 0,
                          stockUnit: item.stock?.unit,
                        })}{' '}
                        {t('medications.stockCount')}
                      </>
                    )}
                  </Text>
                  {isLow && (
                    <View style={styles.alertRow}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.warning} />
                      <Text style={styles.alertText}>
                        {daysRemaining! <= 0 ? t('stock.stockOut') : t('stock.endsIn', { count: daysRemaining })}
                      </Text>
                    </View>
                  )}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </Link>
          );
        }}
        />
      )}

      {/* Só aparece com a lista não-vazia (2026-09-08, achado real
          revisando a tela) — com a lista vazia, o estado vazio acima já
          tem seu próprio botão grande "Adicionar medicamento"; o FAB por
          cima virava um segundo botão fazendo a mesma coisa, redundante.
          Mesma regra que a Home já aplica certo no próprio FAB dela. */}
      {activeProfile?.is_owner !== false && medications.length > 0 && (
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
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
      paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
    },
    // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08) —
    // só 2 chips numa fileira, sobra espaço de sobra pra crescer sem
    // apertar nada.
    sortChip: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: rounded.xl, minHeight: 48,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    sortChipActive: { backgroundColor: c.brand, borderColor: c.brand },
    sortChipText: { fontSize: type.micro, fontWeight: '600', color: c.textSecondary },
    sortChipTextActive: { color: c.onBrand },
    list: { padding: spacing.lg, gap: spacing.md },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.xxl },
    gridRow: { gap: spacing.md },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: spacing.huge, fontSize: type.body },
    // Mesmo padrão visual do estado vazio da Home (emptyBox/emptyTitle/
    // emptyText/emptyBtn) — ícone, título, texto de apoio e CTA.
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.huge, gap: spacing.sm, marginTop: spacing.huge },
    emptyTitle: { fontSize: type.critical, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    emptyText: { fontSize: type.caption, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    // minHeight 48 (WCAG AAA, achado revisando toque mínimo 2026-09-05).
    emptyBtn: { backgroundColor: c.brand, borderRadius: rounded.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, marginTop: spacing.sm, minHeight: 48, justifyContent: 'center' },
    emptyBtnText: { color: c.onBrand, fontWeight: '600', fontSize: type.label },
    prnBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      backgroundColor: '#fff7ed',
      borderWidth: 1,
      borderColor: '#fed7aa',
      borderRadius: rounded.sm,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs,
    },
    prnBadgeText: { color: '#c2410c', fontSize: type.micro, fontWeight: '700' },
    // "Estoque não informado" dentro da linha de metadados: mesma
    // cor do texto, sem destacar — é informação, não alarme. O que não
    // pode é aparecer o número "0" (ver `isStockNeverSet`).
    neverSetInline: { color: c.textMuted },
    card: {
      backgroundColor: c.surface, borderRadius: rounded.lg,
      flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardPaused: { opacity: 0.6 },
    // Mesmo tratamento visual do alerta de estoque baixo na aba Estoque.
    cardAlert: { borderWidth: 1.5, borderColor: c.warning },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    alertText: { fontSize: type.micro, color: c.warning },
    colorDot: { width: 14, height: 14, borderRadius: rounded.sm, marginRight: spacing.md },
    colorDotPaused: { opacity: 0.4 },
    photoThumb: { width: 40, height: 40, borderRadius: rounded.sm, marginRight: spacing.md },
    info: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    name: { fontSize: type.body, fontWeight: '600', color: c.text },
    pausedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xxs,
      backgroundColor: c.surfaceSecondary, borderRadius: rounded.sm,
      paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs,
    },
    pausedBadgeText: { fontSize: type.micro, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    dosage: { fontSize: type.caption, color: c.textSecondary, marginTop: spacing.xxs },
    schedules: { fontSize: type.micro, color: c.textMuted, marginTop: spacing.xs },
    fab: {
      position: 'absolute', right: 24, bottom: 24,
      width: 56, height: 56, borderRadius: rounded.xxl,
      backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
      elevation: 6, shadowColor: c.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
  });
}
