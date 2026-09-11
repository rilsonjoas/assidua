import { api } from './api';

// Fase de fuso horário (2026-08-10) — Hermes (motor JS do Expo/RN desde
// a SDK atual) já traz Intl com suporte a timezone via ICU, então não
// precisa de dependência nativa nova (expo-localization) só pra isto.
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Ambiente sem Intl.timeZone (não deveria acontecer em device/simulador
    // real) — cai no default do backend em vez de quebrar o app.
    return 'America/Sao_Paulo';
  }
}

// i18n (2026-08-10) — mesma lógica do fuso: Intl já dá o idioma do
// aparelho sem precisar de expo-localization. Normaliza pra um dos 3
// idiomas suportados; qualquer outro cai no português (mercado-alvo).
export type SupportedLanguage = 'pt' | 'en' | 'es';
const SUPPORTED: SupportedLanguage[] = ['pt', 'en', 'es'];

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale; // ex: "pt-BR"
    const base = locale.split('-')[0].toLowerCase();
    return (SUPPORTED as string[]).includes(base) ? (base as SupportedLanguage) : 'pt';
  } catch {
    return 'pt';
  }
}

export interface ProfileTimezoneChangeResult {
  profileId: number;
  oldTimezone: string;
  newTimezone: string;
}

// Autocorreção pra quem já tinha perfil antes desta feature existir (todos
// nasceram com o default 'America/Sao_Paulo' na migration). Chamada no
// carregamento da tela Hoje, best-effort — não trava o app se falhar.
// Só perfis próprios: não faz sentido o dispositivo de um cuidador
// sobrescrever o fuso do paciente que ele só está visitando/acompanhando.
//
// Devolve o que REALMENTE mudou (2026-09-11, entrevista de decisões de
// horário — ver ROADMAP.md, item 1/6) — antes era silencioso (efeito
// colateral escondido, sem nenhum jeito da tela saber que algo mudou).
// Princípio do Rilson: "transparência total" — o chamador usa isto pra
// mostrar um toast na hora (o backend grava o marcador permanente do
// Histórico sozinho, ver ProfileController::update).
export async function syncOwnedProfileTimezones(
  profiles: Array<{ id: number; is_owner?: boolean; timezone?: string }>,
): Promise<ProfileTimezoneChangeResult[]> {
  const deviceTz = getDeviceTimezone();
  const stale = profiles.filter((p) => p.is_owner !== false && p.timezone !== deviceTz);

  const results = await Promise.all(
    stale.map(async (p) => {
      try {
        await api.put(`/profiles/${p.id}`, { timezone: deviceTz });
        return { profileId: p.id, oldTimezone: p.timezone!, newTimezone: deviceTz };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((r): r is ProfileTimezoneChangeResult => r !== null);
}
