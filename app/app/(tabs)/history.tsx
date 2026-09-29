import { useState, useMemo } from 'react';
import {
  View,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday, Locale } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useProfileStore } from '../../store/profileStore';
import { listPending, type PrnLogPayload } from '../../services/offlineQueue';
import { useAuthStore } from '../../store/authStore';
import { usePrivacyStore } from '../../store/privacyStore';
import { maskMedicationName } from '../../lib/privacy';
import { generateConsultationReportHtml } from '../../lib/reportHtml';
import { exportConsultationReportPdf } from '../../lib/reportPdf';
import { getDoseHistory, getWeeklyAdherence, getConsultationSummary, derivedState, dayOfDose, updateDoseNote, DoseLog, HistoryFilters, HistoryResponse, TimezoneChangeEntry } from '../../services/doses';
import { getMedications, formatDosageUnit } from '../../services/medications';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import { ThemeColors } from '../../constants/theme';
import { ProfileContextBar } from '../../components/ProfileContextBar';
export { ErrorBoundary } from '../../components/ErrorBoundary';
import { SkeletonList } from '../../components/Skeleton';
import { LoadErrorState } from '../../components/LoadErrorState';
import { AppText as Text } from '../../components/AppText';
import { AdherenceChart } from '../../components/AdherenceChart';
import { AdherenceCalendar } from '../../components/AdherenceCalendar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAlertDialog } from '../../hooks/useAlertDialog';
import { rounded, spacing, type } from '../../constants/tokens';

type StatusFilter = 'all' | 'taken' | 'skipped' | 'missed';

const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;
const DATE_FORMAT: Record<string, string> = {
  pt: "EEEE, d 'de' MMMM",
  es: "EEEE, d 'de' MMMM",
  en: 'EEEE, MMMM d',
};

