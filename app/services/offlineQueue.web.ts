// Shim WEB de services/offlineQueue.ts (W0, 2026-08-22).
//
// Metro resolve `.web.ts` no lugar de `.ts` no bundle web — telas e o
// services/sync.ts continuam importando de './offlineQueue' normalmente.
//
// Decisão do ROADMAP ("Versão Web", 2026-08-21): a web v1 é ONLINE-ONLY.
// `expo-sqlite` não existe no browser e a fila offline é o único uso de
// SQLite no app. Com fila sempre vazia:
//   - `drainQueue()` naturalmente não faz nada ({synced: 0, failed: 0});
//   - `applyPendingOverlay` devolve as doses intactas;
//   - marcar dose offline na web falha visivelmente (a chamada de API
//     retorna erro de rede) em vez de silenciar — degradação honesta.
// IndexedDB fica como possibilidade futura se uso real justificar.

import type { LogActionPayload, UndoActionPayload, PendingAction } from './offlineQueue';

// Reexporta os tipos pra quem os importa deste módulo via caminho web.
export type { LogActionPayload, UndoActionPayload, PendingAction };

export async function enqueueLog(payload: LogActionPayload): Promise<void> {
  void payload;
}

export async function enqueueUndo(payload: UndoActionPayload): Promise<void> {
  void payload;
}

export async function cancelPendingLog(doseScheduleId: number, scheduledAt: string): Promise<boolean> {
  void doseScheduleId;
  void scheduledAt;
  return false;
}

export async function hasPendingLog(doseScheduleId: number, scheduledAt: string): Promise<boolean> {
  void doseScheduleId;
  void scheduledAt;
  return false;
}

export async function listPending(): Promise<PendingAction[]> {
  return [];
}

export async function removePending(localId: number): Promise<void> {
  void localId;
}

export async function pendingCount(): Promise<number> {
  return 0;
}

export async function applyPendingOverlay<T extends {
  id: number | string;
  dose_schedule_id: number;
  scheduled_at: string;
  status: string;
}>(doses: T[]): Promise<T[]> {
  return doses;
}
