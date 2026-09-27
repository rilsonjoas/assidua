import { parseISO } from 'date-fns';
import * as Crypto from 'expo-crypto';

import { api } from './api';
import { Medication, DoseSchedule } from './medications';

export interface DoseLog {
  id: number | string; // 'pending_<scheduleId>' quando ainda não registrado
  /**
   * P4 (§10.4) — `dose_schedule_id` e `scheduled_at` ficaram ANULÁVEIS,
   * porque a dose de resgate (PRN) não tem horário previsto. Eles não
   * eram nuláveis por descuido: é o que a dose avulsa é.
   *
   * O tipo declarava `number` e `string` não-nulos, e foi exatamente
   * por isso que o bug do `null === null` na fila offline passou
   * batido: o compilador proibia representar uma PRN, então nenhuma
   * checagem de tipo apontava para o lugar onde a comparação já estava
   * errada. Um tipo que não consegue descrever um caso real do
   * domínio não está "te protegendo" — está escondendo.
   *
   * Regra de ouro: toda leitura destes dois campos que assume
   * "existe horário previsto" é um bug esperando. A dose de resgate
   * carrega `client_key` no lugar, e é por ele que ela é identificada.
   */
  dose_schedule_id: number | null;
  medication_id: number;
  profile_id: number;
  scheduled_at: string | null;
  /**
   * Identidade da dose de resgate, gerada no aparelho
   * (`expo-crypto`). Ausente/nula para dose agendada — a identidade dela
   * é `(dose_schedule_id, scheduled_at)`.
   *
   * Opcional de propósito, e não `string | null` obrigatório: a dose
   * agendada legitimamente não tem a chave, e os objetos montados no
   * cache otimista local simplesmente não a trazem. O discriminador
   * correto em qualquer lugar é por **truthiness** (`dose.client_key`),
   * e string vazia não é um UUID válido — então `undefined`, `null` e
   * `''` caem todos no mesmo braço, o da dose agendada.
   */
  client_key?: string | null;
  /**
   * Horário real da dose, ISO com fuso. `null` = não registrada.
   *
   * Para a dose de resgate é o ÚNICO horário que existe — e é sempre
   * preenchido (o servidor exige `taken_at` na PRN). Para a dose
   * agendada, pode ser nulo nos casos legítimos: "pulei", ou ninguém
   * registrou.
   */
  taken_at: string | null;
  /**
   * Vocabulário do BANCO, mais `unrecorded`.
   *
   * P2/§10.2: o Histórico passou a devolver **ocorrências**, não só
   * logs. Uma dose prevista que ninguém registrou não tem linha em
   * `dose_logs` — mas precisa aparecer, e o valor que ela carrega é
   * `unrecorded`. `pending` continua existindo no contrato porque a tela
   * Hoje usa.
   *
   * `state` (abaixo) é o vocabulário DERIVADO e é o que a interface
   * deve usar para dizer as coisas — `status` serve para filtro e
   * compatibilidade.
   */
  status: 'taken' | 'skipped' | 'missed' | 'pending' | 'unrecorded';
  /**
   * Estado derivado, o mesmo do relatório médico. É o campo que
   * distingue "ninguém registrou" de "o app marcou como perdida depois
   * da tolerância" — distinção que a interface **tem** que fazer, senão
   * volta a chamar de "perdida" uma dose que ninguém registrou.
   */
  state?: 'recorded' | 'skipped' | 'unrecorded' | 'marked_missed';
  notes: string | null;
  medication: Medication;
  /** P4: anulável — a dose de resgate não tem schedule. */
  dose_schedule: DoseSchedule | null;
  // Fase 2 (2026-08-11) — só presente na resposta do POST que marcou a
  // dose como tomada, e só quando essa ação especificamente completou o
  // dia E o streak resultante bate 7/30/60. null no resto do tempo.
  streak_milestone?: number | null;
  // Offline support (2026-08-17) — só existe no cache local otimista,
  // nunca vem da API. Marca uma dose que foi marcada/desmarcada sem
  // internet e ainda está na fila esperando sincronizar.
  _pendingSync?: boolean;
  // "Reação do cuidador" (2026-08-22) — presente só quando alguém já
  // reagiu a essa dose específica.
  reacted_at?: string | null;
  reacted_by_name?: string | null;
}

