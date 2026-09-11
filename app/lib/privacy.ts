import i18next from 'i18next';
import { usePrivacyStore } from '../store/privacyStore';
import { useToastStore } from '../store/toastStore';

export function maskMedicationName(name: string | null | undefined, isPrivate: boolean): string {
  if (!name) return '';
  if (isPrivate) return '••••••••';
  return name;
}

// "Modo Privacidade" (2026-09-11, achado real do Rilson: o olhinho só
// existia na Home e ninguém explicava o que ele fazia). Função pura
// (não hook) de propósito — chamada a partir de vários lugares
// diferentes (olho da Home, olho no cabeçalho das outras abas, linha
// "Modo Privacidade" no Perfil), todos precisam do MESMO
// comportamento: alterna o estado e, só na PRIMEIRA vez que a pessoa
// mexe nisso (qualquer um dos lugares, o flag é único), explica o que
// aconteceu com um toast — nunca mais depois disso. Mesmo padrão de
// `i18next.t()`/`useToastStore.getState()` fora de componente já usado
// em `services/sync.ts`.
export function togglePrivacyWithHint(): void {
  const { hasSeenPrivacyToggleHint, togglePrivacy, setHasSeenPrivacyToggleHint } = usePrivacyStore.getState();
  togglePrivacy();
  if (!hasSeenPrivacyToggleHint) {
    setHasSeenPrivacyToggleHint(true);
    useToastStore.getState().showToast(i18next.t('profile.privacyHintToast'));
  }
}
