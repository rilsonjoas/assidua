import * as SQLite from 'expo-sqlite';

// Offline support (2026-08-17) — fila local de doses marcadas sem
// internet. Achado ao investigar o backend antes de implementar: o
// endpoint de criação (DoseLogController::store) já faz
// `updateOrCreate` pela chave (dose_schedule_id + scheduled_at), não
// pelo id do log — reenviar a mesma ação 2x nunca duplica, só
// sobrescreve. Por isso a fila só guarda o payload de sempre, sem
// precisar de nenhuma chave de idempotência nova no backend.
//
// P4 (§10.4) — o segundo colapso. A dose **de resgate** (PRN) não tem
// horário previsto: `dose_schedule_id` e `scheduled_at` são AMBOS
// nulos. A identidade que esta fila usava era o par desses dois campos —
// e `null === null` é `true`. Consequência, se a PRN chegasse aqui sem
// tratamento: o `find` do `applyPendingOverlay` casaria a primeira ação
// de resgate pendente com **todas** as doses de resgate do dia, e o
// histórico mostraria "tomado" em muitas doses que ninguém tomou. Não
// é um bug de exibição boba: é o app affirmando, com convicção, algo
// falso sobre a saúde de alguém.
//
// A correção é estrutural, não um `if`: a identidade de uma dose passa
// a ser um tipo discriminado (`DoseIdentity`) que carrega OU o par
// (schedule, horário) OU o `client_key` do PRN, e há **uma** função
// (`identityMatchesDose`) que compara. Não dá para o `null === null`
// reaparecer num canto sem aparecer em todos, porque não existe mais
// lugar nenhum onde os dois lados sejam comparados diretamente.
//
// "undo" é diferente: precisa de um id real de dose_log, que só existe
// depois de sincronizado. Uma dose marcada e desfeita ainda offline
// (antes de qualquer sync) nunca chega a virar uma ação "undo" — ver
// cancelPendingLog() abaixo, chamada nesse caso específico pra só
// remover a ação "log" da fila, sem nunca contatar o servidor.

interface BaseLogPayload {
  medication_id: number;
  profile_id: number;
  notes?: string;
}

/**
 * Dose com horário previsto. A identidade continua
 * `(dose_schedule_id, scheduled_at)`, e `client_key` é proibido pelo
 * tipo: o servidor rejeita o híbrido (§10.4 — o híbrido era aceito na
 * primeira versão e duplicava a dose agendada).
 */
export interface ScheduledLogPayload extends BaseLogPayload {
  dose_schedule_id: number;
  scheduled_at: string;
  taken_at?: string;
  status: 'taken' | 'skipped' | 'missed';
  client_key?: never;
}

/**
 * Dose de resgate (PRN). Sem horário previsto, então a identidade é o
 * `client_key` gerado no aparelho. `taken_at` é obrigatório e o status
 * só pode ser `taken` — "pular" uma dose de resgate não significa nada
 * (se não precisou, não registra), e é isso que o servidor exige.
 */
export interface PrnLogPayload extends BaseLogPayload {
  client_key: string;
  taken_at: string;
  status: 'taken';
  dose_schedule_id?: never;
  scheduled_at?: never;
}

export type LogActionPayload = ScheduledLogPayload | PrnLogPayload;

/**
 * Como uma dose é identificada, dos dois jeitos possíveis. Este é o
 * único tipo que as funções de consulta da fila aceitam: ele torna
 * impossível perguntar "esta dose de resgate está pendente?" passando
 * `null, null` — que era exatamente o buraco.
 */
export type DoseIdentity =
  | { kind: 'scheduled'; dose_schedule_id: number; scheduled_at: string }
  | { kind: 'prn'; client_key: string };

/** Campos que a comparação precisa, no formato que o servidor devolve. */
type DoseLike = {
  dose_schedule_id: number | null;
  scheduled_at: string | null;
  client_key?: string | null;
};

/**
 * Extrai a identidade de um payload enfileirado.
 *
 * O fallback para o par (schedule, horário) quando não há `client_key`
 * é **proposital**: quem tinha o app instalado antes do P4 tem linhas
 * JSON antigas na fila local, sem `client_key`. Se este campo passasse
 * a ser obrigatório sem fallback, essas linhas virariam lixo na
 * sincronização — o pior desfecho possível para quem estava offline
 * justo quando.installou a versão antiga.
 */
function identityOf(payload: LogActionPayload): DoseIdentity {
  if ('client_key' in payload && payload.client_key) {
    return { kind: 'prn', client_key: payload.client_key };
  }

  const agendada = payload as ScheduledLogPayload;
  return {
    kind: 'scheduled',
    dose_schedule_id: agendada.dose_schedule_id,
    scheduled_at: agendada.scheduled_at,
  };
}