/**
 * Estado derivado de uma dose, no vocabulário do relatório.
 *
 * O backend já manda `state`, mas o app não pode **depender** disso para
 * ser correto: contra um backend uma versão atrás, ou contra o cache
 * offline, o campo não vem. E o fallback ingênuo — comparar `status` com
 * `'marked_missed'` — está **errado**, porque os dois vocabulários não
 * são o mesmo (`status: 'missed'` é o BANCO; `state: 'marked_missed'` é o
 * derivado). Por isso o mapeamento é explícito e mora aqui, num lugar só.
 */
export type DoseState = 'recorded' | 'skipped' | 'unrecorded' | 'marked_missed' | 'pending';

export function derivedState(log: Pick<DoseLog, 'status' | 'state'>): DoseState {
  if (log.state) return log.state;

  switch (log.status) {
    case 'taken':
      return 'recorded';
    case 'skipped':
      return 'skipped';
    case 'missed':
      return 'marked_missed';
    case 'unrecorded':
      return 'unrecorded';
    default:
      return 'pending';
  }
}

export interface AdherenceStreak {
  current_streak: number;
  best_streak: number;
}

// "Gráfico de adesão" (Fase 2, 2026-08-13).
export interface WeeklyAdherencePoint {
  week_start: string;
  week_end: string;
  percentage: number | null;
  taken: number;
  due: number;
}

export async function getTodayDoses(profileId: number): Promise<DoseLog[]> {
  const { data } = await api.get(`/profiles/${profileId}/doses/today`);
  return data;
}

export async function getAdherenceStreak(profileId: number): Promise<AdherenceStreak> {
  const { data } = await api.get(`/profiles/${profileId}/streak`);
  return data;
}

export async function getWeeklyAdherence(profileId: number): Promise<WeeklyAdherencePoint[]> {
  const { data } = await api.get(`/profiles/${profileId}/weekly-adherence`);
  return data;
}

// "Calendário de adesão" (v1.3, aprovado 2026-09-02) — um dia por linha.
export interface DailyAdherencePoint {
  date: string;
  percentage: number | null;
  taken: number;
  due: number;
}

// `month` no formato "AAAA-MM"; sem ele, o backend usa o mês atual no
// fuso do perfil (ver DoseLogController::dailyAdherence).
export async function getDailyAdherence(profileId: number, month?: string): Promise<DailyAdherencePoint[]> {
  const { data } = await api.get(`/profiles/${profileId}/daily-adherence`, { params: month ? { month } : {} });
  return data;
}

// "Resumo pra consulta" (2026-08-23) — não é o histórico de uso, é o
// documento pra levar ao médico: % do período + quais doses faltaram.
// P1 (2026-09-25, ROADMAP §8.1) — o resumo passou a distinguir os
// casos, e o documento do médico é feito a partir disso.
//
// `state` é FACTUAL, não julgamento (decisão X3): nada aqui diz
// "atrasado". O relatório mostra o horário previsto E o real, e quem lê
// conclui. Antes o backend não expunha `taken_at` nenhum — o médico
// recebia só um número de "tomadas" e nenhuma hora.
export type DoseReportState = 'recorded' | 'skipped' | 'unrecorded' | 'marked_missed';

export interface ConsultationSummaryDose {
  medication_name: string;
  medication_id?: number;
  /**
   * Horário previsto, ISO com fuso.
   *
   * P4 (§10.4): `null` na dose de resgate. Ela não tem horário previsto,
   * e o par (nulo, preenchido) é a assinatura do terceiro caso do
   * relatório — é por isso que `new Date(scheduled_at)` não pode ser
   * chamado sem olhar este campo antes: com `null` sairia "Invalid Date"
   * no PDF do médico.
   */
  scheduled_at: string | null;
  /** Horário real, ISO com fuso. `null` = não foi registrada. */
  taken_at: string | null;
  state: DoseReportState;
  note?: string | null;
  /** P4: presente e `true` só na dose de resgate. */
  is_rescue?: boolean;
  /** P4: a chave de idempotência da dose de resgate. */
  client_key?: string | null;
}

