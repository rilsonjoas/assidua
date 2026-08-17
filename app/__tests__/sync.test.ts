import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as SQLite from 'expo-sqlite';
import { drainQueue, isNetworkError } from '../services/sync';
import { enqueueLog, enqueueUndo, listPending } from '../services/offlineQueue';
import { logDose, undoDose } from '../services/doses';
import { queryClient } from '../services/queryClient';

const resetMockDb = (SQLite as any).__resetMockDb as () => void;

jest.mock('../services/doses', () => ({
  logDose: jest.fn(),
  undoDose: jest.fn(),
}));

const mockedLogDose = jest.mocked(logDose);
const mockedUndoDose = jest.mocked(undoDose);

// Mesmo formato de erro do axios: `response` presente = erro real do
// servidor; ausente = a requisição nunca chegou a ter resposta (rede).
const networkError = () => ({ message: 'Network Error' });
const serverError = (status: number) => ({ response: { status } });

describe('services/sync — drena a fila offline (2026-08-17)', () => {
  beforeEach(() => {
    resetMockDb();
    jest.clearAllMocks();
    mockedLogDose.mockResolvedValue({ id: 1 } as any);
    mockedUndoDose.mockResolvedValue(undefined);
  });

  it('isNetworkError distingue erro de rede (sem response) de erro real do servidor', () => {
    expect(isNetworkError(networkError())).toBe(true);
    expect(isNetworkError(serverError(422))).toBe(false);
    expect(isNetworkError(new Error('timeout'))).toBe(true);
  });

  it('sincroniza uma ação de log com sucesso e remove da fila', async () => {
    await enqueueLog({
      dose_schedule_id: 1, medication_id: 10, profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z', status: 'taken',
    });

    const result = await drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(mockedLogDose).toHaveBeenCalledTimes(1);
    expect(await listPending()).toHaveLength(0);
  });

  it('reenviar a mesma ação de log 2x nunca duplica — a fila só some quando a API confirma', async () => {
    // Simula: primeira tentativa de drain falha por rede DEPOIS de já
    // ter chamado logDose uma vez (ex.: resposta se perdeu) — a ação
    // continua na fila, uma segunda tentativa reenvia o mesmo payload.
    // O backend (updateOrCreate por schedule+horário) garante que isso
    // não cria duplicata — aqui só provamos que o cliente reenvia
    // exatamente o mesmo payload, sem inventar um novo.
    await enqueueLog({
      dose_schedule_id: 1, medication_id: 10, profile_id: 100,
      scheduled_at: '2026-08-17T08:00:00.000Z', status: 'taken',
    });

    mockedLogDose.mockRejectedValueOnce(networkError());
    const first = await drainQueue();
    expect(first).toEqual({ synced: 0, failed: 0 });
    expect(await listPending()).toHaveLength(1); // continua na fila

    mockedLogDose.mockResolvedValueOnce({ id: 1 } as any);
    const second = await drainQueue();
    expect(second).toEqual({ synced: 1, failed: 0 });

    expect(mockedLogDose).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockedLogDose.mock.calls;
    expect(firstCall).toEqual(secondCall); // mesmo payload nas duas tentativas
  });

  it('erro de rede no meio da fila para o drain e preserva o restante, na ordem', async () => {
    await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: 'a', status: 'taken' });
    await enqueueLog({ dose_schedule_id: 2, medication_id: 11, profile_id: 100, scheduled_at: 'b', status: 'taken' });
    await enqueueLog({ dose_schedule_id: 3, medication_id: 12, profile_id: 100, scheduled_at: 'c', status: 'taken' });

    mockedLogDose
      .mockResolvedValueOnce({ id: 1 } as any) // 1ª sincroniza
      .mockRejectedValueOnce(networkError());   // 2ª perde rede de novo

    const result = await drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(mockedLogDose).toHaveBeenCalledTimes(2); // nunca chegou a tentar a 3ª
    const remaining = await listPending();
    expect(remaining).toHaveLength(2);
    expect((remaining[0].payload as any).dose_schedule_id).toBe(2); // ordem preservada
  });

  it('erro real do servidor descarta só aquela ação e segue pras próximas', async () => {
    await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: 'a', status: 'taken' });
    await enqueueLog({ dose_schedule_id: 2, medication_id: 11, profile_id: 100, scheduled_at: 'b', status: 'taken' });

    mockedLogDose
      .mockRejectedValueOnce(serverError(422)) // rejeitado de verdade pelo servidor
      .mockResolvedValueOnce({ id: 2 } as any);

    const result = await drainQueue();

    expect(result).toEqual({ synced: 1, failed: 1 });
    expect(mockedLogDose).toHaveBeenCalledTimes(2); // não travou na primeira
    expect(await listPending()).toHaveLength(0); // as duas saíram da fila
  });

  it('undo pendente que recebe 404 (já não existe mais) é tratado como sincronizado, não como erro', async () => {
    await enqueueUndo({ dose_log_id: 123 });
    mockedUndoDose.mockRejectedValueOnce(serverError(404));

    const result = await drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(await listPending()).toHaveLength(0);
  });

  it('invalida as queries certas depois de sincronizar algo', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await enqueueLog({ dose_schedule_id: 1, medication_id: 10, profile_id: 100, scheduled_at: 'a', status: 'taken' });

    await drainQueue();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['today-doses'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adherence-streak'] });
    invalidateSpy.mockRestore();
  });

  it('fila vazia não chama a API nem invalida nada', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const result = await drainQueue();

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockedLogDose).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });
});
