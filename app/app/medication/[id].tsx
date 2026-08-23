import { useState, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useProfileStore } from '../../store/profileStore';
import {
  createMedication,
  updateMedication,
  getMedication,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  uploadMedicationPhoto,
  deleteMedicationPhoto,
  updateStock,
  DoseSchedule,
} from '../../services/medications';
import {
  scheduleScheduleNotifications,
  cancelScheduleNotifications,
} from '../../services/notifications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AppText as Text } from '../../components/AppText';
import { useAlertDialog } from '../../hooks/useAlertDialog';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// "Quantas vezes por dia?" (2026-08-21, feedback do Rilson): responder
// a pergunta que interesse direto com um toque, sem pensar em relógio.
// Os horários gerados são os defaults clínicos mais comuns e cada um
// continua editável/removível individualmente depois do atalho.
const FREQUENCY_PRESET_TIMES = {
  once: ['08:00'],
  twice: ['08:00', '20:00'],
  thrice: ['08:00', '14:00', '20:00'],
  fourTimes: ['06:00', '12:00', '18:00', '00:00'],
} as const;

// Presets de dia da semana — "dias úteis" e "fim de semana" são muito
// mais comuns na boca do usuário que selecionar círculos um a um.
const DAY_PRESETS: Array<{ key: 'all' | 'weekdays' | 'weekend'; days: number[] }> = [
  { key: 'all', days: ALL_DAYS },
  { key: 'weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'weekend', days: [0, 6] },
];

// Intervalos de dose mais prescritos (antibiótico 6/8h, crônicos 12/24h)
// como toque único — o campo livre fica pra casos fora da curva.
const INTERVAL_HOUR_OPTIONS = [4, 6, 8, 12, 24];

// Rascunho de horário durante a CRIAÇÃO do medicamento — ainda não tem
// id nem existe no backend; vira schedule de verdade quando o remédio é
// salvo (ver saveMedication). Mesma forma do formulário de horário.
type DraftSchedule = {
  time: string;
  mode: 'fixed' | 'interval';
  days: number[];
  intervalHours: string;
};

const DEFAULT_DRAFT: DraftSchedule = { time: '08:00', mode: 'fixed', days: [...ALL_DAYS], intervalHours: '8' };

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && b.every((d) => a.includes(d));
}