/**
 * A comparação única entre "identidade pendente" e "dose da lista".
 *
 * Note o que NÃO acontece aqui: os dois lados nunca são comparados como
 * `a === b` em campos que possam ser nulo. No braço de resgate compara-se
 * `client_key` (string dos dois lados, garantida pelo tipo). No braço
 * agendado, os campos não-null vêm garantidos pelo próprio
 * `DoseIdentity`.
 */
function identityMatchesDose(identity: DoseIdentity, dose: DoseLike): boolean {
  if (identity.kind === 'prn') {
    return typeof identity.client_key === 'string' && dose.client_key === identity.client_key;
  }

  return dose.dose_schedule_id === identity.dose_schedule_id && dose.scheduled_at === identity.scheduled_at;
}

/** Verdadeiro quando o payload enfileirado é da mesma dose dada. */
function payloadMatchesDose(payload: LogActionPayload, dose: DoseLike): boolean {
  return identityMatchesDose(identityOf(payload), dose);
}

/**
 * Presents uma `DoseIdentity` no formato de `DoseLike`, para que a mesma
 * comparação sirva tanto "pendente vs dose da lista" (overlay) quanto
 * "pendente vs pendente" (`cancelPendingLog`/`hasPendingLog`, onde não
 * há dose nenhuma, só a identidade procurada).
 *
 * Ela também garante que os dois formatos não se confundam: uma
 * identidade de resgate vira `client_key` + campos nulos, e vice-versa,
 * então comparar uma contra a outra dá `false` em vez de `true` por
 * causa de nulos batendo com nulos.
 */
function identityToDoseLike(identity: DoseIdentity): DoseLike {
  return identity.kind === 'prn'
    ? { dose_schedule_id: null, scheduled_at: null, client_key: identity.client_key }
    : { dose_schedule_id: identity.dose_schedule_id, scheduled_at: identity.scheduled_at, client_key: null };
}

/**
 * Identidade de uma dose que veio do servidor, ou `null` se a dose não
 * tiver identidade nenhuma (não deveria acontecer — uma dose prevista
 * tem schedule, e uma registrada tem `client_key`).
 *
 * A UI precisa disto antes de chamar `cancelPendingLog`/`hasPendingLog`:
 * é o que garante que um botão de desfazer nunca seja montado com
 * `null, null` por descuido.
 */
export function identityOfDose(dose: DoseLike): DoseIdentity | null {
  if (dose.client_key) {
    return { kind: 'prn', client_key: dose.client_key };
  }
  if (dose.dose_schedule_id !== null && dose.scheduled_at !== null) {
    return { kind: 'scheduled', dose_schedule_id: dose.dose_schedule_id, scheduled_at: dose.scheduled_at };
  }
  return null;
}

export interface UndoActionPayload {
  dose_log_id: number;
}

export interface PendingAction {
  local_id: number;
  type: 'log' | 'undo';
  payload: LogActionPayload | UndoActionPayload;
  created_at: string;
  // Retry limitado (2026-09-11, achado real do Rilson: dose descartada
  // silenciosamente num erro real do servidor, sem tentar de novo nem
  // avisar ninguém) — conta quantas vezes esta ação JÁ falhou com erro
  // real (não falta de rede, essa já reintenta sozinha via
  // `startAutoSync`/NetInfo). Ver `services/sync.ts`.
  retry_count: number;
}

const DB_NAME = 'offline_queue.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_actions (
          local_id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      // Migração local (2026-09-11) — quem já tinha o app instalado
      // antes disto tem a tabela SEM esta coluna; `ADD COLUMN` falha
      // com "duplicate column" se já existir (reinstalação/segunda
      // abertura), por isso o try/catch — mesmo padrão simples de
      // migração local que outros apps RN/SQLite usam, sem precisar de
      // framework de migração só pra 1 coluna nova.
      try {
        await db.execAsync('ALTER TABLE pending_actions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;');
      } catch {
        // Coluna já existe — instalação que já tinha passado por aqui antes.
      }
      return db;
    });
  }
  return dbPromise;
}

export async function enqueueLog(payload: LogActionPayload): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO pending_actions (type, payload, created_at) VALUES (?, ?, ?)',
    'log',
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

export async function enqueueUndo(payload: UndoActionPayload): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO pending_actions (type, payload, created_at) VALUES (?, ?, ?)',
    'undo',
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

