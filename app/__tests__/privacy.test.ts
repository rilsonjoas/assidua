import { describe, it, expect, beforeEach } from '@jest/globals';
import { usePrivacyStore } from '../store/privacyStore';
import { maskMedicationName } from '../lib/privacy';

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