function parseIntOrNull(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

// "Frequência de horário" (2026-08-14) — schedule de intervalo mostra
// "A cada 8 horas" na lista em vez da lista de dias, que nem se aplica
// (intervalo ignora days_of_week de propósito, ver GenerateScheduleOccurrences
// no backend).
function formatDays(days: number[] | null, t: TFunction, intervalHours?: number | null): string {
  if (intervalHours != null) {
    return t('medicationForm.intervalSummary', { count: intervalHours });
  }
  if (!days || days.length === 7) return t('medicationForm.allDays');
  if (days.length === 0) return t('medicationForm.noDays');
  return days.map((d) => t(`medicationForm.days.${DAY_KEYS[d]}`)).join(', ');
}

export default function MedicationFormScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfileStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();

  const DAYS = DAY_KEYS.map((k) => t(`medicationForm.daysShort.${k}`));
  const DAYS_FULL = DAY_KEYS.map((k) => t(`medicationForm.days.${k}`));

  // Campos do medicamento
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  // Achado real de uso (2026-08-14): "mg" vinha pré-preenchido mesmo
  // sem nenhuma dosagem digitada — não faz sentido desde que dosagem
  // virou opcional (unidade "mg" solta, sem número, não significa
  // nada). Backend já tem um default sensato (`comprimidos`) pra
  // quando a unidade não é enviada — deixa em branco aqui e só manda
  // se a pessoa preencher (ver `unitToSend` em `saveMedication`).
  const [unit, setUnit] = useState('');
  // "Duração do tratamento" (2026-08-14) — opcional, a maioria dos
  // remédios é uso contínuo. Editável ao criar e ao editar (diferente
  // do estoque inicial).
  const [treatmentDurationDays, setTreatmentDurationDays] = useState('');
  // "Estoque no cadastro" (2026-08-14) — só usado ao criar; opcional,
  // sem preencher fica 0 (comportamento de sempre) e ajusta depois na
  // aba Estoque.
  const [initialStock, setInitialStock] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [instructions, setInstructions] = useState('');
  // Achado real (2026-08-13): campo já existia no backend (validação em
  // MedicationController, coluna no banco) mas nunca tinha chegado no
  // formulário mobile — buraco desde o início, não regressão de hoje.
  const [notes, setNotes] = useState('');
  // "Foto do medicamento" (2026-08-13) — valor real pro público
  // idoso/cuidador: reconhecer visualmente costuma valer mais que ler o
  // nome. Só disponível depois de criado (precisa de id pra anexar).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Horários existentes
  const [schedules, setSchedules] = useState<DoseSchedule[]>([]);

  // Rascunhos de horário na criação (2026-08-21) — antes dava pra
  // cadastrar UM horário e o resto só depois de criar e reabrir o
  // remédio, que é exatamente a reclamação "quantas vezes tomar não
  // está configurável". Agora a lista aceita quantos quiser já no
  // cadastro. Começa com um padrão (08:00, todos os dias) igual ao
  // comportamento antigo de sempre criar um.
  const [draftSchedules, setDraftSchedules] = useState<DraftSchedule[]>([{ ...DEFAULT_DRAFT, days: [...ALL_DAYS] }]);
  // Editor de rascunho: addingDraft = criando novo; editingDraftIndex =
  // editando esse índice da lista; ambos null/false = fechado.
  const [addingDraft, setAddingDraft] = useState(false);
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);

  // Formulário de horário — mesmo form serve pra criar e pra editar;
  // editingScheduleId null = criando, preenchido = editando esse horário.
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [newTime, setNewTime] = useState('08:00');
  const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
  // "Frequência de horário" (2026-08-14) — decisão de produto confirmada
  // com o Rilson: vale o esforço de um intervalo de verdade em vez de só
  // sugerir cadastrar N horários manualmente pra simular "de X em X
  // horas". `interval_hours` setado ignora `days_of_week` no backend
  // (ver GenerateScheduleOccurrences) — remédio de intervalo é
  // tipicamente de curso contínuo, não "só às terças".
  const [scheduleMode, setScheduleMode] = useState<'fixed' | 'interval'>('fixed');
  const [newIntervalHours, setNewIntervalHours] = useState('8');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Confirmação de remover horário (2026-08-13) — Alert.alert nativo
  // destoava do resto do app (achado real testando no dispositivo).
  const [scheduleToRemove, setScheduleToRemove] = useState<DoseSchedule | null>(null);
  const [removingSchedule, setRemovingSchedule] = useState(false);
  const { showAlert, alertDialog } = useAlertDialog();

  useEffect(() => {
    if (!isNew) {
      getMedication(Number(id)).then((med) => {
        setName(med.name);
        // Estado do campo continua string (TextInput controlado não
        // aceita null) — `null` vira '' aqui, e volta a virar `null`
        // no envio (ver `saveMedication`), não string vazia salva à toa.
        setDosage(med.dosage ?? '');
        setUnit(med.unit);
        setTreatmentDurationDays(med.treatment_duration_days != null ? String(med.treatment_duration_days) : '');
        setColor(med.color);
        setInstructions(med.instructions ?? '');
        setNotes(med.notes ?? '');
        setPhotoUrl(med.photo_url);
        setIsPaused(med.is_paused ?? false);
        setSchedules(med.schedules ?? []);
        setLoading(false);
      });
    }
  }, [id]);

  async function saveMedication() {
    // Achado real de uso (2026-08-14): dosagem deixou de ser
    // obrigatória — nem todo remédio tem uma numérica relevante.
    if (!name.trim()) {
      showAlert(t('medicationForm.errorFillRequired'));
      return;
    }
    if (!activeProfile) {
      showAlert(t('medicationForm.errorNoProfileTitle'), t('medicationForm.errorNoProfileText'));
      return;
    }
    // "Duração do tratamento" (2026-08-14) — opcional; se preenchido,
    // precisa ser um número positivo de verdade, senão o backend rejeita
    // com um erro genérico difícil de entender pra quem só digitou algo
    // estranho sem querer.
    let treatmentDurationToSend: number | null = null;
    if (treatmentDurationDays.trim()) {
      const parsed = parseInt(treatmentDurationDays, 10);
      if (isNaN(parsed) || parsed < 1) {
        showAlert(t('medicationForm.errorInvalidTreatmentDuration'));
        return;
      }
      treatmentDurationToSend = parsed;
    }
    // "Quantas vezes por dia" (2026-08-21) — todo remédio aqui nasce
    // com ao menos um horário; quem não quer lembrete nenhum remove os
    // rascunhos e recebe um aviso claro em vez de um remédio invisível
    // no dashboard.
    if (isNew && draftSchedules.length === 0) {
      showAlert(t('medicationForm.errorNoSchedule'));
      return;
    }
    // '' vira null no envio — não salva string vazia como se fosse
    // uma dosagem de verdade. Unidade sem preencher fica de fora do
    // payload — o backend já tem um default sensato (`comprimidos` no
    // estoque, `mg` no próprio medicamento) pra quando não é enviada.
    const dosageToSend = dosage.trim() || null;
    const unitToSend = unit.trim() || undefined;
    setSaving(true);
    try {
      if (isNew) {
        const med = await createMedication(activeProfile.id, {
          name,
          dosage: dosageToSend,
          unit: unitToSend,
          color,
          instructions,
          notes,
          treatment_duration_days: treatmentDurationToSend,
        });
        // Estoque inicial é opcional — sem preencher, fica no default
        // (0) que o backend já cria junto do medicamento; não vale a
        // pena bloquear o cadastro por causa disso.
        const stockQuantity = parseFloat(initialStock);
        if (initialStock.trim() && !isNaN(stockQuantity) && stockQuantity >= 0) {
          await updateStock(med.id, { current_quantity: stockQuantity });
        }
        // Rascunhos viram schedules de verdade — quantos o usuário
        // tiver montado na lista. Cada rascunho já passou pela
        // validação do editor (formato HH:MM, intervalo 1-168, ≥1 dia),
        // então o laço não repete checagem.
        for (const draft of draftSchedules) {
          const isIntervalMode = draft.mode === 'interval';
          const days_of_week = isIntervalMode ? null : (draft.days.length === 7 ? null : [...draft.days]);
          const interval_hours = isIntervalMode ? parseIntOrNull(draft.intervalHours) : null;
          const schedule = await createSchedule(med.id, {
            time: draft.time,
            days_of_week,
            interval_hours,
          });
          await scheduleScheduleNotifications({
            scheduleId: schedule.id,
            time: draft.time,
            days_of_week,
            interval_hours,
            medicationName: name,
            dosage: dosageToSend,
            // Aqui é só texto local da notificação, não o payload da
            // API — usa o estado bruto (string, pode ser vazio), não
            // `unitToSend` (vira `undefined` quando vazio, pro backend
            // aplicar o próprio default).
            unit,
          });
        }
      } else {
        await updateMedication(Number(id), {
          name,
          dosage: dosageToSend,
          unit: unitToSend,
          color,
          instructions,
          notes,
          treatment_duration_days: treatmentDurationToSend,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      router.back();
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  // Pausar medicamento (Fase 2, 2026-08-12) — suspende temporariamente
  // sem apagar horários/histórico (ex.: internação, viagem). O backend
  // já para de gerar dose/marcar perdida sozinho a partir do
  // `is_paused`; falta só cancelar (ou reagendar, ao reativar) o
  // lembrete local — sem isso, o celular continuaria avisando pra tomar
  // um remédio que a pessoa decidiu pausar, o que anularia o propósito
  // da função pro usuário.
  async function togglePause() {
    const next = !isPaused;
    setPausing(true);
    try {
      await updateMedication(Number(id), { is_paused: next });
      if (next) {
        await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
      } else {
        await Promise.all(
          schedules.map((s) =>
            scheduleScheduleNotifications({
              scheduleId: s.id,
              time: s.time.slice(0, 5),
              days_of_week: s.days_of_week,
              interval_hours: s.interval_hours,
              medicationName: name,
              dosage: dosage.trim() || null,
              unit,
            }),
          ),
        );
      }
      setIsPaused(next);
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorPauseToggle'));
    } finally {
      setPausing(false);
    }
  }

  // "Foto do medicamento" (2026-08-13). Ação com 3+ escolhas (câmera,
  // galeria, remover) é o tipo de seletor que o próprio SO já resolve
  // bem como action sheet — diferente das confirmações sim/não
  // (sair/excluir/remover horário) que viraram ConfirmDialog temático,
  // aqui o Alert.alert nativo continua um padrão razoável.
  function handlePhotoPress() {
    // Web (W1, 2026-08-22): ActionSheet nativo não existe no browser —
    // vai direto pra galeria, que o expo-image-picker resolve com
    // <input type="file"> (a câmera é que não existe na web).
    if (Platform.OS === 'web') {
      pickPhoto('gallery');
      return;
    }
    const options: any[] = [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('medicationForm.photoCamera'), onPress: () => pickPhoto('camera') },
      { text: t('medicationForm.photoGallery'), onPress: () => pickPhoto('gallery') },
    ];
    if (photoUrl) {
      options.push({ text: t('medicationForm.photoRemove'), style: 'destructive', onPress: removePhoto });
    }
    Alert.alert(t('medicationForm.photoActionTitle'), undefined, options);
  }

  async function pickPhoto(source: 'camera' | 'gallery') {
    // Achado real testando no dispositivo (2026-08-14): `expo-image-picker`
    // é módulo nativo — o build EAS instalado no momento em que essa
    // feature foi escrita não tinha o código nativo compilado ainda.
    // Import estático no topo do arquivo travava a ROTA INTEIRA no boot
    // (o erro "Cannot find native module" acontecia antes até de abrir a
    // tela, não só ao tocar em foto). `require` tardio, só quando a
    // pessoa realmente toca em foto, isola a falha nessa ação específica
    // — o resto do formulário (nome, dosagem, horários, pausar...)
    // continua funcionando normalmente mesmo num build sem esse módulo.
    let ImagePicker: typeof import('expo-image-picker');
    try {
      ImagePicker = require('expo-image-picker');
    } catch {
      showAlert(t('medicationForm.photoUnavailableTitle'), t('medicationForm.photoUnavailableText'));
      return;
    }

    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });

    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const med = await uploadMedicationPhoto(Number(id), result.assets[0].uri);
      setPhotoUrl(med.photo_url);
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorPhoto'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    setUploadingPhoto(true);
    try {
      const med = await deleteMedicationPhoto(Number(id));
      setPhotoUrl(med.photo_url);
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorPhoto'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function resetScheduleFields() {
    setNewTime('08:00');
    setNewDays(ALL_DAYS);
    setScheduleMode('fixed');
    setNewIntervalHours('8');
  }

  function startAddSchedule() {
    setEditingScheduleId(null);
    setEditingDraftIndex(null);
    setNewTime('08:00');
    setNewDays(ALL_DAYS);
    setScheduleMode('fixed');
    setNewIntervalHours('8');
    // Mesmo botão "+", destinos diferentes: na criação alimenta a lista
    // de rascunhos (nada vai pro backend até salvar o remédio); num
    // remédio já existente salva direto, como sempre.
    if (isNew) setAddingDraft(true);
    else setAddingSchedule(true);
  }

  function startEditDraft(index: number) {
    const draft = draftSchedules[index];
    setEditingDraftIndex(index);
    setAddingDraft(false);
    setNewTime(draft.time);
    setNewDays([...draft.days]);
    setScheduleMode(draft.mode);
    setNewIntervalHours(draft.intervalHours);
  }

  // Rascunho não existe no backend ainda — recriar custa dois toques,
  // então remoção direta sem diálogo de confirmação.
  function removeDraft(index: number) {
    setDraftSchedules((prev) => prev.filter((_, i) => i !== index));
    if (editingDraftIndex === index) {
      setEditingDraftIndex(null);
      setAddingDraft(false);
      resetScheduleFields();
    }
  }

  // Atalho "quantas vezes por dia" (2026-08-21) — substitui a lista por
  // N horários padrão (todos fixos, todos os dias); ajuste fino fica
  // por conta do editor individual de cada rascunho.
  function applyFrequencyPreset(times: readonly string[]) {
    setDraftSchedules(
      times.map((time) => ({ time, mode: 'fixed' as const, days: [...ALL_DAYS], intervalHours: '8' })),
    );
    setEditingDraftIndex(null);
    setAddingDraft(false);
    resetScheduleFields();
  }

  // Chip fica destacado enquanto a lista corresponder exatamente ao
  // atalho (mesma quantidade, modo fixo, dias completos) — feedback de
  // que o toque fez efeito sem impedir edições posteriores.
  function isPresetActive(times: readonly string[]) {
    return (
      draftSchedules.length === times.length &&
      draftSchedules.every((d, i) => d.mode === 'fixed' && d.time === times[i] && sameDays(d.days, ALL_DAYS))
    );
  }

  function startEditSchedule(schedule: DoseSchedule) {
    setEditingScheduleId(schedule.id);
    setNewTime(schedule.time.slice(0, 5)); // backend manda "HH:MM:SS"
    setNewDays(schedule.days_of_week ?? ALL_DAYS);
    setScheduleMode(schedule.interval_hours !== null ? 'interval' : 'fixed');
    setNewIntervalHours(String(schedule.interval_hours ?? 8));
    setAddingSchedule(true);
  }

  function cancelScheduleForm() {
    setAddingSchedule(false);
    setEditingScheduleId(null);
    setAddingDraft(false);
    setEditingDraftIndex(null);
    resetScheduleFields();
  }

  async function saveScheduleForm() {
    if (!newTime.match(/^\d{2}:\d{2}$/)) {
      showAlert(t('medicationForm.errorInvalidFormat'), t('medicationForm.errorInvalidFormatText'));
      return;
    }
    const isInterval = scheduleMode === 'interval';
    const intervalHours = isInterval ? parseInt(newIntervalHours, 10) : null;
    if (isInterval && (isNaN(intervalHours!) || intervalHours! < 1 || intervalHours! > 168)) {
      showAlert(t('medicationForm.errorInvalidInterval'));
      return;
    }
    if (!isInterval && newDays.length === 0) {
      showAlert(t('medicationForm.errorSelectDay'));
      return;
    }
    const days_of_week = isInterval ? null : (newDays.length === 7 ? null : newDays);
    // Na criação o formulário alimenta a lista de rascunhos local — os
    // schedules de verdade nascem quando o remédio é salvo (ver
    // saveMedication). Validação idêntica ao fluxo de backend.
    if (isNew) {
      const draft: DraftSchedule = { time: newTime, mode: scheduleMode, days: [...newDays], intervalHours: newIntervalHours };
      setDraftSchedules((prev) =>
        editingDraftIndex !== null && !addingDraft
          ? prev.map((d, i) => (i === editingDraftIndex ? draft : d))
          : [...prev, draft],
      );
      cancelScheduleForm();
      return;
    }
    setSavingSchedule(true);
    try {
      const schedule = editingScheduleId
        ? await updateSchedule(editingScheduleId, { time: newTime, days_of_week, interval_hours: intervalHours })
        : await createSchedule(Number(id), { time: newTime, days_of_week, interval_hours: intervalHours });

      // scheduleScheduleNotifications já cancela as notificações antigas
      // desse scheduleId antes de recriar — cobre tanto criar quanto editar.
      // Corrigido 2026-08-14: schedule de intervalo agora agenda um
      // lembrete local por ocorrência do dia, não só no horário-âncora
      // (ver comentário em services/notifications.ts).
      await scheduleScheduleNotifications({
        scheduleId: schedule.id,
        time: newTime,
        days_of_week,
        interval_hours: intervalHours,
        medicationName: name,
        dosage: dosage.trim() || null,
        unit,
      });

      setSchedules((prev) =>
        editingScheduleId
          ? prev.map((s) => (s.id === schedule.id ? schedule : s))
          : [...prev, schedule],
      );
      cancelScheduleForm();
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorSaveSchedule'));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function confirmRemoveSchedule() {
    if (!scheduleToRemove) return;
    setRemovingSchedule(true);
    try {
      await deleteSchedule(scheduleToRemove.id);
      await cancelScheduleNotifications(scheduleToRemove.id);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleToRemove.id));
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
    } finally {
      setRemovingSchedule(false);
      setScheduleToRemove(null);
    }
  }

  function toggleDay(day: number) {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  // "Frequência de horário" (2026-08-14) — usado nos dois lugares que
  // têm formulário de horário (criar remédio novo e adicionar/editar
  // horário de um já existente), evita duplicar o toggle fixo/intervalo
  // duas vezes. `time` continua sempre visível fora daqui — é o campo
  // de âncora nos dois modos.
  function renderFrequencyFields() {
    return (
      <>
        <Text style={styles.label}>{t('medicationForm.frequencyLabel')}</Text>
        <View style={styles.freqRow}>
          <TouchableOpacity
            style={[styles.freqBtn, scheduleMode === 'fixed' && styles.freqBtnActive]}
            onPress={() => setScheduleMode('fixed')}
            accessibilityRole="button"
            accessibilityLabel={t('medicationForm.frequencyFixed')}
            accessibilityState={{ selected: scheduleMode === 'fixed' }}
          >
            <Text style={[styles.freqBtnText, scheduleMode === 'fixed' && styles.freqBtnTextActive]}>
              {t('medicationForm.frequencyFixed')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.freqBtn, scheduleMode === 'interval' && styles.freqBtnActive]}
            onPress={() => setScheduleMode('interval')}
            accessibilityRole="button"
            accessibilityLabel={t('medicationForm.frequencyInterval')}
            accessibilityState={{ selected: scheduleMode === 'interval' }}
          >
            <Text style={[styles.freqBtnText, scheduleMode === 'interval' && styles.freqBtnTextActive]}>
              {t('medicationForm.frequencyInterval')}
            </Text>
          </TouchableOpacity>
        </View>

        {scheduleMode === 'interval' ? (
          <>
            <Text style={styles.label}>{t('medicationForm.intervalHoursLabel')}</Text>
            {/* Atalhos dos intervalos mais prescritos — um toque no
                lugar de digitar; o campo livre continua pra casos fora
                da curva (3h, 36h...). */}
            <View style={styles.presetRow}>
              {INTERVAL_HOUR_OPTIONS.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[styles.presetChip, newIntervalHours === String(h) && styles.presetChipActive]}
                  onPress={() => setNewIntervalHours(String(h))}
                  accessibilityRole="button"
                  accessibilityLabel={`${h}h`}
                  accessibilityState={{ selected: newIntervalHours === String(h) }}
                >
                  <Text style={[styles.presetChipText, newIntervalHours === String(h) && styles.presetChipTextActive]}>
                    {h}h
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={newIntervalHours}
              onChangeText={setNewIntervalHours}
              placeholder={t('medicationForm.intervalHoursPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              accessibilityLabel={t('medicationForm.intervalHoursAccessibilityLabel')}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>{t('medicationForm.daysLabel')}</Text>
            {/* Atalhos de dias (2026-08-21) — "dias úteis" e "fim de
                semana" são o vocabulário real; os círculos ficam pra
                combinações fora dessas três. */}
            <View style={styles.presetRow}>
              {DAY_PRESETS.map((preset) => {
                const label = t(`medicationForm.dayPreset${preset.key.charAt(0).toUpperCase()}${preset.key.slice(1)}`);
                const active = sameDays(newDays, preset.days);
                return (
                  <TouchableOpacity
                    key={preset.key}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => setNewDays([...preset.days])}
                    accessibilityRole="button"
                    accessibilityLabel={t('medicationForm.dayPresetAccessibilityLabel', { label })}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
      </>
    );
  }

  const locale = i18n.language;
  // "Fim previsto" (2026-08-21) — duração em dias solta no formulário
  // não diz nada pra quem está cadastrando; a data transforma o número
  // em algo tangível ("10" → "Fim previsto: 30 de ago. de 2026").
  const durationDaysNum = parseIntOrNull(treatmentDurationDays);
  const treatmentEndsOn =
    durationDaysNum !== null && durationDaysNum >= 1
      ? new Date(Date.now() + (durationDaysNum - 1) * 24 * 60 * 60 * 1000).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} color={colors.brand} />;
  }

  return (
    <>
    {/* Achado real de uso (2026-08-14): sem isto, o teclado cobria o
        campo que estava sendo preenchido — formulário só tinha
        ScrollView, sem nenhum tratamento de teclado (diferente de
        login/registro, que já usam esse mesmo padrão). */}
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView style={styles.container} contentContainerStyle={[styles.inner, isWide && styles.innerWide]} keyboardShouldPersistTaps="handled">

      {activeProfile?.is_owner === false && (
        <View style={styles.caregiverNotice}>
          <MaterialCommunityIcons name="shield-outline" size={18} color={colors.brand} />
          <Text style={styles.caregiverNoticeText}>{t('medications.caregiverReadOnlyNotice')}</Text>
        </View>
      )}

      {/* Foto (2026-08-13) — só depois de criado, precisa de id pra anexar */}
      {!isNew && (
        <TouchableOpacity
          style={styles.photoCircle}
          onPress={handlePhotoPress}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel={photoUrl ? t('medicationForm.photoChangeLabel') : t('medicationForm.photoAddLabel')}
          accessibilityState={{ busy: uploadingPhoto }}
        >
          {uploadingPhoto ? (
            <ActivityIndicator color={colors.brand} />
          ) : photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photoImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.textMuted} />
              <Text style={styles.photoPlaceholderText}>{t('medicationForm.photoAddLabel')}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* — Dados do medicamento — */}
      <Text style={styles.sectionTitle}>{t('medicationForm.sectionData')}</Text>

      <Text style={styles.label}>{t('medicationForm.nameLabel')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('medicationForm.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t('medicationForm.nameAccessibilityLabel')}
      />

      <Text style={styles.label}>{t('medicationForm.dosageLabel')}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={dosage}
          onChangeText={setDosage}
          placeholder={t('medicationForm.dosagePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel={t('medicationForm.dosageAccessibilityLabel')}
        />
        <TextInput
          style={[styles.input, styles.unitInput]}
          value={unit}
          onChangeText={setUnit}
          placeholder={t('medicationForm.unitPlaceholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('medicationForm.unitAccessibilityLabel')}
        />
      </View>

      {/* Achado real de uso, anotado no Obsidian (2026-08-14): não
          tinha onde registrar o estoque no cadastro — precisava criar
          o remédio, ir pra aba Estoque, achar ele na lista, editar.
          Reaproveita o mesmo endpoint de sempre (`updateStock`), só
          num segundo request logo depois de criar — sem mudar schema
          nem rota nova. Só aparece ao criar; em remédio já existente,
          a aba Estoque continua sendo o lugar certo de editar. */}
      {isNew && (
        <>
          <Text style={styles.label}>{t('medicationForm.initialStockLabel')}</Text>
          <TextInput
            style={styles.input}
            value={initialStock}
            onChangeText={setInitialStock}
            placeholder={t('medicationForm.initialStockPlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel={t('medicationForm.initialStockAccessibilityLabel')}
          />
        </>
      )}

      <Text style={styles.label}>{t('medicationForm.colorLabel')}</Text>
      <View style={styles.colorRow}>
        {COLORS.map((c, i) => (
          <TouchableOpacity
            key={c}
            style={[styles.colorBtn, { backgroundColor: c }, color === c && styles.colorBtnActive]}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityLabel={t('medicationForm.colorOptionLabel', { index: i + 1 })}
            accessibilityState={{ selected: color === c }}
          />
        ))}
      </View>

      {/* Achado real de uso, anotado no Obsidian (2026-08-14): muitos
          remédios têm limite de dias pra tomar (antibiótico é o
          exemplo clássico); nunca dava pra registrar isso. Decisão de
          produto confirmada: quando os dias acabarem, só avisa —
          nunca pausa sozinho. Editável tanto ao criar quanto depois
          (diferente do estoque inicial, que é só na criação — duração
          faz sentido ajustar a qualquer momento). */}
      <Text style={styles.label}>{t('medicationForm.treatmentDurationLabel')}</Text>
      <TextInput
        style={styles.input}
        value={treatmentDurationDays}
        onChangeText={setTreatmentDurationDays}
        placeholder={t('medicationForm.treatmentDurationPlaceholder')}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        accessibilityLabel={t('medicationForm.treatmentDurationAccessibilityLabel')}
      />
      {treatmentEndsOn && (
        <Text style={styles.fieldHint}>{t('medicationForm.treatmentEndsPreview', { date: treatmentEndsOn })}</Text>
      )}

      <Text style={styles.label}>{t('medicationForm.instructionsLabel')}</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={instructions}
        onChangeText={setInstructions}
        placeholder={t('medicationForm.instructionsPlaceholder')}
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        accessibilityLabel={t('medicationForm.instructionsLabel')}
      />

      <Text style={styles.label}>{t('medicationForm.notesLabel')}</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('medicationForm.notesPlaceholder')}
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        accessibilityLabel={t('medicationForm.notesLabel')}
      />

      {/* Achado real de uso, anotado no Obsidian (2026-08-14): o botão
          de salvar vinha antes da seção de Horários, mas horário é uma
          das coisas mais importantes do cadastro — devia estar mais
          em cima. Horários agora vem logo depois dos dados do
          remédio; Salvar virou a última ação do formulário, no fim de
          tudo (padrão comum: preenche, confirma por último). */}

      {/* — Horários — */}
      {!isNew && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('medicationForm.sectionSchedules')}</Text>
            {!addingSchedule && (
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={startAddSchedule}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.addScheduleLabel')}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                <Text style={styles.addScheduleBtnText}>{t('medicationForm.add')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {schedules.length === 0 && !addingSchedule && (
            <View style={styles.emptySchedules}>
              <MaterialCommunityIcons name="clock-alert-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptySchedulesText}>{t('medicationForm.noSchedules')}</Text>
            </View>
          )}

          {schedules.map((s) => (
            <View key={s.id} style={styles.scheduleCard}>
              <MaterialCommunityIcons name="clock-outline" size={20} color={colors.brand} />
              <View style={styles.scheduleInfo}>
                <Text style={styles.scheduleTime}>{s.time}</Text>
                <Text style={styles.scheduleDays}>{formatDays(s.days_of_week, t, s.interval_hours)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => startEditSchedule(s)}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.editLabel', { time: s.time, days: formatDays(s.days_of_week, t, s.interval_hours) })}
              >
                <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScheduleToRemove(s)}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.removeLabel', { time: s.time, days: formatDays(s.days_of_week, t, s.interval_hours) })}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {addingSchedule && (
            <View style={styles.addScheduleBox}>
              <Text style={styles.addScheduleTitle}>
                {editingScheduleId ? t('medicationForm.editSchedule') : t('medicationForm.newSchedule')}
              </Text>

              <Text style={styles.label}>{t('medicationForm.hourLabel')}</Text>
              <TextInput
                style={styles.input}
                value={newTime}
                onChangeText={setNewTime}
                placeholder={t('medicationForm.hourPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={t('medicationForm.hourAccessibilityLabel')}
              />

              {renderFrequencyFields()}

              <View style={styles.addScheduleActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={cancelScheduleForm}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={saveScheduleForm}
                  disabled={savingSchedule}
                  accessibilityRole="button"
                  accessibilityLabel={editingScheduleId ? t('medicationForm.saveScheduleLabel') : t('medicationForm.addScheduleLabel')}
                  accessibilityState={{ busy: savingSchedule }}
                >
                  {savingSchedule
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.confirmBtnText}>{editingScheduleId ? t('medicationForm.saveAction') : t('medicationForm.addAction')}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* Horários ao criar (2026-08-21) — substitui o antigo "Primeiro
          horário" (um só, sempre criado) por: atalho de quantas vezes
          por dia + lista de rascunhos editáveis. Mesma cara da seção de
          horários de remédio já existente, pra não ter duas linguagens
          visuais no mesmo formulário. */}
      {isNew && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('medicationForm.sectionSchedules')}</Text>
            {!addingDraft && editingDraftIndex === null && (
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={startAddSchedule}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.addScheduleLabel')}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                <Text style={styles.addScheduleBtnText}>{t('medicationForm.add')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Resposta direta a "quantas vezes tomar?" — um toque monta
              a lista toda; depois ajusta horário individual à vontade. */}
          <Text style={styles.label}>{t('medicationForm.frequencyQuickLabel')}</Text>
          <View style={styles.presetRow}>
            {(
              [
                ['once', t('medicationForm.quickOnce')],
                ['twice', t('medicationForm.quickTwice')],
                ['thrice', t('medicationForm.quickThrice')],
                ['fourTimes', t('medicationForm.quickFourTimes')],
              ] as const
            ).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.presetChip, isPresetActive(FREQUENCY_PRESET_TIMES[key]) && styles.presetChipActive]}
                onPress={() => applyFrequencyPreset(FREQUENCY_PRESET_TIMES[key])}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.quickAccessibilityLabel', { preset: label })}
                accessibilityState={{ selected: isPresetActive(FREQUENCY_PRESET_TIMES[key]) }}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    isPresetActive(FREQUENCY_PRESET_TIMES[key]) && styles.presetChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {draftSchedules.map((draft, index) => {
            const draftInterval = draft.mode === 'interval' ? parseIntOrNull(draft.intervalHours) : null;
            const summary = formatDays(draft.mode === 'interval' ? null : draft.days, t, draftInterval);
            return (
              <View key={`${draft.time}-${index}`} style={styles.scheduleCard}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={colors.brand} />
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleTime}>{draft.time}</Text>
                  <Text style={styles.scheduleDays}>{summary}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => startEditDraft(index)}
                  style={styles.editBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('medicationForm.editLabel', { time: draft.time, days: summary })}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeDraft(index)}
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('medicationForm.removeLabel', { time: draft.time, days: summary })}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })}

          {(addingDraft || editingDraftIndex !== null) && (
            <View style={styles.addScheduleBox}>
              <Text style={styles.addScheduleTitle}>
                {editingDraftIndex !== null && !addingDraft ? t('medicationForm.editSchedule') : t('medicationForm.newSchedule')}
              </Text>

              <Text style={styles.label}>{t('medicationForm.hourLabel')}</Text>
              <TextInput
                style={styles.input}
                value={newTime}
                onChangeText={setNewTime}
                placeholder={t('medicationForm.hourPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={t('medicationForm.hourAccessibilityLabel')}
              />

              {renderFrequencyFields()}

              <View style={styles.addScheduleActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={cancelScheduleForm}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={saveScheduleForm}
                  accessibilityRole="button"
                  accessibilityLabel={editingDraftIndex !== null && !addingDraft ? t('medicationForm.saveScheduleLabel') : t('medicationForm.addScheduleLabel')}
                >
                  <Text style={styles.confirmBtnText}>
                    {editingDraftIndex !== null && !addingDraft ? t('medicationForm.saveAction') : t('medicationForm.addAction')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {!isNew && (
        <TouchableOpacity
          style={[styles.pauseBtn, isPaused && styles.pauseBtnActive]}
          onPress={togglePause}
          disabled={pausing}
          accessibilityRole="button"
          accessibilityLabel={isPaused ? t('medicationForm.resume') : t('medicationForm.pause')}
          accessibilityState={{ busy: pausing }}
        >
          {pausing
            ? <ActivityIndicator color={isPaused ? '#fff' : colors.textSecondary} size="small" />
            : (
              <>
                <MaterialCommunityIcons
                  name={isPaused ? 'play-circle-outline' : 'pause-circle-outline'}
                  size={18}
                  color={isPaused ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.pauseBtnText, isPaused && styles.pauseBtnTextActive]}>
                  {isPaused ? t('medicationForm.resume') : t('medicationForm.pause')}
                </Text>
              </>
            )
          }
        </TouchableOpacity>
      )}

      {isPaused && (
        <Text style={styles.pausedNotice}>{t('medicationForm.pausedNotice')}</Text>
      )}

      {activeProfile?.is_owner !== false && (
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={saveMedication}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={isNew ? t('medicationForm.createMedication') : t('medicationForm.saveChanges')}
          accessibilityState={{ busy: saving }}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{isNew ? t('medicationForm.createMedication') : t('medicationForm.saveChanges')}</Text>
          }
        </TouchableOpacity>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
    </KeyboardAvoidingView>

    <ConfirmDialog
      visible={!!scheduleToRemove}
      title={t('medicationForm.removeConfirmTitle')}
      message={scheduleToRemove ? t('medicationForm.removeConfirmMessage', { time: scheduleToRemove.time }) : ''}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.remove')}
      destructive
      busy={removingSchedule}
      onCancel={() => setScheduleToRemove(null)}
      onConfirm={confirmRemoveSchedule}
    />
    {alertDialog}
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 20, paddingBottom: 48 },
    innerWide: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 48 },
    caregiverNotice: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.brandSubtle, borderRadius: 12, padding: 12, marginBottom: 16,
      borderWidth: 1, borderColor: c.brand,
    },
    caregiverNoticeText: { color: c.brand, fontSize: 13, fontWeight: '600', flex: 1 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, marginBottom: 12 },
    photoCircle: {
      width: 96, height: 96, borderRadius: 48, alignSelf: 'center', marginBottom: 20,
      backgroundColor: c.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    photoImage: { width: '100%', height: '100%' },
    photoPlaceholder: { alignItems: 'center', gap: 4 },
    photoPlaceholderText: { fontSize: 10, color: c.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 6 },
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
    saveBtnText: { color: c.onBrand, fontSize: 16, fontWeight: '700' },
    pauseBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 12, padding: 13, marginTop: 10,
      borderWidth: 1.5, borderColor: c.border,
    },
    pauseBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    pauseBtnText: { color: c.textSecondary, fontWeight: '600', fontSize: 14 },
    pauseBtnTextActive: { color: c.onBrand },
    pausedNotice: {
      fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 8,
    },
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
    editBtn: { padding: 4 },
    deleteBtn: { padding: 4, marginLeft: 4 },
    addScheduleBox: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border, marginTop: 4,
    },
    addScheduleTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    daysRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    dayBtn: {
      // minWidth/minHeight, não width/height fixos (auditoria de
      // responsividade, 2026-08-13) — é um círculo com uma letra só
      // dentro; com fonte do sistema aumentada, largura/altura fixas
      // cortariam a letra em vez de crescer o botão.
      minWidth: 36, minHeight: 36, paddingHorizontal: 4, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    dayBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    dayBtnText: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    dayBtnTextActive: { color: c.onBrand },
    // "Frequência de horário" (2026-08-14) — toggle fixo/intervalo,
    // mesmo padrão visual dos seletores de tema/idioma/fonte em Perfil.
    freqRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    freqBtn: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, borderRadius: 10,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    freqBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    freqBtnText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    freqBtnTextActive: { color: c.onBrand },
    // Chips de atalho (presets de frequência/dias/intervalo, 2026-08-21)
    // — largura pelo conteúdo e quebra de linha, diferente dos botões
    // flex:1 acima: "4x por dia" não cabe espremido em quarto de tela.
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 6 },
    presetChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    presetChipActive: { backgroundColor: c.brand, borderColor: c.brand },
    presetChipText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
    presetChipTextActive: { color: c.onBrand },
    fieldHint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    addScheduleActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
      flex: 1, padding: 12, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, alignItems: 'center',
    },
    cancelBtnText: { color: c.textSecondary, fontWeight: '600' },
    confirmBtn: { flex: 1, backgroundColor: c.brand, padding: 12, borderRadius: 10, alignItems: 'center' },
    confirmBtnText: { color: c.onBrand, fontWeight: '600' },
  });
}