export interface ConsultationSummary {
  period_days: number;
  period_start: string;
  period_end: string;
  percentage: number | null;
  taken: number;
  due: number;
  /**
   * P4/D13: quantas das `taken` vieram de dose de resgate. Sem este
   * campo, `taken` maior que `due` (e o percentual no teto de 100%)
   * parece bug em vez de regra.
   */
  rescue?: number;
  missed: (ConsultationSummaryDose & { reason: string })[];
  /**
   * Todas as ocorrências do período, não só as perdidas.
   * OBRIGATÓRIO (P1/§9.2) — ver o comentário equivalente em
   * `ReportData`. O backend já devolve; o que faltava era o app usar.
   */
  doses: ConsultationSummaryDose[];
  /**
   * `true` = houve dose prevista e nenhuma ficou de fora.
   * `null` = não há o que afirmar (`due === 0`). O relatório **não** pode
   * dizer "todas tomadas" nesse caso (ROADMAP §9.5).
   */
  all_taken?: boolean | null;
}

// `medicationId` (2026-09-08, item 16) — opcional: sem ele, comportamento
// idêntico a antes (resumo de todos os remédios do perfil).
export async function getConsultationSummary(profileId: number, days: number, medicationId?: number): Promise<ConsultationSummary> {
  const { data } = await api.get(`/profiles/${profileId}/consultation-summary`, {
    params: { days, medication_id: medicationId },
  });
  return data;
}

export interface HistoryFilters {
  status?: 'taken' | 'skipped' | 'missed';
  medication_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
}

// Marcador de troca de fuso (2026-09-11, entrevista de decisões de
// horário — ver ROADMAP.md, item 6/20) — devolvido junto do histórico
// (chave nova no mesmo response, não uma tabela de dose_logs).
export interface TimezoneChangeEntry {
  old_timezone: string;
  new_timezone: string;
  changed_at: string;
}

export interface HistoryResponse {
  data: DoseLog[];
  timezone_changes: TimezoneChangeEntry[];
  /**
   * Total de registros no período, vindo do paginador do Laravel
   * (`paginate(50)`, DoseLogController:237). O app pede `page: 1` fixo,
   * então `data` é só a primeira página — e `total` é o que permite à
   * tela dizer que está mostrando um recorte em vez de esconder isso
   * atrás de um "% de adesão" que parece medir o todo (9.5c).
   */
  total?: number;
  current_page?: number;
  last_page?: number;
  per_page?: number;
  [key: string]: unknown;
}

export async function getDoseHistory(profileId: number, filters: HistoryFilters = {}): Promise<HistoryResponse> {
  const { data } = await api.get(`/profiles/${profileId}/doses/history`, {
    params: { page: 1, ...filters },
  });
  return data;
}

/**
 * Edita **só** a nota de uma dose (P3, 2026-09-25).
 *
 * Rota dedicada no backend em vez de reenviar por `logDose`: o `logDose`
 * é `updateOrCreate`, e reenviar a dose inteira para mexer num campo de
 * texto reescreveria `taken_at`/`status` e could disparar o marco de
 * streak de novo. O endpoint `updateNote` toca `notes` e nada mais.
 */
export async function updateDoseNote(doseLogId: number | string, notes: string | null): Promise<DoseLog> {
  const { data } = await api.patch(`/dose-logs/${doseLogId}/note`, { notes });
  return data;
}

/** Campos que toda dose registrada carrega, avulsa ou não. */
interface LogDoseBase {
  medication_id: number;
  profile_id: number;
  notes?: string;
}

/**
 * P4 (§10.4) — o contrato de `POST /dose-logs` virou uma união, e é
 * uma união **de verdade**: o servidor faz XOR entre "agendada" e
 * "avulsa" e rejeita o híbrido, que na primeira versão do P4 era
 * aceito e duplicava a dose agendada. Um `interface` com tudo opcional
 * descreveria o híbrido — que é justamente o que não pode existir.
 */
export type LogDosePayload =
  | (LogDoseBase & {
      dose_schedule_id: number;
      scheduled_at: string;
      taken_at?: string;
      status: 'taken' | 'skipped' | 'missed';
      client_key?: never;
    })
  | (LogDoseBase & {
      client_key: string;
      taken_at: string;
      status: 'taken';
      dose_schedule_id?: never;
      scheduled_at?: never;
    });

