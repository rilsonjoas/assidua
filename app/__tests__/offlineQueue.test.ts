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
  identityOfDose,
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

    const cancelled = await cancelPendingLog({ kind: 'scheduled', dose_schedule_id: 1, scheduled_at: '2026-08-17T08:00:00.000Z' });
    expect(cancelled).toBe(true);
    expect(await pendingCount()).toBe(0);
  });

  it('cancelPendingLog retorna false quando não há ação pendente pra esse schedule+horário', async () => {
    const cancelled = await cancelPendingLog({ kind: 'scheduled', dose_schedule_id: 999, scheduled_at: '2026-08-17T08:00:00.000Z' });
    expect(cancelled).toBe(false);
  });

  it('hasPendingLog reflete o estado real da fila', async () => {
    const alvo = { kind: 'scheduled', dose_schedule_id: 1, scheduled_at: '2026-08-17T08:00:00.000Z' } as const;
    expect(await hasPendingLog(alvo)).toBe(false);
    await enqueueLog({
      dose_schedule_id: 1,
      medication_id: 10,
      profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z',
      status: 'skipped',
    });
    expect(await hasPendingLog(alvo)).toBe(true);
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

  // =============================================================
  // P4 (§10.4) — dose de resgate (PRN) na fila offline.
  //
  // O bug que estes testes existem para impedir: a identidade da dose
  // era o par (dose_schedule_id, scheduled_at), e na PRN os DOIS são
  // nulos — logo `null === null` é `true`. Uma única ação de resgate
  // pendente casava com TODAS as doses de resgate da lista, e o
  // Histórico as mostrava como tomadas. Não é Hypothético: é o que
  // `null === null` faz, e o tipo anterior (`number`/`string`
  // não-nulos) proibia o compilador de apontar.
  // =============================================================

  describe('dose de resgate (PRN)', () => {
    const prn = (id: number, key: string) => ({
      id,
      dose_schedule_id: null,
      scheduled_at: null,
      client_key: key,
      status: 'taken' as const,
    });

    it('uma ação de resgate pendente NÃO marca outra dose de resgate', async () => {
      await enqueueLog({
        client_key: 'aaaa-1111',
        medication_id: 10,
        profile_id: 100,
        taken_at: '2026-08-17T08:00:00.000Z',
        status: 'taken',
      });

      // A dose que casaria errado é a de `client_key` 'bbbb-2222' —
      // ambas têm (null, null), então qualquer comparação por null
      // house as duas.
      const lista = [prn(1, 'aaaa-1111'), prn(2, 'bbbb-2222')];
      const result = await applyPendingOverlay(lista);

      expect(result[0].status).toBe('taken');
      expect((result[0] as any)._pendingSync).toBe(true);
      // Esta é a asserção que quebra com o `null === null`:
      expect(result[1].status).toBe('taken');
      expect((result[1] as any)._pendingSync).toBeUndefined();
    });

    it('ações de resgate não se sobrescrevem: cada uma acha a sua dose', async () => {
      await enqueueLog({ client_key: 'aaaa-1111', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T08:00:00.000Z', status: 'taken' });
      await enqueueLog({ client_key: 'bbbb-2222', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T20:00:00.000Z', status: 'taken' });

      const result = await applyPendingOverlay([prn(1, 'aaaa-1111'), prn(2, 'bbbb-2222')]);
      expect((result[0] as any)._pendingSync).toBe(true);
      expect((result[1] as any)._pendingSync).toBe(true);
    });

    it('ação de resgate não encosta em dose agendada (e vice-versa)', async () => {
      await enqueueLog({ client_key: 'aaaa-1111', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T08:00:00.000Z', status: 'taken' });

      const agendada = {
        id: 9,
        dose_schedule_id: 1,
        scheduled_at: '2026-08-17T08:00:00.000Z',
        status: 'pending' as const,
      };
      const [result] = await applyPendingOverlay([agendada]);
      expect(result).toEqual(agendada);
    });

    it('cancela a ação de resgate pelo client_key (undo antes de sincronizar)', async () => {
      await enqueueLog({ client_key: 'aaaa-1111', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T08:00:00.000Z', status: 'taken' });

      // Chave errada não cancela a ação de ninguém.
      expect(await cancelPendingLog({ kind: 'prn', client_key: 'cccc-3333' })).toBe(false);
      expect(await pendingCount()).toBe(1);

      expect(await cancelPendingLog({ kind: 'prn', client_key: 'aaaa-1111' })).toBe(true);
      expect(await pendingCount()).toBe(0);
    });

    it('hasPendingLog distingue uma dose de resgate da outra', async () => {
      expect(await hasPendingLog({ kind: 'prn', client_key: 'aaaa-1111' })).toBe(false);
      await enqueueLog({ client_key: 'aaaa-1111', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T08:00:00.000Z', status: 'taken' });
      expect(await hasPendingLog({ kind: 'prn', client_key: 'aaaa-1111' })).toBe(true);
      expect(await hasPendingLog({ kind: 'prn', client_key: 'bbbb-2222' })).toBe(false);
    });

    it('cancelPendingLog de resgate NÃO apaga a ação agendada do mesmo horário', async () => {
      await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: '2026-08-17T08:00:00.000Z', status: 'taken' });
      await enqueueLog({ client_key: 'aaaa-1111', medication_id: 10, profile_id: 100, taken_at: '2026-08-17T08:00:00.000Z', status: 'taken' });

      expect(await cancelPendingLog({ kind: 'prn', client_key: 'aaaa-1111' })).toBe(true);
      expect(await pendingCount()).toBe(1);
      const [restante] = await listPending();
      expect((restante.payload as any).dose_schedule_id).toBe(1);
    });

    it('carga antiga sem client_key (instalação anterior ao P4) continua valendo', async () => {
      // Quem tinha o app antes do P4 tem linhas JSON sem `client_key`.
      // Se a chave tivesse virado obrigatória sem fallback, a fila
      // deles viraria lixo — o pior desfecho pra quem estava offline
      // justo na instalação.
      await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: '2026-08-17T08:00:00.000Z', status: 'taken' });

      const [result] = await applyPendingOverlay([
        { id: 1, dose_schedule_id: 1, scheduled_at: '2026-08-17T08:00:00.000Z', status: 'pending' as const },
      ]);
      expect(result.status).toBe('taken');
      expect(await hasPendingLog({ kind: 'scheduled', dose_schedule_id: 1, scheduled_at: '2026-08-17T08:00:00.000Z' })).toBe(true);
    });
  });

  describe('identityOfDose', () => {
    it('devolve a identidade de resgate quando há client_key', () => {
      expect(identityOfDose({ dose_schedule_id: null, scheduled_at: null, client_key: 'aaaa-1111' })).toEqual({
        kind: 'prn',
        client_key: 'aaaa-1111',
      });
    });

    it('devolve a identidade agendada quando há schedule e horário', () => {
      expect(
        identityOfDose({ dose_schedule_id: 7, scheduled_at: '2026-08-17T08:00:00.000Z', client_key: null }),
      ).toEqual({ kind: 'scheduled', dose_schedule_id: 7, scheduled_at: '2026-08-17T08:00:00.000Z' });
    });

    it('devolve null para dose sem identidade — nunca (null, null)', () => {
      // Este é o ponto: a função que a UI usa antes de chamar
      // `cancelPendingLog` não tem como devolver a identidade que faz
      // `null === null` dar true.
      expect(identityOfDose({ dose_schedule_id: null, scheduled_at: null, client_key: null })).toBeNull();
      expect(identityOfDose({ dose_schedule_id: 7, scheduled_at: null })).toBeNull();
    });
  });
});
