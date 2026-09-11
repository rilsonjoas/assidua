import NetInfo from '@react-native-community/netinfo';
import i18next from 'i18next';
import { logDose, undoDose } from './doses';
import { listPending, removePending, incrementRetryCount, LogActionPayload, UndoActionPayload } from './offlineQueue';
import { queryClient } from './queryClient';
import { useSyncStore } from '../store/syncStore';
import { useToastStore } from '../store/toastStore';

// Offline support (2026-08-17) — drena a fila local quando a conexão
// volta. Cada ação é reenviada exatamente como seria enviada online —
// `logDose` já é seguro de repetir (ver comentário em offlineQueue.ts).
// Erro de rede no meio do drain para o loop (mantém o resto na fila
// pra próxima tentativa, via `startAutoSync`/NetInfo — já reconecta
// sozinho, sem precisar de nada abaixo).
//
// Retry limitado pra erro REAL do servidor (2026-09-11, achado real do
// Rilson: uma dose registrada offline que falhasse por erro do servidor
// era descartada na hora, silenciosamente — "isso é importante", pediu
// retry, mas sem loop eterno em algo genuinamente quebrado). Até
// MAX_RETRIES tentativas (uma por sincronização, não em sequência —
// evita bater no servidor repetidas vezes pro mesmo erro em segundos);
// só desiste de vez depois disso, e AVISA (toast), nunca silenciosamente.
const MAX_RETRIES = 3;

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
  useSyncStore.getState().setSyncing(true);
  let synced = 0;
  let failed = 0; // só desistências DEFINITIVAS (esgotou MAX_RETRIES) — não conta tentativa que ainda vai repetir.
  let gaveUpCount = 0;

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
          // e as próximas na fila, tenta tudo de novo na próxima vez
          // (já reconecta sozinho, via `startAutoSync`/NetInfo).
          break;
        }
        // Erro real do servidor nesta ação específica. Retry limitado
        // (2026-09-11) — não trava o resto da fila, mas também não
        // desiste na primeira: mantém na fila e conta mais uma
        // tentativa, até MAX_RETRIES. Só descarta de vez (e avisa,
        // nunca silenciosamente) depois de esgotar as tentativas.
        if (action.retry_count + 1 < MAX_RETRIES) {
          console.warn(
            `[sync] ação da fila falhou (tentativa ${action.retry_count + 1}/${MAX_RETRIES}, tentando de novo na próxima sincronização):`,
            action,
            error,
          );
          await incrementRetryCount(action.local_id);
        } else {
          console.error('[sync] ação da fila desistiu de vez após esgotar as tentativas:', action, error);
          await removePending(action.local_id);
          failed++;
          gaveUpCount++;
        }
      }
    }
  } finally {
    syncing = false;
    useSyncStore.getState().recordSyncResult(synced, failed);
  }

  // Só avisa em desistência DEFINITIVA — uma tentativa que ainda vai
  // repetir não é notícia nenhuma pra pessoa, e sincronização silenciosa
  // com sucesso continua silenciosa (mesmo princípio de "não atrapalhar
  // o usuário" já usado no resto do app).
  if (gaveUpCount > 0) {
    useToastStore.getState().showToast(
      i18next.t('common.syncGaveUpToast', { count: gaveUpCount }),
      { haptic: false },
    );
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
