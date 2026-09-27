import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Haptics from 'expo-haptics';
import { useToastStore } from '../store/toastStore';
import { enqueueLog } from '../services/offlineQueue';
import { isNetworkError } from '../services/sync';
import { logDose, newPrnClientKey, type LogDosePayload } from '../services/doses';

/** O "modelo" da dose de resgate que este hook monta. */
export type PrnDoseRequest = {
  medicationId: number;
  profileId: number;
  /** `undefined` = "agora" (o caso comum: um toque). */
  takenAt?: Date;
  note?: string;
  /** Nome já mascarado pelo chamador se o perfil estiver em modo privado. */
  medicationName: string;
};

/**
 * Registra uma dose de resgate (PRN) — o terceiro caso do P4/§10.4.
 *
 * Existe como hook, e não como função solta nas duas telas, por um motivo
 * concreto: o caminho online/offline tem DUAS partes que precisam ficar
 * juntas — montar o payload com a `client_key`, tentar a API, e, se a
 * falha for de rede (e só de rede!), cair para a fila. Se cada tela
 * implementasse as duas partes por conta, uma delas acabaria com a
 * treatment errada: ou "sucesso" na tela enquanto o registro está
 * apenas enfileirado, ou fila perdido porque o erro de rede foi tratado
 * como erro de validação.
 *
 * A `client_key` nasce AQUI, no cliente, e nunca muda: é ela que faz o
 * reenvio ser o mesmo registro em vez de uma dose duplicada. Se o app
 * trava depois de enfileirar, a fila drena com a mesma chave e o
 * servidor responde "jáexists" em vez de criar outra.
 */
export function useLogPrnDose() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);

  return useMutation({
    mutationFn: async (req: PrnDoseRequest) => {
      const payload: LogDosePayload = {
        client_key: newPrnClientKey(),
        medication_id: req.medicationId,
        profile_id: req.profileId,
        // A dose de resgate grava o INSTANTE do toque (ao contrário da
        // dose prevista, que grava o horário agendado — ver decisão de
        // 2026-09-11 no `markDose` da Home). Aqui não existe horário
        // agendado contra o qual mentir: "tomei às 15:20" é o fato.
        taken_at: (req.takenAt ?? new Date()).toISOString(),
        status: 'taken',
        ...(req.note?.trim() ? { notes: req.note.trim() } : {}),
      };

      try {
        return { log: await logDose(payload), pendingSync: false as const };
      } catch (error) {
        // Só rede vai para a fila. 422 (contrato) e 500 (servidor) são
        // erros de verdade: enfileirar devolveria um "salvou!" que o
        // servidor rejeitaria mais tarde, sem que ninguém visse.
        if (!isNetworkError(error)) throw error;
        await enqueueLog(payload);
        return { log: null, pendingSync: true as const };
      }
    },
    onSuccess: ({ pendingSync }, req) => {
      // Offline, o registro só existe na fila — e o Histórico mostra a
      // fila (`pending-prn`). Sem invalidar aqui, a pessoa que acabou de
      // registrar o resgate abriria o Histórico e não veria nada.
      if (pendingSync) {
        showToast(t('prn.pendingToast', { name: req.medicationName }), { haptic: false });
      } else {
        showToast(t('prn.registeredToast', { name: req.medicationName }), { haptic: false });
      }
      queryClient.invalidateQueries({ queryKey: ['pending-prn'] });
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['dose-history'] });
      queryClient.invalidateQueries({ queryKey: ['adherence-streak'] });
      queryClient.invalidateQueries({ queryKey: ['daily-adherence'] });
      queryClient.invalidateQueries({ queryKey: ['consultation-summary'] });

      // Haptic só no sucesso real do servidor — vibrar antes de
      // confirmar daria falso positivo, e há um comentário idêntico no
      // `markDose` da Home. Offline é o toast que informa.
      if (!pendingSync) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });
}
