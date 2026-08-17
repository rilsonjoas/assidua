import * as SQLite from 'expo-sqlite';

// Offline support (2026-08-17) — fila local de doses marcadas sem
// internet. Achado ao investigar o backend antes de implementar: o
// endpoint de criação (DoseLogController::store) já faz
// `updateOrCreate` pela chave (dose_schedule_id + scheduled_at), não
// pelo id do log — reenviar a mesma ação 2x nunca duplica, só
// sobrescreve. Por isso a fila só guarda o payload de sempre, sem
// precisar de nenhuma chave de idempotência nova no backend.
//
// "undo" é diferente: precisa de um id real de dose_log, que só existe
// depois de sincronizado. Uma dose marcada e desfeita ainda offline
// (antes de qualquer sync) nunca chega a virar uma ação "undo" — ver
// cancelPendingLog() abaixo, chamada nesse caso específico pra só
// remover a ação "log" da fila, sem nunca contatar o servidor.

export interface LogActionPayload {
  dose_schedule_id: number;
  medication_id: number;
  profile_id: number;
  scheduled_at: string;
  taken_at?: string;
  status: 'taken' | 'skipped' | 'missed';
  notes?: string;
}

export interface UndoActionPayload {
  dose_log_id: number;
}

export interface PendingAction {
  local_id: number;
  type: 'log' | 'undo';
  payload: LogActionPayload | UndoActionPayload;
  created_at: string;
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
// simplesmente cancela a ação "log" pendente pra aquele
// schedule+horário. Assim o servidor nunca chega a saber de uma dose
// que foi marcada e desmarcada inteiramente offline.
export async function cancelPendingLog(doseScheduleId: number, scheduledAt: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ local_id: number; payload: string }>(
    "SELECT local_id, payload FROM pending_actions WHERE type = 'log'",
  );
  const match = rows.find((r) => {
    const p = JSON.parse(r.payload) as LogActionPayload;
    return p.dose_schedule_id === doseScheduleId && p.scheduled_at === scheduledAt;
  });
  if (!match) return false;
  await db.runAsync('DELETE FROM pending_actions WHERE local_id = ?', match.local_id);
  return true;
}

export async function hasPendingLog(doseScheduleId: number, scheduledAt: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM pending_actions WHERE type = 'log'",
  );
  return rows.some((r) => {
    const p = JSON.parse(r.payload) as LogActionPayload;
    return p.dose_schedule_id === doseScheduleId && p.scheduled_at === scheduledAt;
  });
}

export async function listPending(): Promise<PendingAction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ local_id: number; type: 'log' | 'undo'; payload: string; created_at: string }>(
    'SELECT local_id, type, payload, created_at FROM pending_actions ORDER BY local_id ASC',
  );
  return rows.map((r) => ({
    local_id: r.local_id,
    type: r.type,
    payload: JSON.parse(r.payload),
    created_at: r.created_at,
  }));
}

export async function removePending(localId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_actions WHERE local_id = ?', localId);
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
export async function applyPendingOverlay<T extends {
  id: number | string;
  dose_schedule_id: number;
  scheduled_at: string;
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

    const log = pending.find((p) => {
      if (p.type !== 'log') return false;
      const payload = p.payload as LogActionPayload;
      return payload.dose_schedule_id === dose.dose_schedule_id && payload.scheduled_at === dose.scheduled_at;
    });
    if (log) {
      const payload = log.payload as LogActionPayload;
      return { ...dose, status: payload.status, _pendingSync: true } as T & { _pendingSync: boolean };
    }

    return dose;
  });
}
