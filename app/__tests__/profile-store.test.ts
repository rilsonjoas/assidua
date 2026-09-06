import { describe, it, expect, beforeEach } from '@jest/globals';
import { useProfileStore, Profile } from '../store/profileStore';

const owner: Profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };
const demo: Profile = { id: 2, user_id: 1, name: 'Demonstração', color: '#94a3b8', avatar_emoji: 'account-outline', is_active: true };

// Achado real de uso (2026-09-02): "fecho e reabro o app e ele volta pro
// perfil Demonstração". Ver store/profileStore.ts — o bug era resolver
// `activeProfile` antes da reidratação do AsyncStorage terminar, sem
// nada salvo pra preservar a escolha real. Estes testes cobrem a lógica
// de resolução em isolamento (setState direto, sem depender do timing
// real do AsyncStorage), nos dois sentidos da corrida.
describe('profileStore — persistência do perfil ativo', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profiles: [],
      activeProfile: null,
      activeProfileId: null,
      hasHydrated: false,
    });
  });

  it('sem nada salvo, cai pro primeiro perfil da lista (comportamento antigo, preservado)', () => {
    useProfileStore.getState().setProfiles([demo, owner]);

    expect(useProfileStore.getState().activeProfile?.id).toBe(demo.id);
  });

  it('com um id já restaurado do disco, resolve pra ele em vez do primeiro da lista', () => {
    // Simula o que a reidratação do AsyncStorage faz antes de qualquer
    // fetch da API rodar: só `activeProfileId` chega, o resto do estado
    // continua no default.
    useProfileStore.setState({ activeProfileId: owner.id });

    useProfileStore.getState().setProfiles([demo, owner]);

    expect(useProfileStore.getState().activeProfile?.id).toBe(owner.id);
  });

  // O bug de verdade: a reidratação pode terminar DEPOIS dos perfis já
  // terem chegado da API e caído no fallback errado.
  it('reidratação atrasada corrige o fallback errado em vez de manter o perfil trocado', () => {
    useProfileStore.getState().setProfiles([demo, owner]); // API chegou primeiro
    expect(useProfileStore.getState().activeProfile?.id).toBe(demo.id); // fallback temporário

    // AsyncStorage só resolve agora — simula o merge do persist chegando
    // com o id salvo, seguido do callback onRehydrateStorage.
    useProfileStore.setState({ activeProfileId: owner.id });
    useProfileStore.getState().setHasHydrated(true);

    expect(useProfileStore.getState().activeProfile?.id).toBe(owner.id);
  });

  it('perfil salvo que não existe mais na lista (apagado) cai pro primeiro, sem travar', () => {
    useProfileStore.setState({ activeProfileId: 999 });

    useProfileStore.getState().setProfiles([demo, owner]);

    expect(useProfileStore.getState().activeProfile?.id).toBe(demo.id);
    expect(useProfileStore.getState().activeProfileId).toBe(demo.id);
  });

  it('setActiveProfile grava o id junto, pra sobreviver ao próximo boot', () => {
    useProfileStore.getState().setProfiles([demo, owner]);

    useProfileStore.getState().setActiveProfile(owner);

    expect(useProfileStore.getState().activeProfile?.id).toBe(owner.id);
    expect(useProfileStore.getState().activeProfileId).toBe(owner.id);
  });

  it('remontar a tela (setProfiles de novo com a mesma lista) preserva a seleção atual', () => {
    useProfileStore.getState().setProfiles([demo, owner]);
    useProfileStore.getState().setActiveProfile(owner);

    useProfileStore.getState().setProfiles([demo, owner]); // ex.: refetch ao voltar pra aba

    expect(useProfileStore.getState().activeProfile?.id).toBe(owner.id);
  });
});
