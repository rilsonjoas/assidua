import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useProfileStore } from '../../store/profileStore';
import {
  createMedication,
  updateMedication,
  getMedication,
  createSchedule,
  deleteSchedule,
  DoseSchedule,
} from '../../services/medications';
import {
  scheduleScheduleNotifications,
  cancelScheduleNotifications,
} from '../../services/notifications';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAYS_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function formatDays(days: number[] | null): string {
  if (!days || days.length === 7) return 'Todos os dias';
  if (days.length === 0) return 'Nenhum dia';
  return days.map((d) => DAYS_FULL[d]).join(', ');
}

export default function MedicationFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Campos do medicamento
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [unit, setUnit] = useState('mg');
  const [color, setColor] = useState('#6366f1');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Horários existentes
  const [schedules, setSchedules] = useState<DoseSchedule[]>([]);

  // Formulário de novo horário
  const [addingSchedule, setAddingSchedule] = useState(isNew);
  const [newTime, setNewTime] = useState('08:00');
  const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getMedication(Number(id)).then((med) => {
        setName(med.name);
        setDosage(med.dosage);
        setUnit(med.unit);
        setColor(med.color);
        setInstructions(med.instructions ?? '');
        setSchedules(med.schedules ?? []);
        setLoading(false);
      });
    }
  }, [id]);

  async function saveMedication() {
    if (!name.trim() || !dosage.trim()) {
      Alert.alert('Preencha o nome e a dosagem.');
      return;
    }
    if (!activeProfile) {
      Alert.alert('Selecione um perfil', 'Vá em Perfis e selecione o perfil ativo antes de adicionar um medicamento.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const med = await createMedication(activeProfile.id, { name, dosage, unit, color, instructions });
        if (newTime && newDays.length > 0) {
          const schedule = await createSchedule(med.id, {
            time: newTime,
            days_of_week: newDays.length === 7 ? null : newDays,
          });
          await scheduleScheduleNotifications({
            scheduleId: schedule.id,
            time: newTime,
            days_of_week: newDays.length === 7 ? null : newDays,
            medicationName: name,
            dosage,
            unit,
          });
        }
      } else {
        await updateMedication(Number(id), { name, dosage, unit, color, instructions });
      }
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      router.back();
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function addSchedule() {
    if (!newTime.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('Formato inválido', 'Use o formato HH:MM, ex: 08:00');
      return;
    }
    if (newDays.length === 0) {
      Alert.alert('Selecione ao menos um dia.');
      return;
    }
    setSavingSchedule(true);
    try {
      const schedule = await createSchedule(Number(id), {
        time: newTime,
        days_of_week: newDays.length === 7 ? null : newDays,
      });
      await scheduleScheduleNotifications({
        scheduleId: schedule.id,
        time: newTime,
        days_of_week: newDays.length === 7 ? null : newDays,
        medicationName: name,
        dosage,
        unit,
      });
      setSchedules((prev) => [...prev, schedule]);
      setAddingSchedule(false);
      setNewTime('08:00');
      setNewDays(ALL_DAYS);
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.message ?? 'Erro ao adicionar horário.');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule(schedule: DoseSchedule) {
    Alert.alert(
      'Remover horário',
      `Remover o horário das ${schedule.time}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await deleteSchedule(schedule.id);
            await cancelScheduleNotifications(schedule.id);
            setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
            queryClient.invalidateQueries({ queryKey: ['today-doses'] });
          },
        },
      ],
    );
  }

  function toggleDay(day: number) {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} color={colors.brand} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

      {/* — Dados do medicamento — */}
      <Text style={styles.sectionTitle}>Dados do medicamento</Text>

      <Text style={styles.label}>Nome *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ex: Losartana"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Nome do medicamento"
      />

      <Text style={styles.label}>Dosagem *</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={dosage}
          onChangeText={setDosage}
          placeholder="50"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel="Dosagem"
        />
        <TextInput
          style={[styles.input, styles.unitInput]}
          value={unit}
          onChangeText={setUnit}
          placeholder="mg"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Unidade da dosagem"
        />
      </View>

      <Text style={styles.label}>Cor</Text>
      <View style={styles.colorRow}>
        {COLORS.map((c, i) => (
          <TouchableOpacity
            key={c}
            style={[styles.colorBtn, { backgroundColor: c }, color === c && styles.colorBtnActive]}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityLabel={`Cor ${i + 1}`}
            accessibilityState={{ selected: color === c }}
          />
        ))}
      </View>

      <Text style={styles.label}>Instruções de uso</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Ex: Tomar com água, em jejum..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        accessibilityLabel="Instruções de uso"
      />

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={saveMedication}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={isNew ? 'Criar medicamento' : 'Salvar alterações'}
        accessibilityState={{ busy: saving }}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>{isNew ? 'Criar medicamento' : 'Salvar alterações'}</Text>
        }
      </TouchableOpacity>

      {/* — Horários — */}
      {!isNew && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Horários</Text>
            {!addingSchedule && (
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={() => setAddingSchedule(true)}
                accessibilityRole="button"
                accessibilityLabel="Adicionar horário"
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                <Text style={styles.addScheduleBtnText}>Adicionar</Text>
              </TouchableOpacity>
            )}
          </View>

          {schedules.length === 0 && !addingSchedule && (
            <View style={styles.emptySchedules}>
              <MaterialCommunityIcons name="clock-alert-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptySchedulesText}>Nenhum horário cadastrado.</Text>
            </View>
          )}

          {schedules.map((s) => (
            <View key={s.id} style={styles.scheduleCard}>
              <MaterialCommunityIcons name="clock-outline" size={20} color={colors.brand} />
              <View style={styles.scheduleInfo}>
                <Text style={styles.scheduleTime}>{s.time}</Text>
                <Text style={styles.scheduleDays}>{formatDays(s.days_of_week)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeSchedule(s)}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remover horário das ${s.time}, ${formatDays(s.days_of_week)}`}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {addingSchedule && (
            <View style={styles.addScheduleBox}>
              <Text style={styles.addScheduleTitle}>Novo horário</Text>

              <Text style={styles.label}>Hora (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={newTime}
                onChangeText={setNewTime}
                placeholder="08:00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Hora do horário, formato HH:MM"
              />

              <Text style={styles.label}>Dias da semana</Text>
              <View style={styles.daysRow}>
                {DAYS.map((label, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayBtn, newDays.includes(i) && styles.dayBtnActive]}
                    onPress={() => toggleDay(i)}
                    accessibilityRole="button"
                    accessibilityLabel={DAYS_FULL[i]}
                    accessibilityState={{ selected: newDays.includes(i) }}
                  >
                    <Text style={[styles.dayBtnText, newDays.includes(i) && styles.dayBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.addScheduleActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setAddingSchedule(false); setNewDays(ALL_DAYS); setNewTime('08:00'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar"
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={addSchedule}
                  disabled={savingSchedule}
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar horário"
                  accessibilityState={{ busy: savingSchedule }}
                >
                  {savingSchedule
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.confirmBtnText}>Adicionar</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* Horário inicial ao criar */}
      {isNew && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Primeiro horário</Text>
          </View>

          <Text style={styles.label}>Hora (HH:MM)</Text>
          <TextInput
            style={styles.input}
            value={newTime}
            onChangeText={setNewTime}
            placeholder="08:00"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Hora do horário, formato HH:MM"
          />

          <Text style={styles.label}>Dias da semana</Text>
          <View style={styles.daysRow}>
            {DAYS.map((label, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.dayBtn, newDays.includes(i) && styles.dayBtnActive]}
                onPress={() => toggleDay(i)}
                accessibilityRole="button"
                accessibilityLabel={DAYS_FULL[i]}
                accessibilityState={{ selected: newDays.includes(i) }}
              >
                <Text style={[styles.dayBtnText, newDays.includes(i) && styles.dayBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 20, paddingBottom: 48 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 14 },
    input: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 14, fontSize: 16, color: c.text,
    },
    unitInput: { width: 80, marginLeft: 8 },
    row: { flexDirection: 'row', alignItems: 'center' },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    colorBtn: { width: 32, height: 32, borderRadius: 16 },
    colorBtnActive: { borderWidth: 3, borderColor: c.text, transform: [{ scale: 1.15 }] },
    textarea: { height: 90, textAlignVertical: 'top' },
    saveBtn: {
      backgroundColor: c.brand, borderRadius: 14, padding: 16,
      alignItems: 'center', marginTop: 24,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    addScheduleBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.brandSubtle, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    },
    addScheduleBtnText: { color: c.brand, fontWeight: '600', fontSize: 13 },
    emptySchedules: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptySchedulesText: { color: c.textMuted, fontSize: 14 },
    scheduleCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: c.border,
    },
    scheduleInfo: { flex: 1 },
    scheduleTime: { fontSize: 17, fontWeight: '700', color: c.text },
    scheduleDays: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    deleteBtn: { padding: 4 },
    addScheduleBox: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border, marginTop: 4,
    },
    addScheduleTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    daysRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    dayBtn: {
      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    dayBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    dayBtnText: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    dayBtnTextActive: { color: '#fff' },
    addScheduleActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
      flex: 1, padding: 12, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, alignItems: 'center',
    },
    cancelBtnText: { color: c.textSecondary, fontWeight: '600' },
    confirmBtn: { flex: 1, backgroundColor: c.brand, padding: 12, borderRadius: 10, alignItems: 'center' },
    confirmBtnText: { color: '#fff', fontWeight: '600' },
  });
}
