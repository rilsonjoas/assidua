# Meus Remédios — Contexto para Claude

## O que é este projeto

App mobile de gestão de medicamentos para pacientes crônicos. Objetivo é viral/produto de massa — não uso pessoal. Modelo freemium com AdMob + assinatura Pro (RevenueCat). Implementação do tier Pro está adiada; focar no MVP funcional primeiro.

## Stack definida (não mudar sem perguntar)

- **Mobile**: Expo SDK 56 (React Native) + TypeScript — `app/`
- **Backend**: Laravel 13 + MySQL — `api/`
- **Auth**: Sanctum (tokens) + Socialite (Google OAuth)
- **Dev backend**: Laravel Sail (Docker)
- **Notificações locais**: expo-notifications
- **Estado**: Zustand
- **Cache**: TanStack React Query
- **HTTP**: Axios
- **Ícones**: @expo/vector-icons (MaterialCommunityIcons) — NÃO usar lucide-react-native (bug Metro com .mjs)
- **Tema**: hook useTheme + tokens em constants/theme.ts + themeStore (Zustand persistido)
- **Ads**: AdMob — adiado
- **IAP**: RevenueCat — adiado

## Decisões importantes

- **Contato oficial: SEMPRE `meusremedios@narniano.com`** — todo lugar que citar e-mail/contato (política de privacidade, tela de ajuda, formulários da Play Store, e-mails transacionais, suporte) usa esse endereço. Nunca e-mail pessoal.
- **Sem Firebase**: substituído por Laravel completo
- **AdMob, não AdSense**: AdSense é para web, AdMob é para mobile
- **RevenueCat**: padrão cross-platform para IAP (App Store + Play Store)
- **Tier Pro**: decisão de 2026-08-21 virou PRIORIDADE de monetização (AdMob adiado) — código integrado de ponta a ponta (SDK + webhook Laravel); fica inerte até existir conta/produto no dashboard RevenueCat e na Play Store (depende de L0)
- **Atualizações do app: SEMPRE `eas update` primeiro** — NÃO gerar novo APK/build a menos que seja estritamente necessário (módulo nativo novo, mudança de config nativa, versão do Expo). Comando seguro: `eas update --channel preview --environment preview -m "..."` do diretório `app/`. A flag `--environment` é OBRIGATÓRIA em modo não-interativo — sem ela o bundle sai sem `EXPO_PUBLIC_API_URL` e o app tenta `localhost` (bug real já acontecido, ver README seção 2026-08-14 e 2026-08-21)
- **Testes**: build de desenvolvimento via EAS Build instalado no celular (não Expo Go — incompatível com SDK 56)
- **Sem commits a cada mudança**: só commitar quando o usuário pedir explicitamente
- **Deploy backend**: NO AR desde 2026-08-08 em `api-remedios.narniano.com` (VPS Hetzner, Docker, Postgres; CI/CD publica imagem no GHCR)
- **Login Google**: ativo em produção desde 2026-08-08 (credenciais configuradas no GCloud)

## Estado atual do app (o que está pronto)

### Funcionando
- Cadastro/login email+senha, Google OAuth (ativo em produção desde 2026-08-08), magic link por e-mail
- Perfis de paciente com ícone + cor, modo claro/escuro com seletor em Perfis
- Tela Hoje: doses calculadas dinamicamente via dose_schedules, Tomei/Pular, chips de perfil
- Tela Remédios: lista + FAB, formulário completo com gerenciamento de horários (criar/deletar/editar) e picker de dias da semana; múltiplos horários já no cadastro + presets de frequência/dias/intervalo (2026-08-21)
- Tela Histórico: filtros por status, agrupado por data, card de adesão com %
- Tela Estoque: edição inline, alerta de estoque baixo, decremento automático ao tomar a dose
- Notificações locais agendadas ao criar horário, canceladas ao deletar
- Suporte offline completo (expo-sqlite + sync automático via NetInfo)
- Cuidador remoto (contas separadas, convite por código)
- Deploy completo do backend (api-remedios.narniano.com) com Sentry configurado
- Integração RevenueCat (Laravel Webhooks + SDK) — inerte até chave/produto existirem

### Pendente
- L0: conta Google Play (US$25) → `eas build --profile production` só aí (antes disso, atualizações são só `eas update`)
- RevenueCat: criar produtos no dashboard + Play Store (bloqueado por L0)
- Versão web: plano pronto no ROADMAP.md, spike W0 ainda não começou

## Próximo passo ao retomar

Ver ROADMAP.md — backlog vivo do produto. Offline support já foi entregue (2026-08-17).

## Restrições do ambiente

- Fedora Linux
- Docker instalado (usado para rodar Laravel Sail)
- Node.js v22 instalado
- PHP/Composer NÃO instalados localmente — usar sempre via Docker:
  `docker run --rm --user $(id -u):$(id -g) -v "$(pwd)":/opt -w /opt laravelsail/php84-composer:latest <comando>`
- Arquivos criados pelo Docker ficam como root — usar `--user $(id -u):$(id -g)` para evitar
- IP local do PC: 192.168.18.4 (atualizar se mudar de rede)
