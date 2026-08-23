import { useState } from 'react';
import { AlertDialog } from '../components/AlertDialog';

// Extraído do padrão já usado em profile.tsx (2026-08-14) — um estado
// genérico cobre qualquer tela com aviso/erro de 1 botão, em vez de
// repetir { alertInfo, setAlertInfo, <AlertDialog .../> } em cada
// arquivo. Achado real (2026-08-22/23): 7 telas ainda usavam o
// `showAlert` cru de `lib/alert.ts` (window.alert/Alert.alert nativo,
// destoa do resto do design) — login.tsx era uma delas, achado do
// Rilson testando o app de verdade.
export function useAlertDialog() {
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string } | null>(null);

  function showAlert(title: string, message?: string) {
    setAlertInfo({ title, message: message ?? '' });
  }

  const alertDialog = (
    <AlertDialog
      visible={!!alertInfo}
      title={alertInfo?.title ?? ''}
      message={alertInfo?.message ?? ''}
      okLabel="OK"
      onDismiss={() => setAlertInfo(null)}
    />
  );

  return { showAlert, alertDialog };
}
