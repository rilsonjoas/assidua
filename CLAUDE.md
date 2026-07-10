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

- **Sem Firebase**: substituído por Laravel completo
- **AdMob, não AdSense**: AdSense é para web, AdMob é para mobile
- **RevenueCat**: padrão cross-platform para IAP (App Store + Play Store)
- **Tier Pro adiado**: deixar toda lógica de subscription/limite para versão futura
- **Testes**: build de desenvolvimento via EAS Build instalado no celular (não Expo Go — incompatível com SDK 56)
- **Sem commits a cada mudança**: só commitar quando o usuário pedir explicitamente
- **Deploy backend**: pendente — Dockerfile pronto em `api/`, aguardando VPS ou Oracle Cloud

## Estado atual do app (o que está pronto)

### Funcionando
- Cadastro/login email+senha, Google OAuth (frontend implementado, aguarda credenciais GCloud)
- Perfis de paciente com ícone + cor, modo claro/escuro com seletor em Perfis
- Tela Hoje: doses calculadas dinamicamente via dose_schedules, Tomei/Pular, chips de perfil
- Tela Remédios: lista + FAB, formulário completo com gerenciamento de horários (criar/deletar) e picker de dias da semana
- Tela Histórico: filtros por status, agrupado por data, card de adesão com %
- Tela Estoque: edição inline, alerta de estoque baixo
- Notificações locais agendadas ao criar horário, canceladas ao deletar

### Pendente
- Google OAuth: aguarda credenciais no Google Cloud Console
- Offline support (expo-sqlite)
- Deploy do backend
- Editar horários existentes (hora e dias)
- AdMob + RevenueCat (pós-MVP)

## Próximo passo ao retomar

Offline support — salvar dose_logs localmente com expo-sqlite quando sem internet, sincronizar ao reconectar.

## Restrições do ambiente

- Fedora Linux
- Docker instalado (usado para rodar Laravel Sail)
- Node.js v22 instalado
- PHP/Composer NÃO instalados localmente — usar sempre via Docker:
  `docker run --rm --user $(id -u):$(id -g) -v "$(pwd)":/opt -w /opt laravelsail/php84-composer:latest <comando>`
- Arquivos criados pelo Docker ficam como root — usar `--user $(id -u):$(id -g)` para evitar
- IP local do PC: 192.168.18.4 (atualizar se mudar de rede)
