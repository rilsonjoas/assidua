import { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { useToastStore } from '../../store/toastStore';
import { maskMedicationName } from '../../lib/privacy';
import {
  parseStockQuantity,
  isStockNeverSet,
  formatStockQuantity,
  isMedicationLowStock,
  isLegacyDosageStockUnit,
} from '../../lib/stockQuantity';
import { getMedications, updateStock, Medication, LOW_STOCK_DAYS_THRESHOLD } from '../../services/medications';
import { scheduleRefillAlert } from '../../services/notifications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { AppText as Text } from '../../components/AppText';
import { ProfileContextBar } from '../../components/ProfileContextBar';
import { SkeletonList } from '../../components/Skeleton';
import { LoadErrorState } from '../../components/LoadErrorState';
import { useAlertDialog } from '../../hooks/useAlertDialog';
import { rounded, spacing, type } from '../../constants/tokens';

// Unidades em que alguém conta o que SOBROU. Diferente da unidade da
// dose: "50 mg" é quanto tomar, aqui é "em que coisa eu conto". As 6
// cobrem comprimido, cápsula, ml, gota, frasco e ampola — que é o que
// aparece numa caixa de remédio de verdade. Texto livre continuaria
// possível para o resto (patch, sachê), e nesse caso o item mantém a
// unidade que já tinha.
const STOCK_UNITS = ['unidades', 'comprimidos', 'cápsulas', 'ml', 'gotas', 'frascos', 'ampolas'] as const;

export default function StockScreen() {
  const { t } = useTranslation();
  const { activeProfile } = useProfileStore();
  const { isPrivate } = usePrivacyStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const [minAlertQty, setMinAlertQty] = useState('5');
  // Unidade do ESTOQUE, escolhida aqui (2026-09-28). Não é a unidade da
  // dose: "50 mg" é quanto tomar, "30 comprimidos" é o que sobrou. O
  // cadastro do remédio gravava a unidade da dose na linha de estoque
  // (`MedicationController.php:66`), então a tela dizia "30 mg" para 30
  // comprimidos. A `StockController.php:30` já aceita `unit` — o app é
  // que nunca mandava. A escolha fica na aba Estoque porque é lá que a
  // pessoa tem a caixa na mão e sabe em que coisa está contando.
  // `string`, não o literal de STOCK_UNITS: uma unidade fora da lista
  // (patch, sachê) é válida e precisa sobreviver a uma edição que não
  // mexeu na unidade.
  const [unit, setUnit] = useState<string>(STOCK_UNITS[0]);
  // Unidade que o item já tem, para o formulário abrir no valor atual
  // em vez de sempre no primeiro da lista.
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  // Qual dos dois botões está em voo — permite mostrar o spinner só
  // nele, não nos dois ao mesmo tempo (a mutação é uma só pras duas ações).
  const [pendingAction, setPendingAction] = useState<'add' | 'set' | null>(null);
  const { showAlert, alertDialog } = useAlertDialog();
  // Achado real de uso (2026-09-02): "salvar sem feedback visual" —
  // mesmo padrão do toast global usado no cadastro de remédio.
  const showToast = useToastStore((s) => s.showToast);

  const { data: medications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const activeMedications = useMemo(
    () => medications.filter((m) => m.is_active !== false),
    [medications],
  );

  const mutation = useMutation({
    mutationFn: ({
      id,
      quantity,
      unit: u,
      minAlert,
    }: {
      id: number;
      quantity: number;
      unit?: string;
      minAlert?: number;
    }) =>
      updateStock(id, {
        current_quantity: quantity,
        ...(u ? { unit: u } : {}),
        ...(minAlert !== undefined ? { min_alert_quantity: minAlert } : {}),
      }),
    onSuccess: async (_stock, { id }) => {
      await queryClient.invalidateQueries({ queryKey: ['medications', activeProfile?.id] });
      const fresh = queryClient.getQueryData<Medication[]>(['medications', activeProfile?.id]);
      const medication = fresh?.find((m) => m.id === id);
      if (medication) {
        await scheduleRefillAlert({
          medicationId: medication.id,
          medicationName: medication.name,
          daysRemaining: medication.days_remaining,
          thresholdDays: LOW_STOCK_DAYS_THRESHOLD,
        });
      }
      setEditing(null);
      showToast(t('stock.savedToast', { name: maskMedicationName(medication?.name, isPrivate) }));
    },
    // Achado real (2026-09-02): a mutação não tinha `onError` — uma
    // falha de rede/validação ficava muda, sem fechar o formulário nem
    // avisar nada (achado ao cobrir o novo fluxo de "Adicionar" com
    // teste). Formulário continua aberto de propósito, pra tentar de
    // novo sem perder o que já foi digitado.
    onError: () => {
      showAlert(t('common.error'), t('stock.errorSave'));
    },
    onSettled: () => setPendingAction(null),
  });

  // Achado real de uso (2026-09-02): "editar só reescreve — falta
  // adicionar e definir". Um campo só, dois botões: nenhum menu
  // escondido, e o número digitado sempre significa a mesma coisa (a
  // quantidade em si), o botão escolhido é que decide se ela substitui
  // o estoque atual ou soma a ele.
  function parseTypedQty(): number | null {
    const quantity = parseStockQuantity(qty);
    if (quantity === null) {
      showAlert(t('stock.invalidValue'));
    }
    return quantity;
  }

  function parseTypedMinAlert(med: Medication): number | undefined {
    if (!minAlertQty.trim()) return undefined;
    const parsed = parseStockQuantity(minAlertQty);
    if (parsed === null) return undefined;
    if (editing === med.id && parsed === (med.stock?.min_alert_quantity ?? 5)) return undefined;
    return parsed;
  }

  function setQtyAbsolute(med: Medication) {
    const quantity = parseTypedQty();
    if (quantity === null) return;
    setPendingAction('set');
    mutation.mutate({
      id: med.id,
      quantity,
      unit: unitToSend(med),
      minAlert: parseTypedMinAlert(med),
    });
  }

  function addQty(med: Medication) {
    const typed = parseTypedQty();
    if (typed === null) return;
    const current = med.stock?.current_quantity ?? 0;
    setPendingAction('add');
    mutation.mutate({
      id: med.id,
      quantity: current + typed,
      unit: unitToSend(med),
      minAlert: parseTypedMinAlert(med),
    });
  }

  // Só envia `unit` quando a pessoa mexeu nela. Reenviar sempre
  // sobrescreveria o que já estava gravado por um valor derivado errado.
  function unitToSend(med: Medication): string | undefined {
    const atual = med.stock?.unit;
    if (!atual) return unit;
    if (editing === med.id && unit === atual) return undefined;
    return unit;
  }

  function startEdit(med: Medication) {
    setEditing(med.id);
    setQty(String(med.stock?.current_quantity ?? 0));
    setMinAlertQty(med.stock?.min_alert_quantity != null ? String(med.stock.min_alert_quantity) : '5');
    // Abre no valor que o item já tem, e não sempre no primeiro da
    // lista — trocar o campo ao abrir é pior que não ter.
    setUnit(STOCK_UNITS.includes((med.stock?.unit ?? '').toLowerCase() as (typeof STOCK_UNITS)[number])
      ? (med.stock!.unit!.toLowerCase())
      : med.stock?.unit || STOCK_UNITS[0]);
  }

  function cancelEdit() {
    setEditing(null);
    setQty('');
    setMinAlertQty('5');
    setEditingUnit(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ProfileContextBar />
      {/* 9.7 — mesmo padrão: erro de rede não vira "sem estoque". */}
      {isError ? (
        <LoadErrorState onRetry={() => refetch()} message={t('stock.loadErrorText')} />
      ) : isLoading ? (
        <SkeletonList lines={2} />
      ) : (
        <FlatList
          data={activeMedications}
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.gridRow : undefined}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          ListEmptyComponent={<Text style={styles.empty}>{t('stock.empty')}</Text>}
          renderItem={({ item }) => {
            const stock = item.stock;
            const daysRemaining = item.days_remaining;
            const isLow = isMedicationLowStock(item, LOW_STOCK_DAYS_THRESHOLD);
            const isPrn = !!item.is_prn;
            const currentQty = stock?.current_quantity ?? 0;
            const maskedName = maskMedicationName(item.name, isPrivate);
            // Achado real de uso (2026-09-05): remédio cadastrado sem
            // preencher "estoque inicial" (opcional) mostra "0 unid" liso
            // — igual a um remédio que genuinamente acabou, sem indicar
            // que ninguém informou nada ainda. `last_updated_at` só é
            // preenchido no primeiro `PUT /stock` de verdade (ver
            // `StockController::update`); nulo com quantidade zero é o
            // sinal confiável de "nunca foi tocado", distinto de "acabou".
            const neverSet = isStockNeverSet(stock);
            const isLegacyUnit = !neverSet && isLegacyDosageStockUnit(stock?.unit);

            const alertText = isPrn
              ? (currentQty <= 0
                  ? t('stock.stockOut')
                  : t('stock.fewUnits', { count: currentQty, unit: stock?.unit || t('stock.defaultUnit') }))
              : (daysRemaining !== null && daysRemaining <= 0
                  ? t('stock.stockOut')
                  : t('stock.endsIn', { count: daysRemaining ?? 0 }));

            return (
              <View style={[styles.card, isLow && styles.cardAlert, isWide && { flex: 1 }]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.info}>
                  <Text style={styles.name}>{maskedName}</Text>
                  {isLow && (
                    <View style={styles.alertRow}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.warning} />
                      <Text style={styles.alertText}>{alertText}</Text>
                    </View>
                  )}
                  {editing === item.id ? (
                    <View style={styles.editForm}>
                      <View style={styles.editRow}>
                        <TextInput
                          style={[styles.input, { color: colors.text }]}
                          value={qty}
                          onChangeText={setQty}
                          keyboardType="decimal-pad"
                          placeholder={t('stock.quantityPlaceholder')}
                          placeholderTextColor={colors.textMuted}
                          accessibilityLabel={t('stock.quantityLabel', { name: maskedName })}
                          autoFocus
                        />
                        <Text style={styles.unit}>{stock?.unit}</Text>
                      </View>
                      {/* Unidade do estoque (decisão do Rilson 2026-09-28).
                          Fica AQUI, na aba Estoque, e não no cadastro do
                          remédio: é aqui que a pessoa tem a caixa na mão
                          e sabe em que coisa está contando. No cadastro a
                          pergunta não faz sentido ainda — e a resposta
                          errada (a unidade da dose) era gravada em
                          `create()` e nunca corrigida.

                          Chips, e não um `<Picker>`: para o público deste
                          app, um seletor nativo abre uma roda que exige
                          scroll para achar "gotas". Chips mostram as 6
                          de uma vez, com toque de 48px. A unidade atual
                          do item vem pré-selecionada — trocar o campo ao
                          abrir o formulário seria pior que não ter. */}
                      <View style={styles.unitBlock}>
                        <Text style={styles.unitBlockLabel}>{t('stock.unitLabel')}</Text>
                        <View style={styles.unitChips} accessibilityRole="radiogroup">
                          {STOCK_UNITS.map((u) => {
                            const selected = unit === u;
                            return (
                              <TouchableOpacity
                                key={u}
                                style={[styles.unitChip, selected && styles.unitChipSelected]}
                                onPress={() => setUnit(u)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                accessibilityLabel={t('stock.unitOption', { unit: u })}
                              >
                                <Text style={[styles.unitChipText, selected && styles.unitChipTextSelected]}>
                                  {u}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={styles.unitBlockHint}>{t('stock.unitHint')}</Text>
                      </View>
                      {/* Limiar de alerta configurável (decisão do Rilson 2026-11-01) */}
                      <View style={styles.minAlertBlock}>
                        <Text style={styles.minAlertBlockLabel}>{t('stock.minAlertQuantityLabel')}</Text>
                        <View style={styles.minAlertRow}>
                          <TextInput
                            style={[styles.minAlertInput, { color: colors.text }]}
                            value={minAlertQty}
                            onChangeText={setMinAlertQty}
                            keyboardType="decimal-pad"
                            placeholder="5"
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel={t('stock.minAlertQuantityHint')}
                          />
                          <Text style={styles.minAlertUnit}>{unit}</Text>
                        </View>
                        <Text style={styles.minAlertBlockHint}>{t('stock.minAlertQuantityHint')}</Text>
                      </View>
                      {/* Achado real de uso (2026-09-02): "editar só reescreve —
                          falta adicionar e definir". Dois botões claros, sem
                          menu escondido; o que o usuário digitou acima
                          significa a mesma coisa nos dois, quem muda é a
                          operação. */}
                      <View style={styles.editActions}>
                        <View style={styles.actionHints}>
                          <Text style={styles.actionHint}>{t('stock.addHint')}</Text>
                          <Text style={styles.actionHint}>{t('stock.setHint')}</Text>
                        </View>
                        <View style={styles.editPrimaryRow}>
                          <TouchableOpacity
                            onPress={() => addQty(item)}
                            style={styles.addBtn}
                            disabled={mutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('stock.addLabel', { name: maskedName })}. ${t('stock.addHint')}`}
                            accessibilityState={{ busy: pendingAction === 'add' }}
                          >
                            {pendingAction === 'add'
                              ? <ActivityIndicator color={colors.brand} size="small" />
                              : (
                                <>
                                  <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                                  <Text style={styles.addBtnText}>{t('stock.add')}</Text>
                                </>
                              )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setQtyAbsolute(item)}
                            style={styles.saveBtn}
                            disabled={mutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('stock.setLabel', { name: maskedName })}. ${t('stock.setHint')}`}
                            accessibilityState={{ busy: pendingAction === 'set' }}
                          >
                            {pendingAction === 'set'
                              ? <ActivityIndicator color={colors.onBrand} size="small" />
                              : <Text style={styles.saveBtnText}>{t('stock.set')}</Text>}
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          onPress={cancelEdit}
                          style={styles.cancelBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.cancel')}
                        >
                          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : neverSet ? (
                    <View style={styles.neverSetRow}>
                      <MaterialCommunityIcons name="information-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.neverSetText}>{t('stock.neverSetHint')}</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.qty}>
                        {formatStockQuantity({
                          quantity: currentQty,
                          stockUnit: stock?.unit,
                        })}
                      </Text>
                      {/* Correção em 1 toque de unidade legada herdada da dose */}
                      {isLegacyUnit && (
                        <View style={styles.legacyUnitBanner}>
                          <View style={styles.legacyUnitHeader}>
                            <MaterialCommunityIcons name="lightbulb-outline" size={14} color={colors.brand} />
                            <Text style={styles.legacyUnitText}>
                              {t('stock.dosageUnitWarning', { unit: stock?.unit })}
                            </Text>
                          </View>
                          <View style={styles.legacyUnitChips}>
                            {(['comprimidos', 'gotas', 'cápsulas'] as const).map((tu) => (
                              <TouchableOpacity
                                key={tu}
                                style={styles.legacyUnitChip}
                                onPress={() => {
                                  mutation.mutate({
                                    id: item.id,
                                    quantity: currentQty,
                                    unit: tu,
                                  });
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t('stock.unitOption', { unit: tu })}
                              >
                                <Text style={styles.legacyUnitChipText}>{tu}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
                {editing !== item.id && (
                  <TouchableOpacity
                    testID={`edit-stock-${item.id}`}
                    onPress={() => startEdit(item)}
                    style={styles.editBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('stock.editLabel', { name: maskedName })}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textMuted} />
                    <Text style={styles.editBtnText}>{t('stock.edit')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
      {alertDialog}
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    list: { padding: spacing.lg, gap: spacing.md },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.xxl },
    gridRow: { gap: spacing.md },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: spacing.huge, fontSize: type.body },
    card: {
      backgroundColor: c.surface, borderRadius: rounded.lg,
      flexDirection: 'row', alignItems: 'flex-start', padding: spacing.lg,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardAlert: { borderWidth: 1.5, borderColor: c.warning },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, marginTop: spacing.xxs, minHeight: 48 },
    editBtnText: { fontSize: type.micro, fontWeight: '600', color: c.textMuted },
    colorDot: { width: 14, height: 14, borderRadius: rounded.sm, marginRight: spacing.md, marginTop: spacing.xxs },
    info: { flex: 1 },
    name: { fontSize: type.body, fontWeight: '600', color: c.text },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxs },
    alertText: { fontSize: type.micro, color: c.warning },
    qty: { fontSize: type.label, color: c.brand, fontWeight: '600', marginTop: spacing.xs },
    neverSetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    neverSetText: { fontSize: type.micro, color: c.textMuted, fontStyle: 'italic' },
    editForm: { marginTop: spacing.xs, gap: spacing.sm },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: rounded.sm,
      paddingHorizontal: spacing.sm, width: 88, fontSize: type.label,
      minHeight: 48,
      textAlign: 'center',
      backgroundColor: c.surface,
    },
    unit: { color: c.textSecondary, fontSize: type.caption },
    unitBlock: { gap: spacing.xs, marginTop: spacing.xs },
    unitBlockLabel: { fontSize: type.micro, color: c.textSecondary, fontWeight: '600' },
    unitBlockHint: { fontSize: type.microTight, color: c.textMuted },
    unitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    unitChip: {
      minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md,
      borderRadius: rounded.full, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface,
    },
    unitChipSelected: { borderColor: c.brand, backgroundColor: c.brandSubtle },
    unitChipText: { fontSize: type.caption, color: c.textSecondary, fontWeight: '600' },
    unitChipTextSelected: { color: c.brand },
    minAlertBlock: { gap: spacing.xs, marginTop: spacing.xs },
    minAlertBlockLabel: { fontSize: type.micro, color: c.textSecondary, fontWeight: '600' },
    minAlertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    minAlertInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: rounded.sm,
      paddingHorizontal: spacing.sm, width: 72, fontSize: type.caption,
      minHeight: 48, textAlign: 'center', backgroundColor: c.surface,
    },
    minAlertUnit: { color: c.textSecondary, fontSize: type.caption },
    minAlertBlockHint: { fontSize: type.microTight, color: c.textMuted },
    legacyUnitBanner: {
      marginTop: spacing.sm, padding: spacing.sm,
      backgroundColor: c.brandSubtle, borderRadius: rounded.sm,
      borderWidth: 1, borderColor: c.border, gap: spacing.xs,
    },
    legacyUnitHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legacyUnitText: { fontSize: type.micro, color: c.textSecondary, fontWeight: '600', flex: 1 },
    legacyUnitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
    legacyUnitChip: {
      minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md,
      borderRadius: rounded.full, borderWidth: 1, borderColor: c.brand,
      backgroundColor: c.surface,
    },
    legacyUnitChipText: { fontSize: type.caption, color: c.brand, fontWeight: '600' },
    editActions: { gap: spacing.sm },
    actionHints: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    actionHint: { fontSize: type.microTight, color: c.textMuted, flex: 1 },
    editPrimaryRow: { flexDirection: 'row', gap: spacing.sm },
    cancelBtn: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, minHeight: 48, justifyContent: 'center' },
    cancelBtnText: { color: c.textMuted, fontWeight: '600', fontSize: type.micro },
    addBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
      borderWidth: 1.5, borderColor: c.brand, borderRadius: rounded.sm,
      paddingVertical: spacing.xs, minHeight: 48,
    },
    addBtnText: { color: c.brand, fontWeight: '600', fontSize: type.micro },
    saveBtn: {
      flex: 1, backgroundColor: c.brand, borderRadius: rounded.sm, paddingVertical: spacing.xs,
      minHeight: 48, alignItems: 'center', justifyContent: 'center',
    },
    saveBtnText: { color: c.onBrand, fontWeight: '600', fontSize: type.micro },
  });
}
