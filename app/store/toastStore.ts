import { create } from 'zustand';
import * as Haptics from 'expo-haptics';

interface ShowToastOptions {
  // Achado real de uso (2026-08-17, dose offline): o hático da dose é
  // deliberadamente separado do toast — só vibra na confirmação real do
  // servidor, nunca numa marcação que só foi enfileirada offline (ver
  // `app/(tabs)/index.tsx`, `logDose.onSuccess`), pra não dar falso
  // positivo de "salvou" quando na verdade só ficou local esperando
  // conexão. Esse é o único chamador que precisa desligar o hático
  // automático daqui — todo resto (salvar remédio, estoque, perfil...)
  // quer os dois juntos.
  haptic?: boolean;
}

interface ToastState {
  message: string | null;
  showToast: (message: string, options?: ShowToastOptions) => void;
  clearToast: () => void;
}

let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// Achado real de uso (2026-09-02): "salvar sem feedback visual — nada
// confirma que salvou", crítico pro público idoso, que desconfia de
// tecnologia sem confirmação. Global (não persistido) de propósito: o
// toast do histórico de doses (Hoje) já existia local antes disso, mas
// salvar um remédio faz `router.back()` logo em seguida — um toast
// preso ao próprio state da tela do formulário nunca chegaria a
// aparecer, porque a tela já foi desmontada. Vivendo aqui, uma tela
// dispara e sai que o `<Toast/>` (montado uma vez só em `_layout.tsx`)
// continua mostrando pra quem quer que esteja vendo depois.
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message, options) => {
    if (hideTimeout) clearTimeout(hideTimeout);
    set({ message });
    // Confirmação em dois canais (visual + tátil), mesmo padrão já
    // validado pela dose — reforça "aconteceu de verdade" sem depender
    // só da visão (seguro em web, `expo-haptics` tem shim próprio ali).
    if (options?.haptic !== false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    hideTimeout = setTimeout(() => set({ message: null }), 3500);
  },
  clearToast: () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = null;
    set({ message: null });
  },
}));
