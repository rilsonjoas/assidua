import { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '../../store/profileStore';
import { getMedications } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

export default function MedicationsScreen() {
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: medications = [], isLoading } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

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
          renderItem={({ item }) => (
            <Link href={`/medication/${item.id}`} asChild>
              <TouchableOpacity
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.dosage} ${item.unit}, ${item.schedules.length} horário${item.schedules.length === 1 ? '' : 's'}`}
              >
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.dosage}>{item.dosage} {item.unit}</Text>
                  <Text style={styles.schedules}>
                    {item.schedules.length} horário(s) · {item.stock?.current_quantity ?? 0} {item.stock?.unit ?? 'unid'} em estoque
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </Link>
          )}
        />
      )}

      <Link href="/medication/new" asChild>
        <TouchableOpacity style={styles.fab} accessibilityRole="button" accessibilityLabel="Adicionar medicamento">
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
    empty: { textAlign: 'center', color: c.textMuted, marginTop: 40, fontSize: 16 },
    card: {
      backgroundColor: c.surface, borderRadius: 16,
      flexDirection: 'row', alignItems: 'center', padding: 16,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 14 },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: c.text },
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