/**
 * Dia a que a dose pertence, como `'AAAA-MM-DD'`.
 *
 * P4: a dose de resgate não tem horário previsto, então o dia dela é o
 * dia em que foi **tomada**. Uma PRN tomada às 23:50 pertence àquele
 * dia — e é isso que o paciente espera ver no Histórico, mesmo que ele
 * já esteja no dia seguinte. Usar "hoje" aqui colocaria a dose na
 * seção errada e a adesão do dia sairia errada junto.
 *
 * O recorte é `slice(0, 10)` sobre o ISO, o mesmo dos dois campos, e
 * por isso herda a mesma convenção deles: o backend serializa
 * `scheduled_at` e `taken_at` na hora local do perfil, sem deslocamento
 * de fuso. Trocar isto por `new Date(...)` mudaria o dia de quem mora
 * em fuso negativo.
 *
 * O fallback (`''`) é um estado impossível por contrato do servidor: a
 * dose agendada exige `scheduled_at` e a de resgate exige `taken_at`.
 * Ele existe para a função devolver `string` e não obrigar cada chamada
 * a lidar com um `null` que a contrato nenhum — e o chamador trata
 * dia vazio, em vez de o registro sumir calado.
 */
export function dayOfDose(dose: { scheduled_at?: string | null; taken_at?: string | null }): string {
  return (dose.scheduled_at ?? dose.taken_at ?? '').slice(0, 10);
}

/**
 * O instante PREVISTO de uma dose — só para os caminhos que existem
 * quando há horário.
 *
 * Preferi isto a espalhar `as string` pelos chamadores. O `as` é
 * exatamente o que escondeu o bug do P4: ele cala o compilador no ponto
 * onde a suposição "esta dose tem horário" deixa de ser verdade, e o
 * `null` só apareceria em produção, como `Invalid Date` na tela. Aqui a
 * suposição é checada num lugar só, e falha alto.
 *
 * Os caminhos que usam esta função — "Tomei", "Pulei", "Foi em outro
 * horário", "Ajustar horário" — são, por definição, de dose PREVISTA: a
 * Home lista ocorrências de horário, e a dose de resgate tem entrada
 * própria (§10.4), que passa a hora real e nunca chega aqui.
 */
export function scheduledInstantOf(dose: { scheduled_at: string | null }): Date {
  if (!dose.scheduled_at) {
    throw new Error('scheduledInstantOf() em dose de resgate: não há horário previsto (§10.4)');
  }
  return parseISO(dose.scheduled_at);
}

export async function logDose(payload: LogDosePayload): Promise<DoseLog> {
  const { data } = await api.post('/dose-logs', payload);
  return data;
}

/**
 * Identidade de uma dose de resgate, gerada no aparelho.
 *
 * `expo-crypto` e não `Math.random()`: o valor vira coluna e é a chave de
 * idempotência do registro no servidor (DoseLog.client_key). Se dois
 * registros distintos acabassem com a mesma chave, um sobrescreveria o
 * outro e o paciente perderia um histórico de saúde **sem erro nenhum**.
 * Não é ameaça de segurança — nada de autorização depende desse valor,
 * o servidor confere dono e `is_prn` de qualquer forma — mas é
 * integridade de dado, e o jeito barato de/getting isso errado é
 * justamente `Math.random()`.
 */
export function newPrnClientKey(): string {
  const key = Crypto.randomUUID();
  // A `client_key` é o que torna o reenvio idempotente (§10.4): sem ela,
  // uma dose de resgate registrada offline e drenada da fila vira uma
  // SEGUNDA dose no servidor — duplicidade silenciosa em histórico de
  // saúde. Se `randomUUID()` falhar (módulo nativo ausente, por
  // exemplo), devolver `undefined` aqui significaria mandar a dose sem
  // chave nenhuma e o servidor rejeitar com 422 genérico, ou — pior —
  // aceitar e não deduplicar. Falhar aqui é mais honesto.
  if (!key) {
    throw new Error('Não foi possível gerar a client_key da dose de resgate');
  }
  return key;
}

// Corrigir dose (Fase 1 do roadmap) — desmarcar um "Tomei"/"Pulei" feito
// por engano. `id` só é um número de verdade quando a dose já foi
// registrada (ver comentário em DoseLog.id acima); undoDose só deve ser
// chamado nesse caso.
export async function undoDose(doseLogId: number): Promise<void> {
  await api.delete(`/dose-logs/${doseLogId}`);
}

// "Reação do cuidador" (2026-08-22) — 1 toque, sem chat.
export async function reactToDose(doseLogId: number): Promise<DoseLog> {
  const { data } = await api.post(`/dose-logs/${doseLogId}/react`);
  return data;
}
