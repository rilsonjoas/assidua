import { useState } from 'react';
import { AlertDialog } from '../components/AlertDialog';

// Extraído do padrão já usado em profile.tsx (2026-08-14) — um estado
// genérico cobre qualquer tela com aviso/erro de 1 botão, em vez de
// repetir { alertInfo, setAlertInfo, <AlertDialog .../> } em cada
// arquivo. Achado real (2026-08-22/23): 7 telas ainda usavam o
// `showAlert` cru de `lib/alert.ts` (window.alert/Alert.alert nativo,
// destoa do resto do design) — login.tsx era uma delas, achado do
// Rilson testando o app de verdade.
//
// `action` (2026-09-07, item 14) — opcional: pra alertas que precisam
// de um caminho pra resolver, não só fechar (ex.: limite do plano
// gratuito → "Ver planos Pro"). Chamadas existentes com 2 argumentos
// continuam idênticas, sem nada pra mudar.
export function useAlertDialog() {
  const [alertInfo, setAlertInfo] = useState<{
    title: string;
    message: string;
    action?: { label: string; onPress: () => void };
  } | null>(null);

  function showAlert(title: string, message?: string, action?: { label: string; onPress: () => void }) {
    setAlertInfo({ title, message: message ?? '', action });
  }

  const alertDialog = (
    <AlertDialog
      visible={!!alertInfo}
      title={alertInfo?.title ?? ''}
      message={alertInfo?.message ?? ''}
      okLabel="OK"
      onDismiss={() => setAlertInfo(null)}
      actionLabel={alertInfo?.action?.label}
      onAction={
        alertInfo?.action
          ? () => {
              alertInfo.action!.onPress();
              setAlertInfo(null);
            }
          : undefined
      }
    />
  );

  return { showAlert, alertDialog };
}
