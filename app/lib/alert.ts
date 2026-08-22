import { Alert, Platform } from 'react-native';

// Achado real do primeiro teste web (W1, 2026-08-22): o Rilson clicou
// "enviar link de acesso" na web e NADA aconteceu na tela — causa raiz:
// `Alert.alert` é um NO-OP no react-native-web, então todo erro de rede
// capturado morria silencioso. Mesmo padrão do restante do app
// (`AppText`, shims `.web.ts`): um único ponto que resolve a plataforma,
// telas continuam chamando uma função só.
//
// Assinatura cobre os usos reais do app (título + mensagem, sem botões —
// confirmações sim/não usam ConfirmDialog, que já é cross-platform).
// No nativo, mensagem ausente NÃO vira '' — os testes fixam
// `toHaveBeenCalledWith(title)` com 1 argumento só.
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message === undefined) {
    Alert.alert(title);
    return;
  }
  Alert.alert(title, message);
}
