import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useProfileStore } from '../../store/profileStore';
import { getTodayDoses, logDose, undoDose, DoseLog } from '../../services/doses';
import { LOW_STOCK_DAYS_THRESHOLD } from '../../services/medications';
import { api } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

export default function HomeScreen() {
  const { activeProfile, profiles, setProfiles, setActiveProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  useEffect(() => {
    api.get('/profiles').then(({ data }) => setProfiles(data));
  }, []);

  const { data: doses = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['today-doses', activeProfile?.id],
    queryFn: () => getTodayDoses(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const markDose = useMutation({
    mutationFn: (dose: DoseLog) =>
      logDose({
        dose_schedule_id: dose.dose_schedule_id,
        medication_id: dose.medication_id,
        profile_id: dose.profile_id,
        scheduled_at: dose.scheduled_at,
        taken_at: new Date().toISOString(),
        status: 'taken',
      }),
    onSuccess: () => {
      // Haptic feedback (Fase 1) — só no sucesso, não no toque em si:
      // vibrar antes de confirmar que salvou daria falso positivo se a
      // chamada falhar.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
    },
  });

  const skipDose = useMutation({
    mutationFn: (dose: DoseLog) =>
      logDose({
        dose_schedule_id: dose.dose_schedule_id,
        medication_id: dose.medication_id,
        profile_id: dose.profile_id,
        scheduled_at: dose.scheduled_at,
        status: 'skipped',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today-doses'] }),
  });

  // Corrigir dose (Fase 1) — desmarcar "Tomei"/"Pulei" feito por engano.
  const undoMutation = useMutation({
    mutationFn: (dose: DoseLog) => undoDose(dose.id as number),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today-doses'] }),
  });

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const takenCount = doses.filter((d) => d.status === 'taken').length;

  // Refill alert inteligente (Fase 1) — nomes únicos com estoque baixo
  // entre os medicamentos que têm dose hoje, pra um banner compacto.
  const lowStockNames = Array.from(
    new Set(
      doses
        .filter((d) => {
          const days = d.medication.days_remaining;
          return days !== null && days <= LOW_STOCK_DAYS_THRESHOLD;
        })
        .map((d) => d.medication.name),
    ),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.date}>{today}</Text>
          <Text style={styles.title}>Doses de hoje</Text>
          {doses.length > 0 && (
            <Text style={styles.progress}>{takenCount} de {doses.length} tomadas</Text>
          )}
        </View>
        {profiles.length > 0 && (
          <FlatList
            data={profiles}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.profileChip, activeProfile?.id === item.id && styles.profileChipActive]}
                onPress={() => setActiveProfile(item)}
              >
                <MaterialCommunityIcons
                  name={(item.avatar_emoji as any) ?? 'account'}
                  size={15}
                  color={activeProfile?.id === item.id ? colors.brand : 'rgba(255,255,255,0.9)'}
                />
                <Text style={[styles.profileChipText, activeProfile?.id === item.id && styles.profileChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
            style={styles.profileList}
          />
        )}
      </View>

      {lowStockNames.length > 0 && (
        <View style={styles.stockBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.stockBannerText} numberOfLines={2}>
            Estoque acabando: {lowStockNames.join(', ')}
          </Text>
        </View>
      )}

      {!isLoading && profiles.length === 0 && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="account-plus-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhum perfil criado</Text>
          <Text style={styles.emptyText}>Crie um perfil de paciente para começar.</Text>
          <Link href="/(tabs)/profile" asChild>
            <TouchableOpacity style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Criar perfil</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}

      {!isLoading && activeProfile && doses.length === 0 && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="pill-off" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhuma dose hoje</Text>
          <Text style={styles.emptyText}>Adicione um medicamento com horário para vê-lo aqui.</Text>
          <Link href="/(tabs)/medications" asChild>
            <TouchableOpacity style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Adicionar medicamento</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}

      {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />}

      {doses.length > 0 && (
        <FlatList
          data={doses}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const taken = item.status === 'taken';
            const skipped = item.status === 'skipped';
            const missed = item.status === 'missed';
            const time = format(parseISO(item.scheduled_at), 'HH:mm');
            return (
              <View style={[styles.card, (taken || skipped) && styles.cardDone]}>
                <View style={[styles.colorBar, { backgroundColor: missed ? colors.warning : item.medication.color }]} />
                <View style={styles.timeCol}>
                  <Text style={[styles.time, missed && { color: colors.warning }]}>{time}</Text>
                  {missed && <Text style={styles.missedLabel}>Atrasado</Text>}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.medName}>{item.medication.name}</Text>
                  <Text style={styles.medDosage}>{item.medication.dosage} {item.medication.unit}</Text>
                </View>
                {!taken && !skipped && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.takeButton} onPress={() => markDose.mutate(item)} disabled={markDose.isPending}>
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                      <Text style={styles.takeButtonText}>Tomei</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.skipButton} onPress={() => skipDose.mutate(item)} disabled={skipDose.isPending}>
                      <MaterialCommunityIcons name="close" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                {taken && (
                  <TouchableOpacity
                    style={styles.statusBadge}
                    onPress={() => undoMutation.mutate(item)}
                    disabled={undoMutation.isPending}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                    <Text style={styles.takenText}>Tomado</Text>
                    <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                  </TouchableOpacity>
                )}
                {skipped && (
                  <TouchableOpacity
                    style={styles.statusBadge}
                    onPress={() => undoMutation.mutate(item)}
                    disabled={undoMutation.isPending}
                  >
                    <MaterialCommunityIcons name="minus-circle" size={18} color={colors.textMuted} />
                    <Text style={styles.skippedText}>Pulado</Text>
                    <MaterialCommunityIcons name="undo" size={15} color={colors.textMuted} style={styles.undoIcon} />
                  </TouchableOpacity>
                )}
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
    header: { backgroundColor: c.headerBg, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
    date: { color: c.headerSubtext, fontSize: 13, textTransform: 'capitalize' },
    title: { color: c.headerText, fontSize: 24, fontWeight: '700', marginTop: 2 },
    progress: { color: c.headerSubtext, fontSize: 13, marginTop: 4 },
    profileList: { marginTop: 14 },
    profileChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
    },
    profileChipActive: { backgroundColor: c.surface },
    profileChipText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
    profileChipTextActive: { color: c.brand },
    stockBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, padding: 12,
      backgroundColor: c.brandSubtle, borderRadius: 12,
      borderWidth: 1, borderColor: c.warning,
    },
    stockBannerText: { flex: 1, fontSize: 13, color: c.text, fontWeight: '500' },
    list: { padding: 16, gap: 10 },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10, marginTop: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    card: {
      backgroundColor: c.surface, borderRadius: 16, flexDirection: 'row',
      alignItems: 'center', overflow: 'hidden',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    cardDone: { opacity: 0.6 },
    colorBar: { width: 5, alignSelf: 'stretch' },
    timeCol: { paddingHorizontal: 12, alignItems: 'center' },
    time: { fontSize: 15, fontWeight: '700', color: c.brand },
    missedLabel: { fontSize: 10, fontWeight: '600', color: c.warning, marginTop: 2 },
    cardBody: { flex: 1, paddingVertical: 16 },
    medName: { fontSize: 15, fontWeight: '600', color: c.text },
    medDosage: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12 },
    takeButton: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.brand,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    },
    takeButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    skipButton: { padding: 6, borderRadius: 8, backgroundColor: c.surfaceSecondary },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 14, paddingVertical: 4 },
    undoIcon: { marginLeft: 2, opacity: 0.6 },
    takenText: { color: c.success, fontWeight: '600', fontSize: 13 },
    skippedText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
  });
}
