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
import { parseStockQuantity, isStockNeverSet, formatStockQuantity } from '../../lib/stockQuantity';
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
const STOCK_UNITS = ['comprimidos', 'cápsulas', 'ml', 'gotas', 'frascos', 'ampolas'] as const;

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

  const mutation = useMutation({
    mutationFn: ({ id, quantity, unit: u }: { id: number; quantity: number; unit?: string }) =>
      updateStock(id, u ? { current_quantity: quantity, unit: u } : { current_quantity: quantity }),
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

  function setQtyAbsolute(med: Medication) {
    const quantity = parseTypedQty();
    if (quantity === null) return;
    setPendingAction('set');
    mutation.mutate({ id: med.id, quantity, unit: unitToSend(med) });
  }

  function addQty(med: Medication) {
    const typed = parseTypedQty();
    if (typed === null) return;
    const current = med.stock?.current_quantity ?? 0;
    setPendingAction('add');
    mutation.mutate({ id: med.id, quantity: current + typed, unit: unitToSend(med) });
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
    // Abre no valor que o item já tem, e não sempre no primeiro da
    // lista — trocar o campo ao abrir é pior que não ter.
    setUnit(STOCK_UNITS.includes((med.stock?.unit ?? '').toLowerCase() as (typeof STOCK_UNITS)[number])
      ? (med.stock!.unit!.toLowerCase())
      : med.stock?.unit || STOCK_UNITS[0]);
  }

  function cancelEdit() {
    setEditing(null);
    setQty('');
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
          data={medications}
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.gridRow : undefined}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, isWide && styles.listWide]}
          ListEmptyComponent={<Text style={styles.empty}>{t('stock.empty')}</Text>}
          renderItem={({ item }) => {
            const stock = item.stock;
            const daysRemaining = item.days_remaining;
            const isLow = daysRemaining !== null && daysRemaining <= LOW_STOCK_DAYS_THRESHOLD;
            const maskedName = maskMedicationName(item.name, isPrivate);
            // Achado real de uso (2026-09-05): remédio cadastrado sem
            // preencher "estoque inicial" (opcional) mostra "0 unid" liso
            // — igual a um remédio que genuinamente acabou, sem indicar
            // que ninguém informou nada ainda. `last_updated_at` só é
            // preenchido no primeiro `PUT /stock` de verdade (ver
            // `StockController::update`); nulo com quantidade zero é o
            // sinal confiável de "nunca foi tocado", distinto de "acabou".
            const neverSet = isStockNeverSet(stock);
            return (
              <View style={[styles.card, isLow && styles.cardAlert, isWide && { flex: 1 }]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.info}>
                  <Text style={styles.name}>{maskedName}</Text>
                  {isLow && (
                    <View style={styles.alertRow}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.warning} />
                      <Text style={styles.alertText}>
                        {daysRemaining! <= 0
                          ? t('stock.stockOut')
                          : t('stock.endsIn', { count: daysRemaining })}
                      </Text>
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
                      {/* Achado real de uso (2026-09-02): "editar só reescreve —
                          falta adicionar e definir". Dois botões claros, sem
                          menu escondido; o que o usuário digitou acima
                          significa a mesma coisa nos dois, quem muda é a
                          operação. */}
                      {/* Reorganizado (2026-09-08, achado real do Rilson com
                          screenshot): os 3 botões numa fileira só ficavam
                          espremidos com pesos visuais diferentes (texto
                          solto, contornado, preenchido) competindo por
                          atenção. Agora "Adicionar"/"Definir" — as duas
                          ações que de fato mudam o estoque — dividem uma
                          fileira com o mesmo peso visual, e "Cancelar"
                          (sair sem salvar) fica sozinho embaixo, discreto. */}
                      <View style={styles.editActions}>
                        {/* "Adicionar" e "Definir" têm o mesmo peso visual
                            por decisão deliberada (ver comentário em
                            `editPrimaryRow`) — e OPSPOSTOS: um SOMA ao
                            total, o outro SUBSTITUI. Decisão de produto
                            2026-09-28: manter o peso igual e explicar a
                            diferença NA TELA, em vez de hierarquizar.
                            Raciocínio: a hierarquia esconderia "Definir",
                            que é justamente o botão perigoso; e quem
                            entende "Definir 30" como "tenho 30" e toca
                            errado apaga o estoque real, sem desfazer. A
                            diferença precisa estar escrita, não só na
                            cor. */}
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
                    <Text style={styles.qty}>
                      {/* A unidade do estoque é campo próprio, escolhido
                          nos chips acima (2026-09-28) — antes vinha da
                          dose e produzia "30 mg" para 30 comprimidos. */}
                      {formatStockQuantity({
                        quantity: stock?.current_quantity ?? 0,
                        stockUnit: stock?.unit,
                      })}
                    </Text>
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
      // "Card cresce ao editar e a bolinha de cor fica flutuando no meio"
      // (2026-09-08, achado real do Rilson com screenshot): era
      // `alignItems: 'center'`, então ao abrir o formulário de edição a
      // bolinha se centralizava na altura toda do card (que cresce),
      // ficando longe do nome — flex-start prende ela no topo, junto do
      // nome, não importa quanto o card cresça.
      flexDirection: 'row', alignItems: 'flex-start', padding: spacing.lg,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardAlert: { borderWidth: 1.5, borderColor: c.warning },
    // Achado real (2026-08-14): botão de editar era só ícone de lápis,
    // sem rótulo visível — tinha `accessibilityLabel` pro leitor de
    // tela, mas quem enxerga e não é fluente em ícone de app não sabia
    // o que fazia sem tocar. Cartão tem espaço de sobra pra texto,
    // diferente da linha apertada de perfil.
    // marginTop nos dois: alinha opticamente com a primeira linha do nome
    // agora que o card usa `alignItems: 'flex-start'` (ver nota em `card`).
    // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08) —
    // ícone+texto, não ícone sozinho; o card tem espaço de sobra, então
    // crescer aqui não aperta nada ao redor.
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
    // O campo de quantidade ficou ~28px de altura até 2026-09-28: o
    // `paddingVertical` era de 4px, e com bordas e fonte de 15px dava
    // isso. É o ÚNICO `TextInput` da tela — o passo que muda o dado
    // real, com `autoFocus` e teclado numérico. O `TextInput`
    // equivalente do Histórico (`noteEditInput`, `history.tsx`) já tinha
    // `minHeight: 44` desde 2026-09-05; aqui faltava, e os dois editores
    // inline quase idênticos tinham alvos diferentes.
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: rounded.sm,
      paddingHorizontal: spacing.sm, width: 88, fontSize: type.label,
      minHeight: 48, // alvo mínimo, não escolha estética
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
    // Reorganizado (2026-09-08, achado real com screenshot): antes os 3
    // botões viviam numa fileira só, com pesos visuais bem diferentes
    // brigando por atenção (texto solto "Cancelar", contornado
    // "Adicionar", preenchido "Definir") — ficava bagunçado, especialmente
    // com o card já maior por causa do formulário. Agora "Adicionar" e
    // "Definir" — as ações que de fato mudam o estoque — dividem uma
    // fileira com o mesmo peso (mesma largura, `flex: 1` nos dois), e
    // "Cancelar" fica sozinho embaixo, discreto, claramente secundário.
    editActions: { gap: spacing.sm },
    // As duas ações são opostas (soma x substitui) e têm o mesmo peso
    // visual. A diferença é dita em texto, logo acima dos botões.
    actionHints: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    actionHint: { fontSize: type.microTight, color: c.textMuted, flex: 1 },
    editPrimaryRow: { flexDirection: 'row', gap: spacing.sm },
    // minHeight 48 nos três (WCAG AAA, achado revisando toque mínimo
    // 2026-09-05) — sem isso ficavam ~30-32px de altura real, abaixo do
    // alvo mínimo pro público idoso/baixa destreza motora do app.
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
