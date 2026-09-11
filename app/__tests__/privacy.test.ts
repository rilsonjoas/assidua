import { describe, it, expect, beforeEach } from '@jest/globals';
import { usePrivacyStore } from '../store/privacyStore';
import { useToastStore } from '../store/toastStore';
import { maskMedicationName, togglePrivacyWithHint } from '../lib/privacy';

describe('Modo Privacidade', () => {
  beforeEach(() => {
    usePrivacyStore.setState({ isPrivate: false });
  });

  it('inicia desativado por padrão', () => {
    expect(usePrivacyStore.getState().isPrivate).toBe(false);
  });

  it('alterna o estado de privacidade com togglePrivacy', () => {
    usePrivacyStore.getState().togglePrivacy();
    expect(usePrivacyStore.getState().isPrivate).toBe(true);

    usePrivacyStore.getState().togglePrivacy();
    expect(usePrivacyStore.getState().isPrivate).toBe(false);
  });

  it('mascara o nome do medicamento quando o modo de privacidade está ativo', () => {
    expect(maskMedicationName('Dipirona 500mg', false)).toBe('Dipirona 500mg');
    expect(maskMedicationName('Dipirona 500mg', true)).toBe('••••••••');
  });

  it('retorna string vazia se o nome for nulo ou indefinido', () => {
    expect(maskMedicationName(null, true)).toBe('');
    expect(maskMedicationName(undefined, false)).toBe('');
  });
});

// "Modo Privacidade" espalhado por todas as abas (2026-09-11, achado
// real do Rilson: o olho só existia na Home, sem explicar o que fazia).
// `togglePrivacyWithHint` é o que os 3 lugares novos (olho de cada
// aba + linha "Modo Privacidade" do Perfil) chamam em vez de
// `togglePrivacy` direto — cobre o toast explicativo de primeira vez,
// não repetido nas vezes seguintes.
describe('togglePrivacyWithHint — toast explicativo só na primeira vez', () => {
  beforeEach(() => {
    usePrivacyStore.setState({ isPrivate: false, hasSeenPrivacyToggleHint: false });
    useToastStore.setState({ message: null });
  });

  it('primeira vez: alterna o estado E mostra o toast explicativo', () => {
    togglePrivacyWithHint();

    expect(usePrivacyStore.getState().isPrivate).toBe(true);
    expect(usePrivacyStore.getState().hasSeenPrivacyToggleHint).toBe(true);
    expect(useToastStore.getState().message).toContain('Modo Privacidade');
  });

  it('depois da primeira vez, continua alternando mas não mostra o toast de novo', () => {
    togglePrivacyWithHint(); // primeira vez — marca hasSeenPrivacyToggleHint
    useToastStore.getState().clearToast();

    togglePrivacyWithHint(); // segunda vez

    expect(usePrivacyStore.getState().isPrivate).toBe(false); // voltou a mostrar
    expect(useToastStore.getState().message).toBeNull();
  });

  it('se já tinha visto o toast antes (ex.: veio de outra tela), não mostra de novo nem na primeira chamada desta sessão', () => {
    usePrivacyStore.setState({ hasSeenPrivacyToggleHint: true });

    togglePrivacyWithHint();

    expect(usePrivacyStore.getState().isPrivate).toBe(true);
    expect(useToastStore.getState().message).toBeNull();
  });
});
