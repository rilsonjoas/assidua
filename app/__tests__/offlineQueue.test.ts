import { describe, it, expect, beforeEach } from '@jest/globals';
import * as SQLite from 'expo-sqlite';
import {
  enqueueLog,
  enqueueUndo,
  cancelPendingLog,
  hasPendingLog,
  listPending,
  removePending,
  pendingCount,
  applyPendingOverlay,
} from '../services/offlineQueue';

const resetMockDb = (SQLite as any).__resetMockDb as () => void;

describe('services/offlineQueue — fila local de doses offline (2026-08-17)', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('enfileira e lista uma ação de log', async () => {
    await enqueueLog({
      dose_schedule_id: 1,
      medication_id: 10,
      profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z',
      status: 'taken',
    });

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('log');
    expect(await pendingCount()).toBe(1);
  });

  it('cancela uma ação de log pendente pelo par schedule+horário (undo antes de sincronizar)', async () => {
    await enqueueLog({
      dose_schedule_id: 1,
      medication_id: 10,
      profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z',
      status: 'taken',
    });

    const cancelled = await cancelPendingLog(1, '2026-08-17T08:00:00.000Z');
    expect(cancelled).toBe(true);
    expect(await pendingCount()).toBe(0);
  });

  it('cancelPendingLog retorna false quando não há ação pendente pra esse schedule+horário', async () => {
    const cancelled = await cancelPendingLog(999, '2026-08-17T08:00:00.000Z');
    expect(cancelled).toBe(false);
  });

  it('hasPendingLog reflete o estado real da fila', async () => {
    expect(await hasPendingLog(1, '2026-08-17T08:00:00.000Z')).toBe(false);
    await enqueueLog({
      dose_schedule_id: 1,
      medication_id: 10,
      profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z',
      status: 'skipped',
    });
    expect(await hasPendingLog(1, '2026-08-17T08:00:00.000Z')).toBe(true);
  });

  it('removePending remove só a ação certa, mantém as outras', async () => {
    await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: 'a', status: 'taken' });
    await enqueueLog({ dose_schedule_id: 2, medication_id: 11, profile_id: 100, scheduled_at: 'b', status: 'taken' });

    const pending = await listPending();
    await removePending(pending[0].local_id);

    const after = await listPending();
    expect(after).toHaveLength(1);
    expect((after[0].payload as any).dose_schedule_id).toBe(2);
  });

  describe('applyPendingOverlay', () => {
    const baseDose = {
      id: 'pending_1_0800',
      dose_schedule_id: 1,
      scheduled_at: '2026-08-17T08:00:00.000Z',
      status: 'pending',
    };

    it('sem nada na fila, devolve as doses sem alteração', async () => {
      const result = await applyPendingOverlay([baseDose]);
      expect(result).toEqual([baseDose]);
    });

    it('sobrepõe uma ação de log pendente (dose marcada offline, ainda não sincronizada)', async () => {
      await enqueueLog({
        dose_schedule_id: 1,
        medication_id: 10,
        profile_id: 100,
        scheduled_at: '2026-08-17T08:00:00.000Z',
        status: 'taken',
      });

      const [result] = await applyPendingOverlay([baseDose]);
      expect(result.status).toBe('taken');
      expect((result as any)._pendingSync).toBe(true);
    });

    it('sobrepõe uma ação de undo pendente (dose já sincronizada, desfeita offline)', async () => {
      const takenDose = { ...baseDose, id: 555, status: 'taken' };
      await enqueueUndo({ dose_log_id: 555 });

      const [result] = await applyPendingOverlay([takenDose]);
      expect(result.status).toBe('pending');
      expect((result as any)._pendingSync).toBe(true);
    });

    it('não mexe em doses que não têm ação pendente correspondente', async () => {
      await enqueueLog({
        dose_schedule_id: 99, // schedule diferente — não deve casar com baseDose
        medication_id: 10,
        profile_id: 100,
        scheduled_at: '2026-08-17T08:00:00.000Z',
        status: 'taken',
      });

      const [result] = await applyPendingOverlay([baseDose]);
      expect(result).toEqual(baseDose);
    });
  });
});
