import { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useProfileStore } from '../../store/profileStore';
import { getMedications, updateStock, Medication } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

export default function StockScreen() {
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [qty, setQty] = useState('');

  const { data: medications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      updateStock(id, { current_quantity: quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      setEditing(null);
    },
  });

  function saveQty(med: Medication) {
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity < 0) {
      Alert.alert('Valor inválido');
      return;
    }
    mutation.mutate({ id: med.id, quantity });
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={medications}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum medicamento cadastrado.</Text>}
          renderItem={({ item }) => {
            const stock = item.stock;
            const isLow = stock && stock.current_quantity <= stock.min_alert_quantity;
            return (
              <View style={[styles.card, isLow && styles.cardAlert]}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  {isLow && (
                    <View style={styles.alertRow}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.warning} />
                      <Text style={styles.alertText}>Estoque baixo</Text>
                    </View>
                  )}
                  {editing === item.id ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        value={qty}
                        onChangeText={setQty}
                        keyboardType="decimal-pad"
                        placeholder="Qtd"
                        placeholderTextColor={colors.textMuted}
                      />
                      <Text style={styles.unit}>{stock?.unit}</Text>
                      <TouchableOpacity onPress={() => saveQty(item)} style={styles.saveBtn}>
                        <Text style={styles.saveBtnText}>Salvar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.qty}>
                      {stock?.current_quantity ?? 0} {stock?.unit ?? 'unid'}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => { setEditing(item.id); setQty(String(stock?.current_quantity ?? 0)); }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    list: { padding: 16, gap: 12 },
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, fontSize: 16 },
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      flexDirection: 'row', alignItems: 'center', padding: 16,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardAlert: { borderWidth: 1.5, borderColor: c.warning },
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
    saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  });
}
