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
  Modal,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useProfileStore } from '../../store/profileStore';
import { useToastStore } from '../../store/toastStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { maskMedicationName } from '../../lib/privacy';
import { parseStockQuantity, isStockNeverSet } from '../../lib/stockQuantity';
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
  deleteMedication,
  DoseSchedule,
  StockItem,
  LOW_STOCK_DAYS_THRESHOLD,
} from '../../services/medications';
import {
  scheduleScheduleNotifications,
  cancelScheduleNotifications,
  scheduleRefillAlert,
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

// Achado real de uso (2026-09-06): erro de upload de foto chegava na
// tela como "Error request failed with status code 500" cru — sem
// contexto nenhum, confuso pro público idoso do app. Um 413 (nginx
// rejeitando payload grande) ou um 500 sem corpo JSON (PHP-FPM/Laravel
// nem chegou a processar) não têm `response.data.message` nenhum pra
// mostrar — cai direto no fallback genérico antes. Dá um passo
// acionável em vez de só nomear o código HTTP.
export function photoErrorMessage(err: any, t: TFunction): string {
  const status = err.response?.status;
  const serverMsg =
    err.response?.data?.message ??
    (err.response?.data?.errors ? Object.values(err.response.data.errors).flat().join('\n') : null);
  if (serverMsg) return serverMsg;
  if (status === 413) return t('medicationForm.errorPhotoTooLarge');
  if (status && status >= 500) return t('medicationForm.errorPhotoServer');
  if (!err.response) return t('medicationForm.errorPhotoNetwork');
  return err.message ?? t('medicationForm.errorPhoto');
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
  // "Estoque editável na tela do remédio" (2026-09-07, item 13) —
  // achado real do Rilson: dava pra ajustar a quantidade pela aba
  // Estoque, mas não editando o remédio diretamente (só tinha "Estoque
  // inicial" ao criar, que some depois). Mesmo padrão de
  // Adicionar/Definir já usado em `app/(tabs)/stock.tsx` — reaproveita
  // `updateStock`, sem endpoint novo.
  const [stock, setStock] = useState<StockItem | null>(null);
  const [editingStock, setEditingStock] = useState(false);
  const [stockQty, setStockQty] = useState('');
  const [stockAction, setStockAction] = useState<'add' | 'set' | null>(null);
  const [color, setColor] = useState('#6366f1');
  const [instructions, setInstructions] = useState('');
  // Achado real (2026-08-13): campo já existia no backend (validação em
  // MedicationController, coluna no banco) mas nunca tinha chegado no
  // formulário mobile — buraco desde o início, não regressão de hoje.
  const [notes, setNotes] = useState('');
  // "Foto do medicamento" (2026-08-13) — valor real pro público
  // idoso/cuidador: reconhecer visualmente costuma valer mais que ler o
  // nome.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // "Foto no cadastro" (2026-09-07): achado real do Rilson — só dava pra
  // anexar foto editando um remédio já criado, nunca no cadastro, que é
  // exatamente quando a pessoa está com a caixa/bula na mão. Trava
  // técnica real: `uploadMedicationPhoto` exige um `id`, que só existe
  // depois do POST de criação. Mesmo padrão já usado pro estoque inicial
  // (`initialStock`): guarda o URI local aqui, sobe como uma chamada
  // extra assim que `createMedication` retorna o id (ver saveMedication).
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  // O que aparece no círculo: a foto já salva no servidor (editando) ou
  // a foto escolhida ainda não enviada (cadastrando).
  const displayPhotoUri = isNew ? localPhotoUri : photoUrl;
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [saving, setSaving] = useState(false);
  // "Excluir medicamento" (2026-09-07, item 15) — hard delete em cascata
  // no backend (schedules, dose logs e estoque somem junto), por isso
  // atrás de ConfirmDialog destrutivo, mesmo padrão de "Remover
  // horário".
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  // "Horário fixo" vs "A cada X horas" (2026-09-07) — achado real do
  // Rilson: a feature de intervalo já existia (14/08) mas ficava
  // escondida dentro do formulário de UM horário individual, terceiro
  // nível de profundidade — ele foi checar achando que não tinha sido
  // feita. Decisão de produto confirmada: um remédio inteiro usa um
  // modo só, escolhido PRIMEIRO, no topo da seção Horários (não mais
  // repetido a cada horário adicionado — menos decisão repetida pro
  // público idoso). `scheduleKind` é essa escolha; o formulário de
  // horário individual só reflete o que já foi decidido lá em cima.
  const [scheduleKind, setScheduleKind] = useState<'fixed' | 'interval'>('fixed');
  // Trocar de modo num remédio JÁ SALVO apaga e recria os horários de
  // verdade no backend — destrutivo, por isso passa por confirmação
  // (ver requestScheduleKindChange/confirmScheduleKindChange). Na
  // criação a troca só mexe no rascunho local, sem custo nenhum.
  const [pendingScheduleKind, setPendingScheduleKind] = useState<'fixed' | 'interval' | null>(null);
  const [switchingScheduleKind, setSwitchingScheduleKind] = useState(false);
  const [newIntervalHours, setNewIntervalHours] = useState('8');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Confirmação de remover horário (2026-08-13) — Alert.alert nativo
  // destoava do resto do app (achado real testando no dispositivo).
  const [scheduleToRemove, setScheduleToRemove] = useState<DoseSchedule | null>(null);
  const [removingSchedule, setRemovingSchedule] = useState(false);
  const { showAlert, alertDialog } = useAlertDialog();
  // Achado real de uso (2026-09-02): "salvar sem feedback visual" — ver
  // store/toastStore.ts (precisa ser global porque este `router.back()`
  // desmonta a tela antes de um toast local conseguir aparecer).
  const showToast = useToastStore((s) => s.showToast);
  const { isPrivate } = usePrivacyStore();

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
        setStock(med.stock);
        setSchedules(med.schedules ?? []);
        // Modo inicial inferido dos horários reais — remédios antigos
        // são sempre um só modo na prática (a UI nunca ofereceu misturar
        // de propósito antes desta mudança), então basta olhar o
        // primeiro horário com interval_hours setado.
        setScheduleKind((med.schedules ?? []).some((s) => s.interval_hours != null) ? 'interval' : 'fixed');
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
    // "Cadastrar sem horário = só estoque" (2026-09-07) — achado real do
    // Rilson: já era possível REMOVER todos os horários de um remédio
    // existente (fica só no estoque, sem lembrete — sempre foi aceito
    // assim); só faltava a mesma liberdade no CADASTRO. Inconsistência
    // sem motivo — bloquear aqui não impedia nada, só empurrava a
    // mesma ação pra depois de criar. A tela já deixa claro que é um
    // estado escolhido, não um erro (ver o aviso "Nenhum horário" na
    // seção Horários e o toast de confirmação diferente em
    // saveMedication).
    // '' vira null no envio — não salva string vazia como se fosse
    // uma dosagem de verdade. Unidade sem preencher fica de fora do
    // payload — o backend já tem um default sensato (`comprimidos` no
    // estoque, `mg` no próprio medicamento) pra quando não é enviada.
    const dosageToSend = dosage.trim() || null;
    const unitToSend = unit.trim() || undefined;
    let photoUploadFailed = false;
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
        // Foto escolhida durante o cadastro (2026-09-07) — sobe agora
        // que o `id` existe. Tolerante a falha: o remédio já foi criado
        // com sucesso, uma foto que não subiu não pode travar o fluxo
        // nem apagar o resto do que a pessoa acabou de preencher. Erro
        // vira aviso no toast final, não bloqueia o `router.back()`.
        if (localPhotoUri) {
          try {
            await uploadMedicationPhoto(med.id, localPhotoUri);
          } catch (err: any) {
            console.error('[uploadPhoto on create error]', err);
            if (typeof Sentry !== 'undefined' && Sentry.captureException) {
              Sentry.captureException(err);
            }
            photoUploadFailed = true;
          }
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
      const toastName = maskMedicationName(name, isPrivate);
      showToast(
        photoUploadFailed
          ? t('medicationForm.createdPhotoFailedToast', { name: toastName })
          : isNew && draftSchedules.length === 0
            // Cadastro sem horário (2026-09-07) — reforça que foi uma
            // escolha reconhecida, não um remédio "esquecido" sem
            // lembrete nenhum.
            ? t('medicationForm.createdStockOnlyToast', { name: toastName })
            : isNew
              ? t('medicationForm.createdToast', { name: toastName })
              : t('medicationForm.savedToast', { name: toastName }),
      );
      router.back();
    } catch (err: any) {
      // Limite de medicamentos do plano gratuito (2026-09-07, item 14)
      // — achado real do Rilson: esse erro específico caía no alerta
      // genérico ("Erro" + só "OK"), sem caminho pra resolver. É
      // provavelmente o primeiro momento de conversão real que a
      // pessoa encontra organicamente — merece um título convidativo e
      // um botão que já leva pra tela de planos Pro, não só informar.
      const backendMessage = err.response?.data?.message;
      if (err.response?.status === 403 && backendMessage?.includes('Limite de 15 medicamentos')) {
        showAlert(t('medicationForm.limitReachedTitle'), backendMessage, {
          label: t('medicationForm.limitReachedAction'),
          onPress: () => router.push('/pro'),
        });
      } else {
        showAlert(t('common.error'), backendMessage ?? t('medicationForm.errorSave'));
      }
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
      showToast(next ? t('medicationForm.pausedToast') : t('medicationForm.resumedToast'));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorPauseToggle'));
    } finally {
      setPausing(false);
    }
  }

  // "Estoque editável na tela do remédio" (2026-09-07, item 13) — mesma
  // validação/semântica de app/(tabs)/stock.tsx: um campo só, dois
  // botões (Adicionar soma, Definir substitui), nunca ambíguo sobre o
  // que o número digitado significa. Validação em si extraída pra
  // lib/stockQuantity.ts (achado de revisão de código, 2026-09-08) —
  // as duas telas reimplementavam a mesma regra separadamente.
  function parseTypedStockQty(): number | null {
    const quantity = parseStockQuantity(stockQty);
    if (quantity === null) {
      showAlert(t('stock.invalidValue'));
    }
    return quantity;
  }

  async function saveStockQuantity(quantity: number, action: 'add' | 'set') {
    setStockAction(action);
    try {
      const updated = await updateStock(Number(id), { current_quantity: quantity });
      setStock(updated);
      // Reagenda o alerta de estoque baixo com o `days_remaining`
      // recalculado — precisa do medicamento fresco (o retorno de
      // updateStock é só o StockItem, sem esse campo), mesmo padrão de
      // app/(tabs)/stock.tsx pra não duplicar a notificação divergindo
      // entre os dois lugares que editam estoque.
      const fresh = await getMedication(Number(id));
      await scheduleRefillAlert({
        medicationId: fresh.id,
        medicationName: fresh.name,
        daysRemaining: fresh.days_remaining,
        thresholdDays: LOW_STOCK_DAYS_THRESHOLD,
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      setEditingStock(false);
      showToast(t('stock.savedToast', { name: maskMedicationName(name, isPrivate) }));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('stock.errorSave'));
    } finally {
      setStockAction(null);
    }
  }

  function addStockQty() {
    const typed = parseTypedStockQty();
    if (typed === null) return;
    const current = stock?.current_quantity ?? 0;
    saveStockQuantity(current + typed, 'add');
  }

  function setStockAbsolute() {
    const quantity = parseTypedStockQty();
    if (quantity === null) return;
    saveStockQuantity(quantity, 'set');
  }

  function cancelStockEdit() {
    setEditingStock(false);
    setStockQty('');
  }

  // "Excluir medicamento" (2026-09-07, item 15) — hard delete em
  // cascata no backend (MedicationController::destroy apaga
  // dose_schedules, dose_logs e stock_items junto, sem soft-delete).
  // Cancela as notificações locais de cada horário antes — o backend
  // não sabe nada sobre elas, ficariam avisando um remédio que não
  // existe mais.
  async function confirmDeleteMedication() {
    setDeleting(true);
    try {
      await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
      await deleteMedication(Number(id));
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
      showToast(t('medicationForm.deletedToast', { name: maskMedicationName(name, isPrivate) }));
      router.back();
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorDelete'));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  // "Foto do medicamento" (2026-08-13). Ação com 3+ escolhas (câmera,
  // galeria, remover) é o tipo de seletor que o próprio SO já resolve
  // bem como action sheet — diferente das confirmações sim/não
  // (sair/excluir/remover horário) que viraram ConfirmDialog temático,
  // aqui o Alert.alert nativo continua um padrão razoável.
  function handlePhotoPress() {
    if (Platform.OS === 'web') {
      pickPhoto('gallery');
      return;
    }
    setPhotoModalVisible(true);
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

    // Achado real de uso (2026-09-06): tentei redimensionar a foto aqui
    // com `expo-image-manipulator` antes de subir (câmera de celular
    // gera arquivo grande mesmo comprimido, ver docker/uploads.ini pro
    // fix real do lado do servidor). Revertido no mesmo dia: mesmo
    // dentro de um `try/catch` como o do ImagePicker acima, carregar o
    // módulo nativo derrubou o app inteiro em produção (Sentry: "Cannot
    // find native module 'ExpoImageManipulator'", `handled: no` — o
    // catch não segurou). Diferente de expo-print (cujo require síncrono
    // já é pego pelo catch), o carregamento desse módulo escapa de
    // alguma forma que não deu pra confirmar com segurança sem um build
    // real pra testar. Fica pra depois de um build de verdade — o fix
    // do servidor (upload_max_filesize) já resolve o problema original
    // sozinho, sem essa camada extra de risco.
    const uploadUri = result.assets[0].uri;

    // No cadastro (2026-09-07) ainda não existe `id` pra anexar a foto —
    // guarda o URI local e sobe de verdade em saveMedication, assim que
    // o remédio é criado. Nada de rede aqui, então sem `uploadingPhoto`.
    if (isNew) {
      setLocalPhotoUri(uploadUri);
      return;
    }

    setUploadingPhoto(true);
    try {
      const med = await uploadMedicationPhoto(Number(id), uploadUri);
      setPhotoUrl(med.photo_url);
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      showToast(t('medicationForm.photoSavedToast'));
    } catch (err: any) {
      console.error('[uploadPhoto error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), photoErrorMessage(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    // No cadastro, a foto ainda só existe localmente — nada pra apagar
    // no servidor, só descarta a escolha.
    if (isNew) {
      setLocalPhotoUri(null);
      return;
    }

    setUploadingPhoto(true);
    try {
      const med = await deleteMedicationPhoto(Number(id));
      setPhotoUrl(med.photo_url);
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      showToast(t('medicationForm.photoRemovedToast'));
    } catch (err: any) {
      console.error('[removePhoto error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), photoErrorMessage(err, t));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function resetScheduleFields() {
    setNewTime('08:00');
    setNewDays(ALL_DAYS);
    setNewIntervalHours('8');
  }

  function startAddSchedule() {
    setEditingScheduleId(null);
    setEditingDraftIndex(null);
    setNewTime('08:00');
    setNewDays(ALL_DAYS);
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
    const isInterval = scheduleKind === 'interval';
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
      const draft: DraftSchedule = { time: newTime, mode: scheduleKind, days: [...newDays], intervalHours: newIntervalHours };
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
      showToast(t('medicationForm.scheduleSavedToast'));
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
      showToast(t('medicationForm.scheduleRemovedToast'));
    } finally {
      setRemovingSchedule(false);
      setScheduleToRemove(null);
    }
  }

  // Cadastro (2026-09-07): nada foi salvo ainda, então trocar de modo é
  // de graça — só reinicia o rascunho com um padrão sensato do modo
  // novo, sem perguntar nada.
  function applyDraftScheduleKindChange(kind: 'fixed' | 'interval') {
    setScheduleKind(kind);
    setDraftSchedules(
      kind === 'interval'
        ? [{ time: '08:00', mode: 'interval', days: [...ALL_DAYS], intervalHours: '8' }]
        : [{ ...DEFAULT_DRAFT, days: [...ALL_DAYS] }],
    );
    cancelScheduleForm();
  }

  // Remédio já existente: trocar de modo com horários de verdade
  // cadastrados é destrutivo (apaga e recria no backend + cancela/
  // reagenda notificação) — passa por confirmação. Sem horário nenhum
  // hoje, não há nada a perder: troca direto, sem perguntar.
  function requestScheduleKindChange(kind: 'fixed' | 'interval') {
    if (kind === scheduleKind) return;
    if (isNew) {
      applyDraftScheduleKindChange(kind);
      return;
    }
    if (schedules.length === 0) {
      setScheduleKind(kind);
      return;
    }
    setPendingScheduleKind(kind);
  }

  async function confirmScheduleKindChange() {
    if (!pendingScheduleKind) return;
    const kind = pendingScheduleKind;
    setSwitchingScheduleKind(true);
    try {
      // Apaga tudo que existe no modo antigo — local e notificação.
      await Promise.all(
        schedules.map(async (s) => {
          await deleteSchedule(s.id);
          await cancelScheduleNotifications(s.id);
        }),
      );
      // Recria um horário-padrão no modo novo, usando o horário do
      // primeiro schedule antigo como âncora (menos surpresa do que
      // forçar sempre 08:00) — a pessoa ajusta depois se quiser.
      const anchorTime = schedules[0]?.time?.slice(0, 5) ?? '08:00';
      const interval_hours = kind === 'interval' ? 8 : null;
      const created = await createSchedule(Number(id), { time: anchorTime, days_of_week: null, interval_hours });
      await scheduleScheduleNotifications({
        scheduleId: created.id,
        time: anchorTime,
        days_of_week: null,
        interval_hours,
        medicationName: name,
        dosage: dosage.trim() || null,
        unit,
      });
      setSchedules([created]);
      setScheduleKind(kind);
      cancelScheduleForm();
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      showToast(t('medicationForm.scheduleKindChangedToast'));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('medicationForm.errorSaveSchedule'));
      // Achado real de revisão de código (2026-09-08): o `Promise.all`
      // acima não é atômico — se UM `deleteSchedule` falhar no meio
      // (rede instável), os que já rodaram antes dele já apagaram de
      // verdade no backend, mas o estado local (`schedules`) continuava
      // mostrando a lista antiga até recarregar a tela manualmente.
      // Busca o remédio fresco do backend pra sincronizar de novo com a
      // realidade, em vez de deixar a UI mentindo sobre o que existe.
      try {
        const fresh = await getMedication(Number(id));
        setSchedules(fresh.schedules ?? []);
        setScheduleKind((fresh.schedules ?? []).some((s) => s.interval_hours != null) ? 'interval' : 'fixed');
      } catch {
        // Re-sincronizar é best-effort — se isso também falhar (rede
        // ainda pior), o erro original já foi mostrado acima; reabrir a
        // tela resolve, não vale travar o usuário numa segunda falha.
      }
    } finally {
      setSwitchingScheduleKind(false);
      setPendingScheduleKind(null);
    }
  }

  function toggleDay(day: number) {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  // "Frequência de horário" (2026-08-14) — usado nos dois lugares que
  // têm formulário de horário (criar remédio novo e adicionar/editar
  // horário de um já existente). Antes tinha aqui dentro o próprio
  // toggle "Horário fixo" / "A cada X horas" — subiu pro topo da seção
  // Horários (ver `scheduleKind`, 2026-09-07): a escolha de modo é uma
  // decisão do remédio inteiro, não de cada horário, e precisa ser a
  // primeira coisa visível, não a terceira camada de um formulário.
  // `time` continua sempre visível fora daqui — é o campo de âncora nos
  // dois modos.
  function renderFrequencyFields() {
    return (
      <>
        {scheduleKind === 'interval' ? (
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

      {/* Foto (2026-08-13; disponível também no cadastro desde 2026-09-07) */}
      <TouchableOpacity
        style={styles.photoCircle}
        onPress={handlePhotoPress}
        disabled={uploadingPhoto}
        accessibilityRole="button"
        accessibilityLabel={displayPhotoUri ? t('medicationForm.photoChangeLabel') : t('medicationForm.photoAddLabel')}
        accessibilityState={{ busy: uploadingPhoto }}
      >
        {uploadingPhoto ? (
          <ActivityIndicator color={colors.brand} />
        ) : displayPhotoUri ? (
          <Image source={{ uri: displayPhotoUri }} style={styles.photoImage} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.textMuted} />
            <Text style={styles.photoPlaceholderText}>{t('medicationForm.photoAddLabel')}</Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Foto escolhida mas ainda não enviada (cadastrando) — confirma
          pro idoso que ela não foi perdida, só vai subir junto do
          resto ao salvar (ver saveMedication). */}
      {isNew && localPhotoUri && (
        <Text style={styles.photoPendingHint}>{t('medicationForm.photoPendingHint')}</Text>
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
        // Achado real de uso (2026-09-05): abrir "novo remédio" exigia um
        // toque a mais só pra começar a digitar. Só na criação — ao
        // editar um remédio existente, abrir com o teclado já em pé em
        // cima dos dados que a pessoa quer primeiro conferir seria
        // pior, não melhor.
        autoFocus={isNew}
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
          nem rota nova. Só aparece ao criar; remédio já existente usa o
          bloco de estoque logo abaixo (item 13, 2026-09-07). */}
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

      {/* "Estoque editável na tela do remédio" (2026-09-07, item 13) —
          achado real do Rilson: dava pra ajustar o estoque pela aba
          Estoque, mas não editando o remédio diretamente. Mesmo padrão
          de Adicionar/Definir de app/(tabs)/stock.tsx — reaproveita
          `updateStock`, sem endpoint novo, editar aqui ou lá reflete no
          outro (mesmo dado, mesma tabela). */}
      {!isNew && (
        <>
          <Text style={styles.label}>{t('medicationForm.stockLabel')}</Text>
          {editingStock ? (
            <View style={styles.stockEditForm}>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={stockQty}
                  onChangeText={setStockQty}
                  keyboardType="decimal-pad"
                  placeholder={t('stock.quantityPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={t('stock.quantityLabel', { name: maskMedicationName(name, isPrivate) })}
                  autoFocus
                />
                <Text style={styles.stockUnit}>{stock?.unit}</Text>
              </View>
              <View style={styles.stockEditActions}>
                <TouchableOpacity
                  onPress={cancelStockEdit}
                  style={styles.cancelBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={addStockQty}
                  style={styles.stockAddBtn}
                  disabled={stockAction !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.addLabel', { name: maskMedicationName(name, isPrivate) })}
                  accessibilityState={{ busy: stockAction === 'add' }}
                >
                  {stockAction === 'add'
                    ? <ActivityIndicator color={colors.brand} size="small" />
                    : (
                      <>
                        <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                        <Text style={styles.stockAddBtnText}>{t('stock.add')}</Text>
                      </>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={setStockAbsolute}
                  style={styles.confirmBtn}
                  disabled={stockAction !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.setLabel', { name: maskMedicationName(name, isPrivate) })}
                  accessibilityState={{ busy: stockAction === 'set' }}
                >
                  {stockAction === 'set'
                    ? <ActivityIndicator color={colors.onBrand} size="small" />
                    : <Text style={styles.confirmBtnText}>{t('stock.set')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.stockCurrentText}>
                {isStockNeverSet(stock)
                  ? t('stock.neverSetHint')
                  : `${stock?.current_quantity ?? 0} ${stock?.unit ?? t('stock.defaultUnit')}`}
              </Text>
              <TouchableOpacity
                onPress={() => { setEditingStock(true); setStockQty(String(stock?.current_quantity ?? 0)); }}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel={t('stock.editLabel', { name: maskMedicationName(name, isPrivate) })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
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
            // hitSlop, não crescer o swatch (WCAG AAA, auditoria de toque
            // mínimo 2026-09-08) — 10px de `gap` entre vizinhos, então
            // 5px de cada lado é o máximo sem sobrepor a área de toque
            // do vizinho (evita selecionar a cor errada).
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
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
      <Text style={styles.sectionTitle}>{t('medicationForm.sectionSchedules')}</Text>

      {/* "Horário salva sozinho" (2026-09-07, item 12) — achado real do
          Rilson: diferente do resto do formulário (que só persiste ao
          tocar em "Salvar alterações"), cada horário já salva na hora
          (ver saveScheduleForm/confirmRemoveSchedule). Isso é
          intencional desde a Fase 2 — não muda a lógica agora, só deixa
          o modelo explícito, permanente na tela (o toast já confirma
          cada ação, mas passa rápido demais pra funcionar como
          explicação). Só faz sentido editando um remédio já existente —
          no cadastro (isNew) os horários são rascunho local até o botão
          final, igual ao resto do formulário. */}
      {!isNew && (
        <Text style={styles.fieldHint}>{t('medicationForm.scheduleAutosaveHint')}</Text>
      )}

      {/* "Horário fixo" vs "A cada X horas" (2026-09-07) — a primeira
          coisa que a pessoa decide na seção inteira, não mais algo
          escondido dentro do formulário de um horário individual (ver
          `scheduleKind`). Cards grandes de propósito — o público idoso
          do app não deveria precisar entender um chip pequeno pra
          entender a pergunta mais importante desta tela. */}
      <Text style={styles.label}>{t('medicationForm.scheduleKindQuestion')}</Text>
      <View style={styles.scheduleKindRow}>
        <TouchableOpacity
          style={[styles.scheduleKindCard, scheduleKind === 'fixed' && styles.scheduleKindCardActive]}
          onPress={() => requestScheduleKindChange('fixed')}
          accessibilityRole="button"
          accessibilityLabel={t('medicationForm.frequencyFixed')}
          accessibilityState={{ selected: scheduleKind === 'fixed' }}
        >
          <MaterialCommunityIcons name="clock-outline" size={26} color={scheduleKind === 'fixed' ? colors.onBrand : colors.textMuted} />
          <Text style={[styles.scheduleKindCardTitle, scheduleKind === 'fixed' && styles.scheduleKindCardTitleActive]}>
            {t('medicationForm.frequencyFixed')}
          </Text>
          <Text style={[styles.scheduleKindCardExample, scheduleKind === 'fixed' && styles.scheduleKindCardExampleActive]}>
            {t('medicationForm.frequencyFixedExample')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scheduleKindCard, scheduleKind === 'interval' && styles.scheduleKindCardActive]}
          onPress={() => requestScheduleKindChange('interval')}
          accessibilityRole="button"
          accessibilityLabel={t('medicationForm.frequencyInterval')}
          accessibilityState={{ selected: scheduleKind === 'interval' }}
        >
          <MaterialCommunityIcons name="timer-outline" size={26} color={scheduleKind === 'interval' ? colors.onBrand : colors.textMuted} />
          <Text style={[styles.scheduleKindCardTitle, scheduleKind === 'interval' && styles.scheduleKindCardTitleActive]}>
            {t('medicationForm.frequencyInterval')}
          </Text>
          <Text style={[styles.scheduleKindCardExample, scheduleKind === 'interval' && styles.scheduleKindCardExampleActive]}>
            {t('medicationForm.frequencyIntervalExample')}
          </Text>
        </TouchableOpacity>
      </View>

      {!isNew && (
        <>
          {/* "A cada X horas" já cobre o dia inteiro sozinho — não faz
              sentido oferecer um segundo horário de intervalo enquanto
              já existe um. */}
          {!addingSchedule && (scheduleKind === 'fixed' || schedules.length === 0) && (
            <View style={styles.scheduleAddRow}>
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={startAddSchedule}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.addScheduleLabel')}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                <Text style={styles.addScheduleBtnText}>{t('medicationForm.add')}</Text>
              </TouchableOpacity>
            </View>
          )}

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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScheduleToRemove(s)}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.removeLabel', { time: s.time, days: formatDays(s.days_of_week, t, s.interval_hours) })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
          {!addingDraft && editingDraftIndex === null && (scheduleKind === 'fixed' || draftSchedules.length === 0) && (
            <View style={styles.scheduleAddRow}>
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={startAddSchedule}
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.addScheduleLabel')}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.brand} />
                <Text style={styles.addScheduleBtnText}>{t('medicationForm.add')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Resposta direta a "quantas vezes tomar?" — um toque monta
              a lista toda; depois ajusta horário individual à vontade.
              Só faz sentido em modo fixo — "a cada X horas" já responde
              sozinho quantas vezes por dia. */}
          {scheduleKind === 'fixed' && (
            <>
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
            </>
          )}

          {/* Cadastrar sem horário nenhum (2026-09-07) — deliberadamente
              permitido: controlar que remédio tem em estoque é um uso
              válido por si só, sem precisar decidir horário agora. O
              aviso deixa claro que é uma escolha reconhecida, não um
              remédio "esquecido" sem lembrete algum. */}
          {draftSchedules.length === 0 && !addingDraft && editingDraftIndex === null && (
            <View style={styles.emptySchedules}>
              <MaterialCommunityIcons name="package-variant-closed" size={32} color={colors.textMuted} />
              <Text style={styles.emptySchedulesText}>{t('medicationForm.noSchedules')}</Text>
            </View>
          )}

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
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeDraft(index)}
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('medicationForm.removeLabel', { time: draft.time, days: summary })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

      {/* "Excluir medicamento" (2026-09-07, item 15) — achado real do
          Rilson: o serviço/rota de exclusão já existiam, sem botão em
          lugar nenhum da UI. Fica no fim da tela, de propósito menos
          chamativo que Salvar — ação permanente, não é pra ser a
          primeira coisa que a mão encontra. Só pro dono do perfil, igual
          Salvar (cuidador não deveria poder apagar remédio de quem
          cuida). */}
      {!isNew && activeProfile?.is_owner !== false && (
        <TouchableOpacity
          style={styles.deleteMedicationBtn}
          onPress={() => setConfirmingDelete(true)}
          accessibilityRole="button"
          accessibilityLabel={t('medicationForm.deleteMedication')}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
          <Text style={styles.deleteMedicationBtnText}>{t('medicationForm.deleteMedication')}</Text>
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
    <ConfirmDialog
      visible={!!pendingScheduleKind}
      title={t('medicationForm.scheduleKindChangeConfirmTitle')}
      message={t('medicationForm.scheduleKindChangeConfirmMessage')}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.confirm')}
      destructive
      busy={switchingScheduleKind}
      onCancel={() => setPendingScheduleKind(null)}
      onConfirm={confirmScheduleKindChange}
    />
    <ConfirmDialog
      visible={confirmingDelete}
      title={t('medicationForm.deleteConfirmTitle')}
      message={t('medicationForm.deleteConfirmMessage', { name: maskMedicationName(name, isPrivate) })}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('medicationForm.deleteMedication')}
      destructive
      busy={deleting}
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={confirmDeleteMedication}
    />
    <Modal
      visible={photoModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setPhotoModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('medicationForm.photoActionTitle')}</Text>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={() => {
              setPhotoModalVisible(false);
              pickPhoto('camera');
            }}
          >
            <MaterialCommunityIcons name="camera-outline" size={22} color={colors.brand} />
            <Text style={styles.modalOptionText}>{t('medicationForm.photoCamera')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={() => {
              setPhotoModalVisible(false);
              pickPhoto('gallery');
            }}
          >
            <MaterialCommunityIcons name="image-outline" size={22} color={colors.brand} />
            <Text style={styles.modalOptionText}>{t('medicationForm.photoGallery')}</Text>
          </TouchableOpacity>

          {displayPhotoUri && (
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setPhotoModalVisible(false);
                removePhoto();
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.error} />
              <Text style={[styles.modalOptionText, { color: colors.error }]}>
                {t('medicationForm.photoRemove')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.modalCancelButton}
            onPress={() => setPhotoModalVisible(false)}
          >
            <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
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
    // "Como você toma esse remédio?" (2026-09-07) — cards grandes de
    // propósito, não chips pequenos: é a decisão mais importante da
    // seção Horários, tem que ser impossível de perder de vista.
    scheduleKindRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    scheduleKindCard: {
      flex: 1, alignItems: 'center', gap: 6, padding: 16, borderRadius: 16,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
    },
    scheduleKindCardActive: { backgroundColor: c.brand, borderColor: c.brand },
    scheduleKindCardTitle: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'center' },
    scheduleKindCardTitleActive: { color: c.onBrand },
    scheduleKindCardExample: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
    scheduleKindCardExampleActive: { color: c.onBrand, opacity: 0.85 },
    // Antes esta linha também carregava o título "Horários" (agora fica
    // fixo acima dos cards de modo, valendo pros dois — fixo/intervalo
    // — não só um deles).
    scheduleAddRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, marginBottom: 12 },
    photoCircle: {
      width: 96, height: 96, borderRadius: 48, alignSelf: 'center', marginBottom: 20,
      backgroundColor: c.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    photoImage: { width: '100%', height: '100%' },
    photoPlaceholder: { alignItems: 'center', gap: 4 },
    photoPlaceholderText: { fontSize: 10, color: c.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 6 },
    photoPendingHint: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: -12, marginBottom: 20 },
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
    // minHeight 48 (WCAG AAA, 2026-09-08).
    pauseBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 12, padding: 13, marginTop: 10, minHeight: 48,
      borderWidth: 1.5, borderColor: c.border,
    },
    pauseBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    pauseBtnText: { color: c.textSecondary, fontWeight: '600', fontSize: 14 },
    pauseBtnTextActive: { color: c.onBrand },
    pausedNotice: {
      fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 8,
    },
    // "Excluir medicamento" (2026-09-07, item 15) — de propósito menos
    // chamativo que o botão Salvar acima (ação permanente, não deveria
    // ser fácil de tocar por engano), mas com toque mínimo de 48px
    // (WCAG AAA) igual ao resto do app.
    deleteMedicationBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginTop: 20, paddingVertical: 12, minHeight: 48,
    },
    deleteMedicationBtnText: { color: c.error, fontWeight: '600', fontSize: 14 },
    // minHeight 48 (WCAG AAA, 2026-09-08) — sozinho na própria linha,
    // sem vizinho apertado, cresce sem custo nenhum de layout.
    addScheduleBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48,
      backgroundColor: c.brandSubtle, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    },
    addScheduleBtnText: { color: c.brand, fontWeight: '600', fontSize: 13 },
    emptySchedules: {
      alignItems: 'center',
      paddingVertical: 20,
      paddingHorizontal: 16,
      gap: 8,
      backgroundColor: c.surfaceSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      marginBottom: 12,
    },
    emptySchedulesText: { color: c.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    scheduleCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: c.border,
    },
    scheduleInfo: { flex: 1 },
    scheduleTime: { fontSize: 17, fontWeight: '700', color: c.text },
    scheduleDays: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    // Ícones só (lápis/lixeira) numa fileira apertada — hitSlop, não
    // crescer a caixa visual (auditoria de toque mínimo, 2026-09-08).
    // marginLeft do deleteBtn subiu de 4 pra 14 (+ gap:12 do scheduleCard
    // = 26px de vão real) de propósito: com hitSlop de 10px nos dois,
    // cada um chega em 48px de área de toque sem as duas zonas se
    // sobreporem — evita tocar "excluir" tentando tocar "editar" (ou o
    // contrário) num remédio de idoso, risco real, não só estética.
    editBtn: { padding: 4 },
    deleteBtn: { padding: 4, marginLeft: 14 },
    addScheduleBox: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border, marginTop: 4,
    },
    addScheduleTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    // Exceção deliberada na auditoria de toque mínimo (2026-09-08): 7
    // círculos numa fileira só (dom-sáb) não cabem em 48px cada — nem
    // com a tela cheia de largura (~360-390px), 7×48px sozinho já
    // estoura o espaço disponível, sem sobrar nada pra gap ou padding
    // da tela. Forçar 48 aqui quebraria a fileira (overflow/wrap feio),
    // pior pra usabilidade do que manter os 38px. Mesmo padrão aceito
    // por seletores de dia da semana de calendário em geral (iOS
    // Lembretes, Google Agenda). `gap:6` entre eles ajuda a separar o
    // toque sem crescer o círculo.
    daysRow: { flexDirection: 'row', gap: 6, marginTop: 4, justifyContent: 'space-between' },
    dayBtn: {
      flex: 1,
      minWidth: 38, minHeight: 38, paddingHorizontal: 2, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    dayBtnActive: { backgroundColor: c.brand, borderColor: c.brand },
    dayBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    dayBtnTextActive: { color: c.onBrand },
    // Chips de atalho (presets de frequência/dias/intervalo, 2026-08-21)
    // — largura pelo conteúdo e quebra de linha, diferente dos botões
    // flex:1 acima: "4x por dia" não cabe espremido em quarto de tela.
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 6 },
    // minHeight 48 (WCAG AAA, 2026-09-08) — a fileira já quebra linha
    // (`flexWrap: 'wrap'` em presetRow), então crescer não aperta nada.
    presetChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, minHeight: 48,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    },
    presetChipActive: { backgroundColor: c.brand, borderColor: c.brand },
    presetChipText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
    presetChipTextActive: { color: c.onBrand },
    fieldHint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    addScheduleActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    // minHeight 48 + justifyContent nos 2 (WCAG AAA, auditoria de toque
    // mínimo 2026-09-08) — pares de botão de largura cheia (estoque,
    // formulário de horário), sem efeito colateral de layout ao crescer.
    cancelBtn: {
      flex: 1, padding: 12, borderRadius: 10,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', minHeight: 48,
    },
    cancelBtnText: { color: c.textSecondary, fontWeight: '600' },
    confirmBtn: {
      flex: 1, backgroundColor: c.brand, padding: 12, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center', minHeight: 48,
    },
    confirmBtnText: { color: c.onBrand, fontWeight: '600' },
    // Estoque editável na tela do remédio (2026-09-07, item 13) — mesmo
    // par Adicionar/Definir de app/(tabs)/stock.tsx, adaptado aos
    // estilos já existentes deste formulário.
    stockEditForm: { marginTop: 4, gap: 8 },
    stockUnit: { color: c.textSecondary, fontSize: 14, marginLeft: 8 },
    stockEditActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    stockAddBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      borderWidth: 1.5, borderColor: c.brand, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10, minHeight: 48,
    },
    stockAddBtnText: { color: c.brand, fontWeight: '600' },
    stockCurrentText: { flex: 1, fontSize: 16, color: c.brand, fontWeight: '600' },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 20,
      elevation: 5,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      marginBottom: 16,
      textAlign: 'center',
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.surfaceSecondary,
      marginBottom: 10,
    },
    modalOptionText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    // minHeight 48 + justifyContent (WCAG AAA, 2026-09-08).
    modalCancelButton: {
      marginTop: 4,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    modalCancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
    },
  });
}