// Chamado quando o usuário desfaz uma dose que ainda está só na fila
// local (nunca chegou a sincronizar) — em vez de enfileirar um "undo",
// simplesmente cancela a ação "log" pendente daquela dose. Assim o
// servidor nunca chega a saber de uma dose que foi marcada e desmarcada
// inteiramente offline.
//
// P4: recebe uma `DoseIdentity` em vez de dois positionais. A assinatura
// antiga não tinha como representar a dose de resgate: não existia
// "schedule" nem "horário" a passar. Passar `null, null` seria
// exatamente o bug do `null === null`.
export async function cancelPendingLog(identity: DoseIdentity): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ local_id: number; payload: string }>(
    "SELECT local_id, payload FROM pending_actions WHERE type = 'log'",
  );
  const match = rows.find((r) => {
    const p = JSON.parse(r.payload) as LogActionPayload;
    return identityMatchesDose(identityOf(p), identityToDoseLike(identity));
  });
  if (!match) return false;
  await db.runAsync('DELETE FROM pending_actions WHERE local_id = ?', match.local_id);
  return true;
}

export async function hasPendingLog(identity: DoseIdentity): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM pending_actions WHERE type = 'log'",
  );
  const alvo = identityToDoseLike(identity);
  return rows.some((r) => {
    const p = JSON.parse(r.payload) as LogActionPayload;
    return identityMatchesDose(identityOf(p), alvo);
  });
}

export async function listPending(): Promise<PendingAction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    local_id: number;
    type: 'log' | 'undo';
    payload: string;
    created_at: string;
    retry_count: number;
  }>('SELECT local_id, type, payload, created_at, retry_count FROM pending_actions ORDER BY local_id ASC');
  return rows.map((r) => ({
    local_id: r.local_id,
    type: r.type,
    payload: JSON.parse(r.payload),
    created_at: r.created_at,
    retry_count: r.retry_count,
  }));
}

export async function removePending(localId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_actions WHERE local_id = ?', localId);
}

// Retry limitado (2026-09-11) — chamado só quando a ação chegou a ter
// resposta do servidor e foi um erro REAL (não falta de rede). Mantém
// na fila (não remove) pra tentar de novo na próxima sincronização —
// `services/sync.ts` decide quando desistir de vez com base neste
// contador.
export async function incrementRetryCount(localId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE pending_actions SET retry_count = retry_count + 1 WHERE local_id = ?', localId);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pending_actions');
  return row?.count ?? 0;
}

// Sobrepõe ações ainda não sincronizadas por cima da resposta real da
// API — sem isso, fechar o app ainda offline e reabrir faria uma dose
// já marcada "voltar" a aparecer pendente até a fila drenar (a resposta
// do servidor não tem como saber de uma ação que só existe no SQLite
// local). `doses` já vem no formato de DoseLog (import evitado aqui de
// propósito, pra não criar dependência circular com services/doses.ts).
//
// P4: o genérico passou a admitir `dose_schedule_id`/`scheduled_at`
// nulos e `client_key`, porque a dose de resgate é exatamente isso. E a
// comparação é a `payloadMatchesDose` — antes ela comparava os dois
// campos diretamente, o que num dose de resgate dava `null === null`
// e o `find` devolvia a PRIMEIRA ação pendente para TODAS as doses de
// resgate da lista.
//
// Limite conhecido e deliberado: o overlay só alcança doses que o
// servidor já conhece. Uma dose de resgate registrada offline ainda
// não existe lá (não há horário previsto que a gere), então ela não
// entra nesta lista — a UI do P4 precisa renderizar as PRNs pendentes a
// partir de `listPending()`, e é isso que a tela de Remédios vai fazer.
export async function applyPendingOverlay<T extends {
  id: number | string;
  dose_schedule_id: number | null;
  scheduled_at: string | null;
  client_key?: string | null;
  status: string;
}>(doses: T[]): Promise<T[]> {
  const pending = await listPending();
  if (pending.length === 0) return doses;

  return doses.map((dose) => {
    const undo = pending.find(
      (p) => p.type === 'undo' && (p.payload as UndoActionPayload).dose_log_id === dose.id,
    );
    if (undo) {
      // Undo enfileirado ainda não sincronizou — reflete a reversão na
      // hora (é o que o usuário viu ao tocar), marcado como pendente.
      return { ...dose, status: 'pending', _pendingSync: true } as T & { _pendingSync: boolean };
    }

    const log = pending.find((p) => p.type === 'log' && payloadMatchesDose(p.payload as LogActionPayload, dose));
    if (log) {
      const payload = log.payload as LogActionPayload;
      return { ...dose, status: payload.status, _pendingSync: true } as T & { _pendingSync: boolean };
    }

    return dose;
  });
}
