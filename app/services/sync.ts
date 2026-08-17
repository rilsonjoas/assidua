import NetInfo from '@react-native-community/netinfo';
import { logDose, undoDose } from './doses';
import { listPending, removePending, LogActionPayload, UndoActionPayload } from './offlineQueue';
import { queryClient } from './queryClient';

// Offline support (2026-08-17) — drena a fila local quando a conexão
// volta. Cada ação é reenviada exatamente como seria enviada online —
// `logDose` já é seguro de repetir (ver comentário em offlineQueue.ts).
// Erro de rede no meio do drain para o loop (mantém o resto na fila
// pra próxima tentativa); erro real do servidor descarta só aquela
// ação (não adianta reenviar um 422 pra sempre) e segue pras outras.

let syncing = false;

export function isNetworkError(error: unknown): boolean {
  // Erro do axios sem `response` = a requisição nem chegou a ter
  // resposta do servidor (timeout, sem conexão) — distingue de um erro
  // real da API (4xx/5xx), que tem `response` preenchido.
  return typeof error === 'object' && error !== null && 'response' in error
    ? (error as { response?: unknown }).response === undefined
    : true;
}

export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const pending = await listPending();

    for (const action of pending) {
      try {
        if (action.type === 'log') {
          await logDose(action.payload as LogActionPayload);
        } else {
          const { dose_log_id } = action.payload as UndoActionPayload;
          try {
            await undoDose(dose_log_id);
          } catch (err) {
            // 404 = já não existe mais (ex.: apagado por outro caminho) —
            // pro que a fila queria, o resultado final já está certo.
            if (!(typeof err === 'object' && err !== null && 'response' in err
              && (err as { response?: { status?: number } }).response?.status === 404)) {
              throw err;
            }
          }
        }
        await removePending(action.local_id);
        synced++;
      } catch (error) {
        if (isNetworkError(error)) {
          // Sem rede de novo no meio do drain — para aqui, mantém essa
          // e as próximas na fila, tenta tudo de novo na próxima vez.
          break;
        }
        // Erro real do servidor nesta ação específica — não trava o
        // resto da fila, mas também não força ficar tentando pra
        // sempre algo que o servidor já rejeitou por motivo real.
        console.error('[sync] ação da fila falhou (erro do servidor, descartada):', action, error);
        await removePending(action.local_id);
        failed++;
      }
    }
  } finally {
    syncing = false;
  }

  if (synced > 0 || failed > 0) {
    // Reconcilia com a verdade do servidor — também é o que limpa a
    // marca visual de "pendente de sincronizar" dos itens que acabaram
    // de sincronizar (ela só existe no cache local otimista, nunca na
    // resposta real da API).
    queryClient.invalidateQueries({ queryKey: ['today-doses'] });
    queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
  }

  return { synced, failed };
}

let unsubscribe: (() => void) | null = null;

// Chamar uma vez no boot do app (ver _layout.tsx). Sincroniza ao
// reconectar E tenta uma vez de cara (cobre o caso de já estar online
// desde antes do listener existir).
export function startAutoSync(): void {
  if (unsubscribe) return;

  drainQueue();

  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      drainQueue();
    }
  });
}

export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}
