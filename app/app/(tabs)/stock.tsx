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
import { parseStockQuantity, isStockNeverSet } from '../../lib/stockQuantity';
import { getMedications, updateStock, Medication, LOW_STOCK_DAYS_THRESHOLD } from '../../services/medications';
import { scheduleRefillAlert } from '../../services/notifications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { AppText as Text } from '../../components/AppText';
import { SkeletonList } from '../../components/Skeleton';
import { useAlertDialog } from '../../hooks/useAlertDialog';

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
  // Qual dos dois botões está em voo — permite mostrar o spinner só
  // nele, não nos dois ao mesmo tempo (a mutação é uma só pras duas ações).
  const [pendingAction, setPendingAction] = useState<'add' | 'set' | null>(null);
  const { showAlert, alertDialog } = useAlertDialog();
  // Achado real de uso (2026-09-02): "salvar sem feedback visual" —
  // mesmo padrão do toast global usado no cadastro de remédio.
  const showToast = useToastStore((s) => s.showToast);

  const { data: medications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      updateStock(id, { current_quantity: quantity }),
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
    mutation.mutate({ id: med.id, quantity });
  }

  function addQty(med: Medication) {
    const typed = parseTypedQty();
    if (typed === null) return;
    const current = med.stock?.current_quantity ?? 0;
    setPendingAction('add');
    mutation.mutate({ id: med.id, quantity: current + typed });
  }

  function cancelEdit() {
    setEditing(null);
    setQty('');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {isLoading ? (
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
                        <View style={styles.editPrimaryRow}>
                          <TouchableOpacity
                            onPress={() => addQty(item)}
                            style={styles.addBtn}
                            disabled={mutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('stock.addLabel', { name: maskedName })}
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
                            accessibilityLabel={t('stock.setLabel', { name: maskedName })}
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
                      {stock?.current_quantity ?? 0} {stock?.unit ?? t('stock.defaultUnit')}
                    </Text>
                  )}
                </View>
                {editing !== item.id && (
                  <TouchableOpacity
                    testID={`edit-stock-${item.id}`}
                    onPress={() => { setEditing(item.id); setQty(String(stock?.current_quantity ?? 0)); }}
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
    list: { padding: 16, gap: 12 },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 24 },
    gridRow: { gap: 12 },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, fontSize: 16 },
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      // "Card cresce ao editar e a bolinha de cor fica flutuando no meio"
      // (2026-09-08, achado real do Rilson com screenshot): era
      // `alignItems: 'center'`, então ao abrir o formulário de edição a
      // bolinha se centralizava na altura toda do card (que cresce),
      // ficando longe do nome — flex-start prende ela no topo, junto do
      // nome, não importa quanto o card cresça.
      flexDirection: 'row', alignItems: 'flex-start', padding: 16,
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
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, marginTop: 2, minHeight: 48 },
    editBtnText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 14, marginTop: 3 },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: c.text },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    alertText: { fontSize: 13, color: c.warning },
    qty: { fontSize: 15, color: c.brand, fontWeight: '600', marginTop: 4 },
    neverSetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    neverSetText: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
    editForm: { marginTop: 4, gap: 8 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, width: 80, fontSize: 15,
      backgroundColor: c.surface,
    },
    unit: { color: c.textSecondary, fontSize: 14 },
    // Reorganizado (2026-09-08, achado real com screenshot): antes os 3
    // botões viviam numa fileira só, com pesos visuais bem diferentes
    // brigando por atenção (texto solto "Cancelar", contornado
    // "Adicionar", preenchido "Definir") — ficava bagunçado, especialmente
    // com o card já maior por causa do formulário. Agora "Adicionar" e
    // "Definir" — as ações que de fato mudam o estoque — dividem uma
    // fileira com o mesmo peso (mesma largura, `flex: 1` nos dois), e
    // "Cancelar" fica sozinho embaixo, discreto, claramente secundário.
    editActions: { gap: 8 },
    editPrimaryRow: { flexDirection: 'row', gap: 8 },
    // minHeight 48 nos três (WCAG AAA, achado revisando toque mínimo
    // 2026-09-05) — sem isso ficavam ~30-32px de altura real, abaixo do
    // alvo mínimo pro público idoso/baixa destreza motora do app.
    cancelBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, minHeight: 48, justifyContent: 'center' },
    cancelBtnText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
    addBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      borderWidth: 1.5, borderColor: c.brand, borderRadius: 8,
      paddingVertical: 5, minHeight: 48,
    },
    addBtnText: { color: c.brand, fontWeight: '600', fontSize: 13 },
    saveBtn: {
      flex: 1, backgroundColor: c.brand, borderRadius: 8, paddingVertical: 6,
      minHeight: 48, alignItems: 'center', justifyContent: 'center',
    },
    saveBtnText: { color: c.onBrand, fontWeight: '600', fontSize: 13 },
  });
}