function sectionTitle(dateStr: string, lang: string, t: (key: string) => string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return t('history.today');
  if (isYesterday(date)) return t('history.yesterday');
  const locale = DATE_FNS_LOCALES[lang as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
  return format(date, DATE_FORMAT[lang] ?? DATE_FORMAT.pt, { locale });
}

// Linha do Histórico — dose ou evento de sistema (2026-09-11, entrevista
// de decisões de horário — ver ROADMAP.md, item 6/20). "Misturado no
// feed do Histórico" — intercalado por data, não numa seção à parte.
export type HistoryRow =
  | { kind: 'dose'; id: string | number; log: DoseLog }
  | { kind: 'timezoneChange'; id: string; entry: TimezoneChangeEntry }
  /**
   * P4/§10.4 — dose de resgate registrada OFFLINE, que só existe na
   * fila: o servidor ainda nunca viu esse registro.
   *
   * Precisa ser uma linha à parte, e não um `log` sintetizado, porque
   * ela não tem `id` de servidor — e o `id` é o que a tela usa para
   * abrir o editor de nota e para desfazer. Uma dose sem servidor que
   * se passasse por dose real faria o "editar nota" gravar em cima de
   * um registro que não existe.
   */
  | { kind: 'pendingPrn'; id: string; payload: PrnLogPayload };

/**
 * O instante a mostrar de uma dose do relatório: o previsto, ou — quando
 * não há horário previsto (a dose de resgate do P4) — o real.
 *
 * Sem isto, `parseISO(null)` daria uma Data inválida e a linha sairia
 * "Invalid Date" no texto que vai para o paciente e para o médico.
 */
function formatWhen(
  dose: { scheduled_at: string | null; taken_at: string | null },
  pattern: string,
  locale: Locale,
): string {
  const base = dose.scheduled_at ?? dose.taken_at;
  return base ? format(parseISO(base), pattern, { locale }) : '—';
}

function groupByDate(
  logs: DoseLog[],
  timezoneChanges: TimezoneChangeEntry[],
  lang: string,
  t: (key: string) => string,
  pendingPrn: PrnLogPayload[] = [],
): { title: string; data: HistoryRow[] }[] {
  const map = new Map<string, HistoryRow[]>();
  for (const log of logs) {
    // P4: `dayOfDose` porque a dose de resgate não tem horário previsto —
    // o dia dela é o dia em que foi tomada. Ver o comentário da função
    // sobre por que isto NÃO é `new Date()`.
    const key = dayOfDose(log);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ kind: 'dose', id: log.id, log });
  }
  // P4: a dose de resgate pendente entra pelo dia do `taken_at` que a
  // fila guardou — o mesmo dia que `dayOfDose` usaria depois que ela
  // sincronizar, então a linha não "pula" de dia ao sincronizar.
  for (const payload of pendingPrn) {
    const key = payload.taken_at.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ kind: 'pendingPrn', id: `pending-${payload.client_key}`, payload });
  }
  for (const entry of timezoneChanges) {
    const key = entry.changed_at.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ kind: 'timezoneChange', id: `tz-${entry.changed_at}`, entry });
  }
  return Array.from(map.entries()).map(([date, data]) => ({
    title: sectionTitle(date + 'T00:00:00', lang, t),
    data,
  }));
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfileStore();
  const { isPrivate } = usePrivacyStore();
  // Relatório em PDF virou exclusivo Pro (2026-09-08, decisão do
  // Rilson) — "Compartilhar resumo" (texto simples, mesmos dados)
  // continua livre pra todo mundo; só o PDF em si pede upgrade. Sem
  // gate no backend de propósito: o dado por trás (consultation
  // summary) já é o mesmo que "Compartilhar resumo" expõe de graça —
  // aqui é decisão de produto (qual botão exige Pro), não fronteira de
  // segurança/dado sensível.
  const isPro = useAuthStore((s) => s.user?.subscription_tier === 'pro');
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [medicationFilter, setMedicationFilter] = useState<number | 'all'>('all');
  // "Filtro de remédio vira seletor com busca" (2026-09-08) — achado
  // real do Rilson testando no aparelho: com muitos remédios cadastrados
  // (16+, incluindo itens de primeiros socorros como gaze/álcool), a
  // parede de chips de larguras bem diferentes virava uma bagunça
  // visual difícil de escanear — ruim pro público idoso do app. Um
  // botão só, que abre uma lista com busca, escala bem melhor.
  const [medicationPickerVisible, setMedicationPickerVisible] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState('');

  const { data: medications = [] } = useQuery({
    queryKey: ['medications', activeProfile?.id],
    queryFn: () => getMedications(activeProfile!.id),
    enabled: !!activeProfile,
  });

  // O gráfico herda o tratamento de estado do calendário (2026-09-28):
  // sem `isLoading`/`isError`, `data = []` num erro de rede fazia
  // `AdherenceChart` devolver `null` — o gráfico sumia sem explicação,
  // que é o mesmo erro do calendário em outra forma: em vez de mentir
  // ("não tomou nada"), calava. Agora ele diz que não conseguiu.
  const { data: weeklyAdherence = [], isLoading: weeklyLoading, isError: weeklyError, refetch: refetchWeekly } = useQuery({
    queryKey: ['weekly-adherence', activeProfile?.id],
    queryFn: () => getWeeklyAdherence(activeProfile!.id),
    enabled: !!activeProfile,
  });

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'taken', label: t('history.filterTaken') },
    { key: 'skipped', label: t('history.filterSkipped') },
    { key: 'missed', label: t('history.filterMissed') },
  ];

  // `unrecorded` NÃO pode cair no fallback de `missed`. P2/§10.2: o
  // Histórico devolve ocorrências, e uma dose prevista que ninguém
  // registrado chega aqui com `unrecorded`. Sem esta entrada, o
  // `?? STATUS_CONFIG.missed` de baixo a pintaria de VERMELHO com o
  // rótulo "Perdida" — que é exatamente a mentira que o P1 e o P2
  // existem para tirar. A diferença importa: "ninguém registrou" é
  // ausência de informação, e "marcada como perdida" é um veredito do
  // app depois da tolerância de 24 h.
  const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = {
    taken: { label: t('history.filterTaken'), color: '#22c55e', icon: 'check-circle' },
    skipped: { label: t('history.filterSkipped'), color: '#f59e0b', icon: 'minus-circle' },
    missed: { label: t('history.filterMissed'), color: '#ef4444', icon: 'close-circle' },
    // Cinza, não vermelho: o app não sabe o que aconteceu.
    unrecorded: { label: t('history.statusUnrecorded'), color: '#94a3b8', icon: 'help-circle-outline' },
    pending: { label: t('history.filterPending'), color: '#94a3b8', icon: 'clock-outline' },
  };

  const filters: HistoryFilters = {};
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (medicationFilter !== 'all') filters.medication_id = medicationFilter;
  const hasActiveFilter = statusFilter !== 'all' || medicationFilter !== 'all';

  // "Filtro de remédio vira seletor com busca" (2026-09-08) — o botão
  // mostra a própria seleção atual ("Todos os remédios" ou o nome do
  // remédio filtrado), então não precisa de rótulo redundante do lado.
  const selectedMedication = medicationFilter !== 'all' ? medications.find((m) => m.id === medicationFilter) : null;
  const selectedMedicationLabel = selectedMedication
    ? maskMedicationName(selectedMedication.name, isPrivate)
    : t('history.filterAllMedications');
  const filteredMedications = medications.filter((m) =>
    maskMedicationName(m.name, isPrivate).toLowerCase().includes(medicationSearch.trim().toLowerCase()),
  );

  function selectMedicationFilter(value: number | 'all') {
    setMedicationFilter(value);
    setMedicationPickerVisible(false);
    setMedicationSearch('');
  }

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['history', activeProfile?.id, filters],
    queryFn: () => getDoseHistory(activeProfile!.id, filters),
    enabled: !!activeProfile,
  });

  const logs: DoseLog[] = data?.data ?? [];
  const timezoneChanges: TimezoneChangeEntry[] = data?.timezone_changes ?? [];

  // P4/§10.4 — as doses de resgate que estão só na fila.
  //
  // O `applyPendingOverlay` (usado na Home) só SOBREPÕE doses que o
  // servidor já conhece; ele não inventa linha nenhuma. Sem esta query,
  // quem registrasse um resgate sem sinal veria o toast de "salvou" e
  // depois ABRIRIA O HISTÓRICO sem a dose — o produto affirmando com
  // convicção que o registro não existe, bem depois de ter dito que
  // salvou. A fila é a fonte da verdade até o servidor assumir.
  const { data: pendingPrn = [] } = useQuery({
    queryKey: ['pending-prn', activeProfile?.id],
    queryFn: async () => {
      const all = await listPending();
      return all
        .filter((a): a is typeof a & { type: 'log' } => a.type === 'log')
        .map((a) => a.payload as PrnLogPayload)
        .filter((p) => !('dose_schedule_id' in p) && p.profile_id === activeProfile!.id);
    },
    enabled: !!activeProfile,
  });

  const sections = useMemo(
    () => groupByDate(logs, timezoneChanges, i18n.language, t, pendingPrn),
    [logs, timezoneChanges, i18n.language, pendingPrn],
  );

  // ── P3: editar a nota na linha do histórico ──
  //
  // Segunda parte da decisão do Rilson ("modal + linha do histórico"). A
  // linha é onde a pessoa **volta** pra conferir, e é onde ela lembra do
  // que aconteceu. Sem isto, a nota era escrita uma única vez e nunca
  // mais podia ser corrigida — inclusive quando a pessoa lembra do
  // detalhe no dia seguinte.
  //
  // `onMutate` com rollback: a lista é atualizada na hora (senão a nota
  // salva levaria um refetch para aparecer, e pareceria que não salvou).
  const queryClient = useQueryClient();
  const [editingNoteId, setEditingNoteId] = useState<number | string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number | string; notes: string | null }) => updateDoseNote(id, notes),
    onMutate: async ({ id, notes }) => {
      await queryClient.cancelQueries({ queryKey: ['history', activeProfile?.id] });
      const anterior = queryClient.getQueryData(['history', activeProfile?.id]);
      queryClient.setQueryData<HistoryResponse>(['history', activeProfile?.id], (old) =>
        old
          ? {
              ...old,
              data: old.data.map((l) => (l.id === id ? { ...l, notes } : l)),
            }
          : old,
      );
      return { anterior };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback: a nota volta ao que era. Sem isto, uma falha de rede
      // deixaria na tela um relato que **não** foi salvo — e essa nota
      // vai para o médico. É o pior tipo de bug possível neste campo.
      if (ctx?.anterior) {
        queryClient.setQueryData(['history', activeProfile?.id], ctx.anterior);
      }
      showAlert(t('common.error'), t('history.noteSaveError'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['history', activeProfile?.id] });
    },
  });

  function startEditingNote(log: DoseLog) {
    setEditingNoteId(log.id);
    setEditingNoteText(log.notes ?? '');
  }

  function saveNote(log: DoseLog) {
    const id = editingNoteId;
    setEditingNoteId(null);
    if (id === null) return;
    const texto = editingNoteText.trim();
    if (texto === (log.notes ?? '')) return; // nada mudou
    updateNoteMutation.mutate({ id, notes: texto === '' ? null : texto });
  }

  const takenCount = logs.filter((l) => l.status === 'taken').length;
  const totalCount = logs.length;
  // 9.5b (2026-09-25) — "Perdidas" era `totalCount - takenCount`, que na
  // verdade é `skipped + missed`: **pular de propósito virava "perdida"**.
  // E o relatório do médico exclui `skipped` por decisão explícita
  // ("decisão informada não é falha", GenerateConsultationSummary:120-123).
  // As duas telas discordavam sobre a mesma dose. Agora o número é o
  // número: só o que o app registrou como perdida.
  // Só o que o app **julgou** como perdido. `unrecorded` é dose prevista
  // sem registro — ausência de informação, não veredito — e somada a ela aqui
  // o número voltaria a ser falso pelo outro caminho.
  const missedCount = logs.filter((l) => derivedState(l) === 'marked_missed').length;
  // `skipped` fica FORA do numerador e DENTRO do denominador — a
  // semântica do relatório (`percentage = totalTaken / totalDue`, e skipped
  // não vira `missed` mas também não conta como tomada).
  const adherence = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : null;

  // 9.5c (2026-09-25), **por enquanto** — o % acima é sobre os
  // `totalCount` registros **carregados**, e o app pede `page: 1` fixo
  // (`services/doses.ts:154`), ou seja, os 50 mais recentes. Lido como
  // "adesão do histórico", mente. A correção de raiz é estrutural
  // (derivação por ocorrência + paginação de verdade) e está na **P2**;
  // inventar denominador aqui seria pior que admitir a dívida. O que dá
  // pra fazer agora é **não deixar o número mentir em silêncio**: o
  // paginador do Laravel já devolve `total`, então a tela diz que está
  // mostrando um recorte.
  const historyTotal = typeof data?.total === 'number' ? data.total : null;
  const isPartialHistory = historyTotal !== null && historyTotal > totalCount;

  // "PDF respeita o filtro da tela" (2026-09-08, item 16) — achado real
  // do Rilson: o relatório sempre saía fixo (todos os remédios),
  // ignorando o filtro por medicamento visível aqui. Nome mascarado só
  // no que entra no relatório (payload), não no diálogo de confirmação
  // — que mostra pra própria pessoa o que ela mesma selecionou.
  // (`selectedMedication` reaproveitado do seletor de filtro acima.)
  const [confirmingPrint, setConfirmingPrint] = useState(false);
  const [sharingSummary, setSharingSummary] = useState(false);
  const { showAlert, alertDialog } = useAlertDialog();
  async function handleShareSummary() {
    if (!activeProfile) return;
    setSharingSummary(true);
    try {
      const summary = await getConsultationSummary(activeProfile.id, 30);
      const dateLocale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;
      // P4: a dose de resgate nunca entra em `missed` (ninguém falhou
      // nela), mas o payload é o mesmo das demais e `scheduled_at` ficou
      // anulável — daí o tratamento. `formatWhen` centraliza a regra
      // "usa o previsto, ou o real se não houver".
      const missedLines = summary.missed
        .map((m) => `• ${maskMedicationName(m.medication_name, isPrivate)} — ${formatWhen(m, "d 'de' MMMM, HH:mm", dateLocale)}`)
        .join('\n');
      const message = t('history.consultationSummaryText', {
        profileName: activeProfile.name,
        percentage: summary.percentage ?? 0,
        taken: summary.taken,
        due: summary.due,
        missedList: missedLines || t('history.consultationSummaryNoMissed'),
      });
      await Share.share({ message });
    } catch (err: any) {
      console.error('[shareSummary error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), err.response?.data?.message ?? err.message ?? t('history.consultationSummaryError'));
    } finally {
      setSharingSummary(false);
    }
  }

  // "PDF respeita o filtro da tela" (2026-09-08, item 16) — pede
  // confirmação nomeando o recorte antes de gerar, em vez de aplicar o
  // filtro em silêncio. `requestPrintReport` abre o diálogo;
  // `handlePrintReport` é o que de fato gera, chamado só depois de
  // confirmar.
  function requestPrintReport() {
    if (!activeProfile) return;
    if (!isPro) {
      showAlert(t('history.pdfProTitle'), t('history.pdfProMessage'), {
        label: t('history.pdfProAction'),
        onPress: () => router.push('/pro'),
      });
      return;
    }
    setConfirmingPrint(true);
  }

  async function handlePrintReport() {
    setConfirmingPrint(false);
    if (!activeProfile) return;
    setSharingSummary(true);
    try {
      const medicationId = selectedMedication?.id;
      const summary = await getConsultationSummary(activeProfile.id, 30, medicationId);
      await exportConsultationReportPdf({
        profileName: activeProfile.name,
        periodDays: 30,
        percentage: summary.percentage,
        taken: summary.taken,
        due: summary.due,
        // P4/D13: mesma armadilha do `doses` acima, um passo adiante. O
        // campo é OBRIGATÓRIO em `ReportData`, então o compilador trava
        // este envio se alguém esquecer.
        rescue: summary.rescue ?? 0,
        // P1/§9.2 (2026-09-25) — ESTE era o gap de integração. O backend
        // passou a devolver `doses` (todas as ocorrências, com horário
        // previsto E real) e o HTML do PDF passou a usar, mas esta
        // chamada não repassava nada disso. Resultado: o relatório
        // melhorado existia, os testes da lib passavam, e o app continuava
        // gerando o PDF antigo. Os campos agora são OBRIGATÓRIOS em
        // `ReportData` justamente para o compilador impedir isso de
        // voltar em silêncio.
        // `doses` é OBRIGATÓRIO no tipo (senão o compilador deixava
        // passar o esquecimento), mas o `?? []` continua aqui de
        // propósito: o app fala com um backend já implantado, que pode
        // estar uma versão atrás. Sem isto, `summary.doses.map` estoura
        // e o usuário fica sem relatório nenhum — pior que o relatório
        // antigo. O contrato forte é o tipo; isto é só não derrubar a
        // tela.
        doses: (summary.doses ?? []).map((d) => ({
          ...d,
          // Privacidade: `doses` traz o nome do remédio, igual ao
          // `missed` acima. Mascarar só o `missed` vazava o nome no
          // relatório em modo privado.
          medication_name: maskMedicationName(d.medication_name, isPrivate),
        })),
        periodStart: summary.period_start ?? null,
        periodEnd: summary.period_end ?? null,
        allTaken: summary.all_taken ?? null,
        missed: summary.missed.map((m) => ({
          ...m,
          medication_name: maskMedicationName(m.medication_name, isPrivate),
        })),
        medications: (selectedMedication ? [selectedMedication] : medications).map((m) => ({
          name: maskMedicationName(m.name, isPrivate),
          dosage: m.dosage,
          unit: m.unit,
          schedules: m.schedules,
        })),
        medicationName: selectedMedication ? maskMedicationName(selectedMedication.name, isPrivate) : null,
      });
    } catch (err: any) {
      console.error('[printReport error]', err);
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        Sentry.captureException(err);
      }
      showAlert(t('common.error'), err.response?.data?.message ?? err.message ?? t('history.consultationSummaryError'));
    } finally {
      setSharingSummary(false);
    }
  }

  return (
    <View style={styles.container}>
      <ProfileContextBar />
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, isWide && styles.listWide]}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {adherence !== null && (
              <View style={styles.summaryCard}>
                {/* `accessible` + `accessibilityLabel` em cada item, com os
                    textos internos escondidos. Sem isso o leitor de tela
                    anuncia os nós soltos — "1", "2", "60%", "Tomadas",
                    "Perdidas", "Adesão" — e quem não vê não tem como
                    saber que o "1" é o valor de "Perdidas". O rótulo
                    combinado diz a mesma coisa, inteira, e é por ele que
                    os testes do 9.5b conferem o número. */}
                <View
                  style={styles.summaryItem}
                  accessible
                  accessibilityLabel={t('history.summaryItemLabel', { label: t('history.summaryTaken'), value: takenCount })}
                >
                  <Text style={styles.summaryValue} importantForAccessibility="no" accessibilityElementsHidden>
                    {takenCount}
                  </Text>
                  <Text style={styles.summaryLabel} importantForAccessibility="no" accessibilityElementsHidden>
                    {t('history.summaryTaken')}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View
                  style={styles.summaryItem}
                  accessible
                  accessibilityLabel={t('history.summaryItemLabel', { label: t('history.summaryMissed'), value: missedCount })}
                >
                  <Text style={styles.summaryValue} importantForAccessibility="no" accessibilityElementsHidden>
                    {missedCount}
                  </Text>
                  <Text style={styles.summaryLabel} importantForAccessibility="no" accessibilityElementsHidden>
                    {t('history.summaryMissed')}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View
                  style={styles.summaryItem}
                  accessible
                  accessibilityLabel={t('history.summaryItemLabel', { label: t('history.summaryAdherence'), value: `${adherence}%` })}
                >
                  <Text
                    style={[styles.summaryValue, { color: adherence >= 80 ? colors.success : colors.warning }]}
                    importantForAccessibility="no"
                    accessibilityElementsHidden
                  >
                    {adherence}%
                  </Text>
                  <Text style={styles.summaryLabel} importantForAccessibility="no" accessibilityElementsHidden>
                    {t('history.summaryAdherence')}
                  </Text>
                </View>
              </View>
            )}

            {isPartialHistory && (
              // 9.5c — diz o que o % acima está medindo. Enquanto a P2
              // não vier, pelo menos o número não é lido como "adesão do
              // histórico inteiro" sem aviso.
              <Text style={styles.summaryScope}>
                {t('history.summaryPartialScope', { shown: totalCount, total: historyTotal ?? 0 })}
              </Text>
            )}

            <AdherenceChart
              data={weeklyAdherence}
              isLoading={weeklyLoading}
              isError={weeklyError}
              onRetry={refetchWeekly}
            />

            {activeProfile && <AdherenceCalendar profileId={activeProfile.id} />}

            <View style={[styles.consultationButtonsRow, isWide && styles.consultationButtonsRowWide]}>
              {/* Selo "PRO" visível (2026-09-08) — pra quem não é Pro não
                  ser pego de surpresa só ao tocar; a mesma informação já
                  está no diálogo que abre (`requestPrintReport`), isso
                  aqui é só adiantar o aviso. */}
              <TouchableOpacity
                style={[styles.consultationButton, styles.consultationPdfButton]}
                onPress={requestPrintReport}
                disabled={sharingSummary}
                accessibilityRole="button"
                accessibilityLabel={isPro ? t('history.exportPdf') : t('history.exportPdfLockedLabel')}
              >
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.onBrand} />
                <Text style={styles.consultationPdfButtonText}>{t('history.exportPdf')}</Text>
                {!isPro && (
                  <View style={styles.proBadge}>
                    <MaterialCommunityIcons name="star" size={11} color="#fbbf24" />
                    <Text style={styles.proBadgeText}>{t('profile.pro')}</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.consultationButton}
                onPress={handleShareSummary}
                disabled={sharingSummary}
                accessibilityRole="button"
                accessibilityLabel={t('history.shareConsultationSummary')}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.brand} />
                <Text style={styles.consultationButtonText}>{t('history.shareConsultationSummary')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filtersWrapper}>
              {/* Rótulos acima de cada grupo (2026-09-08, achado de UX
                  revendo o app de verdade) — sem eles, dois filtros
                  independentes empilhados pareciam um só grupo confuso,
                  fácil de não perceber que dá pra filtrar por status E
                  por remédio ao mesmo tempo. */}
              <Text style={styles.filterGroupLabel}>{t('history.filterStatusLabel')}</Text>
              <View style={styles.filterWrapGroup}>
                {STATUS_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                    onPress={() => setStatusFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.filterLabel', { label: f.label })}
                    accessibilityState={{ selected: statusFilter === f.key }}
                  >
                    <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {medications.length > 0 && (
                <>
                  <Text style={[styles.filterGroupLabel, { marginTop: spacing.md }]}>{t('history.filterMedicationLabel')}</Text>
                  {/* "Filtro de remédio vira seletor com busca"
                      (2026-09-08) — achado real testando no aparelho: com
                      16+ remédios (incluindo itens de primeiros socorros
                      como gaze/álcool), a parede de chips de larguras bem
                      diferentes virava uma bagunça visual difícil de
                      escanear. Um botão só, que mostra a seleção atual e
                      abre uma lista com busca, escala bem melhor. */}
                  <TouchableOpacity
                    style={styles.medicationFilterButton}
                    onPress={() => setMedicationPickerVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.medicationFilterButtonLabel', { label: selectedMedicationLabel })}
                  >
                    {selectedMedication && (
                      <View style={[styles.medicationChipDot, { backgroundColor: selectedMedication.color }]} />
                    )}
                    <Text style={styles.medicationFilterButtonText} numberOfLines={1}>
                      {selectedMedicationLabel}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          /* 9.7 — a lista vazia por falha de rede mostrava "nenhum
             registro encontrado", que é a mesma coisa que o filtro não
             casou com nada. Quem está filtrando por "Perdidas" e não vê
             nenhuma achava que não tinha nenhuma perdida. */
          isError ? (
            <LoadErrorState onRetry={() => refetch()} message={t('history.loadErrorText')} />
          ) : isLoading ? (
            <SkeletonList lines={2} />
          ) : (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {hasActiveFilter ? t('history.emptyFiltered') : t('history.emptyGeneric')}
              </Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderBox}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.brand} />
            <Text style={styles.sectionHeader}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          // Marcador de troca de fuso (2026-09-11, item 6/20) — evento de
          // sistema, não uma dose; linha visualmente diferente (sem
          // horário/status de dose, ícone próprio), mas no MESMO feed.
          if (item.kind === 'timezoneChange') {
            const { entry } = item;
            return (
              <View
                style={styles.timezoneChangeRow}
                accessible
                accessibilityLabel={t('history.timezoneChangeLabel', {
                  old: entry.old_timezone,
                  new: entry.new_timezone,
                })}
              >
                <MaterialCommunityIcons name="earth" size={16} color={colors.textMuted} />
                <Text style={styles.timezoneChangeText}>
                  {t('history.timezoneChangeText', { old: entry.old_timezone, new: entry.new_timezone })}
                </Text>
              </View>
            );
          }

          // P4/§10.4 — dose de resgate ainda só na fila. Ela aparece
          // com a hora real, marcada como "aguardando internet": o
          // registro NÃO está no servidor, e dizer "tomado" sem
          // qualifier seria o app afirmando uma coisa que ele ainda não
          // conseguiu confirmar em lugar nenhum.
          if (item.kind === 'pendingPrn') {
            const payload = item.payload;
            const med = medications.find((m) => m.id === payload.medication_id);
            const pendingTime = format(parseISO(payload.taken_at), 'HH:mm');
            const pendingName = maskMedicationName(med?.name ?? '', isPrivate);
            return (
              <View
                style={styles.rowPrn}
                accessible
                accessibilityLabel={t('prn.historyLabel', { name: pendingName, time: pendingTime })}
                accessibilityHint={t('prn.pendingToast', { name: pendingName })}
              >
                <View style={styles.timeBox}>
                  <Text style={styles.time}>{pendingTime}</Text>
                </View>
                <View style={[styles.colorBar, { backgroundColor: med?.color ?? colors.textMuted }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.medName}>{pendingName}</Text>
                  <Text style={styles.dosage}>{t('prn.pendingBadge')}</Text>
                </View>
                <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={colors.textMuted} />
              </View>
            );
          }

          const log = item.log;
          const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.missed;
          // Bug real reportado pelo Rilson (2026-09-09): dose registrada
          // via "Outro horário" (horário diferente do agendado) mostrava
          // aqui o horário AGENDADO original, nunca o horário real digitado
          // — parecia "horário errado" porque, tecnicamente, era o horário
          // errado pra quem queria ver quando tomou de verdade. `taken_at`
          // existe pra toda dose tomada (inclusive as no horário certo,
          // onde os dois batem quase sempre) — mostrar ele quando existir
          // é sempre mais correto que o agendado.
          // P4: a dose de resgate não tem horário previsto, mas tem
          // `taken_at` sempre (o servidor exige), então ela cai no
          // primeiro ramo e mostra a hora real — que é a única que
          // existe. O `—` cobre o estado impossível (nenhum dos dois),
          // visível em vez de `parseISO(null)` estourando a tela.
          const instante = log.status === 'taken' && log.taken_at ? log.taken_at : log.scheduled_at;
          const time = instante ? format(parseISO(instante), 'HH:mm') : '—';
          const maskedName = maskMedicationName(log.medication.name, isPrivate);
            // P3 (2026-09-25) — a linha é **um** nó de acessibilidade
            // (nome, dose, horário, status, nota), e a ação de editar a
            // nota é exposta como `accessibilityActions` da própria linha.
            //
            // A primeira tentativa foi tirar o `accessible` da linha para
            // o botão virar alcançável — e isso quebrava o empilhamento
            // visual, porque a nota vive *dentro* do bloco de nome. A
            // solução certa é o padrão do próprio React Native: a linha
            // continua sendo um nó, e ganha uma **ação** que o leitor de
            // tela anuncia e executa. O botão visual continua ali para o
            // toque, e quem não enxerga não fica de fora.
          return (
            <View
              style={styles.row}
              accessible
              accessibilityLabel={t('history.rowLabel', {
                name: maskedName,
                dosageUnit: formatDosageUnit(log.medication.dosage, log.medication.unit),
                time,
                status: cfg.label,
                ...(log.notes ? { note: log.notes } : {}),
              })}
              accessibilityActions={[{ name: 'activate', label: t(log.notes ? 'history.noteEdit' : 'history.noteAdd') }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'activate') startEditingNote(log);
              }}
            >
              <View style={styles.rowTop}>
                <View style={styles.timeBox}>
                  <Text style={styles.time}>{time}</Text>
                </View>
                <View style={[styles.colorBar, { backgroundColor: log.medication.color }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.medName}>{maskedName}</Text>
                  <Text style={styles.dosage}>
                    {formatDosageUnit(log.medication.dosage, log.medication.unit)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: cfg.color + '1f' }]}>
                  <MaterialCommunityIcons name={cfg.icon} size={18} color={cfg.color} />
                  <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
                {/* P3 (2026-09-25) — a nota por escrito finalmente aparece.
                    A API sempre aceitou `notes` e o app nunca mostrou:
                    ninguém conseguia ver o que tinha anotado, nem quando
                    era para o médico. O texto também entra no
                    `rowLabel` acima, para não ser informação só de quem
                    enxerga — a nota costuma ser a única pista de uma
                    reação adversa, e é exatamente quem usa leitor de
                    tela que mais precisa dela. */}
                {editingNoteId === log.id ? (
                  // Edição **inline**, não um modal: a nota já está
                  // visível na linha, e abrir outro modal para editar três
                  // palavras é atrito sem motivo. Confirmar é pelo teclado
                  // (blur) e há botão explícito também — porque nem todo
                  // mundo tem teclado aberto.
                  <View style={styles.noteEditRow}>
                    <TextInput
                      style={styles.noteEditInput}
                      value={editingNoteText}
                      onChangeText={setEditingNoteText}
                      placeholder={t('home.notePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      maxLength={500}
                      autoFocus
                      accessibilityLabel={t('history.noteEditAccessibilityLabel')}
                      onSubmitEditing={() => saveNote(log)}
                      onBlur={() => saveNote(log)}
                    />
                    <TouchableOpacity
                      style={styles.noteIconBtn}
                      onPress={() => saveNote(log)}
                      accessibilityRole="button"
                      accessibilityLabel={t('history.noteSave')}
                      disabled={updateNoteMutation.isPending}
                    >
                      <MaterialCommunityIcons name="check" size={22} color={colors.brand} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noteIconBtn}
                      onPress={() => setEditingNoteId(null)}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.cancel')}
                    >
                      <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {!!log.notes && <Text style={styles.rowNote}>{log.notes}</Text>}
                    {/* "Anotar" é sempre visível, mesmo sem nota. Esconder
                        atrás de toque longo seria função sem pista
                        visual — e a nota é a única forma de a pessoa
                        corrigir o registro com a própria voz. */}
                    <TouchableOpacity
                      style={styles.noteAddBtnHit}
                      onPress={() => startEditingNote(log)}
                      accessibilityRole="button"
                      accessibilityLabel={t('history.noteAdd')}
                    >
                      <Text style={styles.noteAddBtn}>
                        {log.notes ? t('history.noteEdit') : t('history.noteAdd')}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
            </View>
          );
        }}
      />
      <ConfirmDialog
        visible={confirmingPrint}
        title={t('history.printConfirmTitle')}
        message={
          selectedMedication
            ? t('history.printConfirmMessageFiltered', { name: maskMedicationName(selectedMedication.name, isPrivate) })
            : t('history.printConfirmMessageAll')
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={t('history.printConfirmAction')}
        busy={sharingSummary}
        onCancel={() => setConfirmingPrint(false)}
        onConfirm={handlePrintReport}
      />
      {/* "Filtro de remédio vira seletor com busca" (2026-09-08) —
          mesmo padrão visual de action sheet já usado no app (ex.: foto
          do medicamento), adaptado pra caber busca + lista rolável em
          vez de poucas opções fixas. */}
      <Modal
        visible={medicationPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMedicationPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>{t('history.medicationPickerTitle')}</Text>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder={t('history.medicationSearchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={medicationSearch}
              onChangeText={setMedicationSearch}
              accessibilityLabel={t('history.medicationSearchAccessibilityLabel')}
            />
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.pickerRow, medicationFilter === 'all' && styles.pickerRowActive]}
                onPress={() => selectMedicationFilter('all')}
                accessibilityRole="button"
                accessibilityLabel={t('history.filterAllMedications')}
                accessibilityState={{ selected: medicationFilter === 'all' }}
              >
                <Text style={[styles.pickerRowText, medicationFilter === 'all' && styles.pickerRowTextActive]}>
                  {t('history.filterAllMedications')}
                </Text>
                {medicationFilter === 'all' && <MaterialCommunityIcons name="check" size={20} color={colors.brand} />}
              </TouchableOpacity>
              {filteredMedications.map((m) => {
                const maskedMedName = maskMedicationName(m.name, isPrivate);
                const active = medicationFilter === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => selectMedicationFilter(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={maskedMedName}
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.medicationChipDot, { backgroundColor: m.color }]} />
                    <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive, { flex: 1 }]}>
                      {maskedMedName}
                    </Text>
                    {active && <MaterialCommunityIcons name="check" size={20} color={colors.brand} />}
                  </TouchableOpacity>
                );
              })}
              {filteredMedications.length === 0 && (
                <Text style={styles.pickerEmptyText}>{t('history.medicationSearchEmpty')}</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.pickerCancelButton}
              onPress={() => setMedicationPickerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.pickerCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {alertDialog}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerContainer: { paddingBottom: spacing.sm },
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      borderRadius: rounded.lg,
      paddingVertical: spacing.lg,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: type.metric, fontWeight: '700', color: c.text },
    summaryLabel: { fontSize: type.micro, fontWeight: '600', color: c.textMuted, marginTop: spacing.xs },
    summaryScope: { fontSize: type.microTight, color: c.textMuted, textAlign: 'center', marginTop: -8, marginBottom: spacing.md },
    rowNote: { fontSize: type.microTight, color: c.textMuted, fontStyle: 'italic', marginTop: spacing.xxs },
    noteAddBtn: { fontSize: type.microTight, color: c.brand, fontWeight: '600', marginTop: spacing.xs },
    noteEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
    noteEditInput: {
      flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: rounded.md, padding: spacing.sm, fontSize: type.caption, color: c.text, minHeight: 44,
    },
    summaryDivider: { width: 1, backgroundColor: c.border, marginVertical: spacing.xs },
    consultationButtonsRow: {
      flexDirection: 'column',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    consultationButtonsRowWide: {
      flexDirection: 'row',
    },
    consultationButton: {
      width: '100%',
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 50,
      borderRadius: rounded.lg,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    consultationButtonText: { color: c.brand, fontSize: type.label, fontWeight: '700', textAlign: 'center' },
    consultationPdfButton: { backgroundColor: c.brand, borderColor: c.brand },
    consultationPdfButtonText: { color: c.onBrand, fontSize: type.label, fontWeight: '700', textAlign: 'center' },
    proBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xxs,
      backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: rounded.sm,
      paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs,
    },
    proBadgeText: { color: c.onBrand, fontSize: type.micro, fontWeight: '700' },
    filtersWrapper: { marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.md },
    filterWrapGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: rounded.xxl,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.border,
      minHeight: 48,
    },
    // Vocabulário de chip consolidado (2026-09-08, achado de UX
    // registrado hoje mais cedo) — antes era o único chip pequeno do
    // app usando tingimento (`brandSubtle`) em vez de preenchimento
    // sólido; `sortChip` (Remédios) e `presetChip` (formulário de
    // remédio) já usavam preenchimento sólido pra esse mesmo formato
    // (pílula pequena). `brandSubtle` continua certo pra CARTÕES/LINHAS
    // maiores (tema, formato de exportação, opção da lista de
    // cuidadores) — ali sim o preenchimento sólido pesaria demais.
    filterChipActive: { backgroundColor: c.brand, borderColor: c.brand },
    filterChipText: { fontSize: type.caption, fontWeight: '600', color: c.textMuted },
    filterChipTextActive: { color: c.onBrand, fontWeight: '700' },
    medicationChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    medicationChipDot: { width: 10, height: 10, borderRadius: rounded.sm },
    filterGroupLabel: { fontSize: type.micro, fontWeight: '700', color: c.textMuted, marginBottom: spacing.sm },
    medicationFilterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: rounded.lg,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.border,
      minHeight: 48,
    },
    medicationFilterButtonText: { flex: 1, fontSize: type.label, fontWeight: '600', color: c.text },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    pickerContent: {
      backgroundColor: c.surface,
      borderRadius: rounded.lg,
      padding: spacing.lg,
      maxHeight: '80%',
    },
    pickerTitle: { fontSize: type.critical, fontWeight: '700', color: c.text, marginBottom: spacing.md },
    pickerSearchInput: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: rounded.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: type.label,
      color: c.text,
      marginBottom: spacing.sm,
      minHeight: 48,
    },
    pickerList: { maxHeight: 320 },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: rounded.md,
      minHeight: 48,
    },
    pickerRowActive: { backgroundColor: c.brandSubtle },
    pickerRowText: { fontSize: type.label, fontWeight: '600', color: c.text },
    pickerRowTextActive: { color: c.brand, fontWeight: '700' },
    pickerEmptyText: {
      textAlign: 'center',
      color: c.textMuted,
      fontSize: type.caption,
      paddingVertical: spacing.xl,
    },
    pickerCancelButton: {
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: rounded.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      backgroundColor: c.background,
    },
    pickerCancelText: { fontSize: type.label, fontWeight: '700', color: c.textMuted },
    // Marcador de troca de fuso (2026-09-11) — linha discreta, sem o
    // aparato de horário/status de uma dose (não é uma dose), mas
    // sempre no mesmo feed por data.
    timezoneChangeRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    },
    timezoneChangeText: { fontSize: type.micro, color: c.textMuted, flex: 1 },
    list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
    listWide: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.sm },
    sectionHeaderBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: c.background,
    },
    sectionHeader: {
      fontSize: type.label,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.2,
    },
    // A linha tem DUAS faixas (P3, 2026-09-25): `rowTop` é a faixa de
    // cima — hora, barra de cor, nome, dose, badge de status, tudo em
    // linha, que é o que permite varrer a lista. A nota e a ação de
    // editar ficam ABAIXO, dentro do próprio `row` (que agora é
    // `column`).
    //
    // Bug corrigido em 2026-09-28: `row` estava em `column` e `rowTop`
    // nunca era aplicado — os dois estilos existiam, documentados, e
    // órfãos. Resultado: hora, nome, dose, nota e badge empilhavam
    // verticalmente, e a lista inteira virava uma coluna de cartões
    // em vez de linhas escaneáveis. Para quem precisa varrer o
    // histórico, isso é a diferença entre ler e garimpar.
    rowTop: { flexDirection: 'row', alignItems: 'center' },
    rowA11y2: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    row: {
      flexDirection: 'column',
      backgroundColor: c.surface,
      borderRadius: rounded.lg,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      marginBottom: spacing.sm,
    },
    // Alvo de 44×44 (NBR 17060 5.1.2.13 / WCAG 2.1 2.5.5 AAA) para os
    // dois botões de nota. Antes eram só o ícone de 22px, sem
    // `minHeight` — o `TextInput` vizinho já tinha 44, e os dois botões
    // ao lado dele é que estavam espremidos. Confirmar e cancelar nota
    // é justamente o caminho de quem não usa teclado.
    noteIconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    noteAddBtnHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    // A dose de resgate (P4) é sempre uma faixa única — hora, nome,
    // badge de pendência. Não tem nota nem status, então não usa a
    // estrutura de duas faixas nem o `rowTop`.
    rowPrn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: rounded.lg,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      marginBottom: spacing.sm,
    },
    timeBox: { paddingHorizontal: spacing.md, alignItems: 'center', minWidth: 60 },
    time: { fontSize: type.body, fontWeight: '700', color: c.brand },
    colorBar: { width: 5, alignSelf: 'stretch' },
    rowBody: { flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md },
    medName: { fontSize: type.body, fontWeight: '700', color: c.text },
    dosage: { fontSize: type.caption, color: c.textMuted, marginTop: spacing.xs },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: rounded.xl,
      marginRight: spacing.md,
    },
    statusLabel: { fontSize: type.micro, fontWeight: '700' },
    emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.huge, gap: spacing.md },
    emptyTitle: { fontSize: type.section, fontWeight: '700', color: c.textSecondary },
    emptyText: { fontSize: type.label, color: c.textMuted, textAlign: 'center', lineHeight: 22 },
  });
}
