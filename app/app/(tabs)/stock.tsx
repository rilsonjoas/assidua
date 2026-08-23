import { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,

  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../store/profileStore';
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const { showAlert, alertDialog } = useAlertDialog();

  const { data: medications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      updateStock(id, { current_quantity: quantity }),
    onSuccess: async (_stock, { id }) => {
      // Espera o refetch terminar (não só invalidar) pra pegar o
      // days_remaining recalculado no backend antes de (re)agendar o
      // aviso — evita duplicar a conta de doses/dia aqui no frontend.
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
    },
  });

  function saveQty(med: Medication) {
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity < 0) {
      showAlert(t('stock.invalidValue'));
      return;
    }
    mutation.mutate({ id: med.id, quantity });
  }

  return (
    // Achado real de uso (2026-08-14): editar quantidade de estoque de
    // um item mais abaixo na lista deixava o campo coberto pelo
    // teclado — mesmo bug do formulário de medicamento, aqui sem o
    // tratamento (a linha do item pode estar em qualquer altura da
    // FlatList, diferente de um formulário curto).
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
            // "Baixo" agora é sobre tempo, não só quantidade absoluta —
            // 5 comprimidos é muito diferente entre 1x/dia e 4x/dia.
            const isLow = daysRemaining !== null && daysRemaining <= LOW_STOCK_DAYS_THRESHOLD;
            return (
              <View style={[styles.card, isLow && styles.cardAlert, isWide && { flex: 1 }]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
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
                    <View style={styles.editRow}>
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        value={qty}
                        onChangeText={setQty}
                        keyboardType="decimal-pad"
                        placeholder={t('stock.quantityPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={t('stock.quantityLabel', { name: item.name })}
                      />
                      <Text style={styles.unit}>{stock?.unit}</Text>
                      <TouchableOpacity
                        onPress={() => saveQty(item)}
                        style={styles.saveBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('stock.save')}
                      >
                        <Text style={styles.saveBtnText}>{t('stock.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.qty}>
                      {stock?.current_quantity ?? 0} {stock?.unit ?? t('stock.defaultUnit')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  testID={`edit-stock-${item.id}`}
                  onPress={() => { setEditing(item.id); setQty(String(stock?.current_quantity ?? 0)); }}
                  style={styles.editBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.editLabel', { name: item.name })}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.editBtnText}>{t('stock.edit')}</Text>
                </TouchableOpacity>
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
      flexDirection: 'row', alignItems: 'center', padding: 16,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardAlert: { borderWidth: 1.5, borderColor: c.warning },
    // Achado real (2026-08-14): botão de editar era só ícone de lápis,
    // sem rótulo visível — tinha `accessibilityLabel` pro leitor de
    // tela, mas quem enxerga e não é fluente em ícone de app não sabia
    // o que fazia sem tocar. Cartão tem espaço de sobra pra texto,
    // diferente da linha apertada de perfil.
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    editBtnText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 14 },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: c.text },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    alertText: { fontSize: 13, color: c.warning },
    qty: { fontSize: 15, color: c.brand, fontWeight: '600', marginTop: 4 },
    editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, width: 80, fontSize: 15,
      backgroundColor: c.surface,
    },
    unit: { color: c.textSecondary, fontSize: 14 },
    saveBtn: { backgroundColor: c.brand, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    saveBtnText: { color: c.onBrand, fontWeight: '600', fontSize: 13 },
  });
}
