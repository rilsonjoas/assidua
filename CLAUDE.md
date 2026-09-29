# Meus Remédios — Contexto para Claude

## O que é este projeto

App mobile de gestão de medicamentos para pacientes crônicos. Objetivo é viral/produto de massa — não uso pessoal. Modelo freemium com **assinatura Pro (RevenueCat) e sem publicidade** — ver "Decisões importantes" abaixo, essa parte é regra e não sugestão. Implementação do tier Pro está adiada; focar no MVP funcional primeiro.

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
- **IAP**: RevenueCat — adiado
- **Ads**: nenhum. Ver a regra de monetização em "Decisões importantes" — não reintroduzir.

## Decisões importantes

- **Contato oficial: SEMPRE `meusremedios@narniano.com`** — todo lugar que citar e-mail/contato (política de privacidade, tela de ajuda, formulários da Play Store, e-mails transacionais, suporte) usa esse endereço. Nunca e-mail pessoal.
- **Sem Firebase**: substituído por Laravel completo
- **🚫 Monetização: SOMENTE plano Pro via RevenueCat. Nenhuma PUBLICIDADE.** Esta linha substitui a antiga "AdMob, não AdSense" e é **regra, não sugestão**:
  - **Por quê** — três razões independentes que se sustentam: (a) o usuário-alvo é paciente crônico/idoso, que é o mesmo motivo que fez a decisão de design de **não** aplicar o ornamento do Design Narniano aqui (a estética se subordina à clareza do mais frágil — `12 - Redes sociais/Identidade visual geral.md` §1C); (b) anúncio colide com a declaração de **Health Data Safety** da Play Store e com dado de saúde classificado como sensível (LGPD art. 5º, II); (c) o posicionamento público já publicado é "interface limpa, focada no conteúdo, **sem** notificações ou anúncios" (`LinkedIn - Assdua & Lector.md`).
  - **Histórico, para não repetir**: a AdMob esteve no modelo freemium declarado, mas foi **adiada em 2026-08-21** quando o Tier Pro virou prioridade. Não é que nunca foi pensada — é que hoje está fora **por decisão**.
  - **NÃO adicionar** SDK de anúncio, banner, intersticial, rewarded ad nem "Ads" na stack, mesmo "depois". Se a receita de anúncio voltar a ser considerada, é decisão de produto nova e explícita do Rilson, com revisão de L4 antes — não herança de linha antiga deste arquivo.
  - **Referência**: `Monetização e Saúde dos Projetos.md` §Assdua (vault) e o bloco L1 do `ROADMAP.md` deste repo.
- **Ordem de execução: L0 → L4 (legal) → L1 (cobrança) → L2 → L3 → L5.** A lista L1..L5 do ROADMAP é *catálogo de fases*, não ordem. **L4 é gate de L1**, não item paralelo: dado de saúde é sensível, a Play Store exige declaração de monetização, e corrigir política de privacidade/consentimento depois de cobrança ativa vira breaking change na base instalada.
- **RevenueCat**: padrão cross-platform para IAP (App Store + Play Store)
- **Preço do Pro (DECIDIDO 2026-09-25 pelo Rilson): R$ 30,00/ano ou R$ 90,00 vitalício.** Múltiplo de 3×, coerente com o mercado. Ver `ROADMAP.md` §7.3.1 para a pesquisa de concorrência e as consequências. Regra derivada: ** vitalício não pode incluir nada que dê trabalho** (ex.: suporte prioritário), porque usuário que pagou uma vez não gera receita recorrente mas continua gerando custo. Nenhuma string de preço deve ser hardcoded antes do P7.
- **Tier Pro**: prioridade de monetização desde 2026-08-21 — código integrado de ponta a ponta (SDK + webhook Laravel); fica inerte até existir conta/produto no dashboard RevenueCat e na Play Store (depende de L0)
- **Janela do histórico: o paciente nunca perde o próprio registro.** Hoje `DoseLogController` limita a leitura a 30 dias no plano gratuito (`$days = isPro() ? 3650 : 30`) e a 90 dias nos relatórios derivados. **Os limites de plano devem barrar criação de recurso (perfis, medicamentos, cuidador), nunca leitura do próprio histórico nem export** — `GET /me/export` (`DataExportController`) é sempre gratuito. Ver T1 no plano de UX/ética.
- **Atualizações do app: SEMPRE `eas update` primeiro** — NÃO gerar novo APK/build a menos que seja estritamente necessário (módulo nativo novo, mudança de config nativa, versão do Expo). Comando seguro: `eas update --channel preview --environment preview -m "..."` do diretório `app/`. A flag `--environment` é OBRIGATÓRIA em modo não-interativo — sem ela o bundle sai sem `EXPO_PUBLIC_API_URL` e o app tenta `localhost` (bug real já acontecido, ver README seção 2026-08-14 e 2026-08-21)
- **Rodar a suíte no motor de PRODUÇÃO**: `api/scripts/test-postgres.sh` — **não confiar só no `./vendor/bin/phpunit`**. O default (`phpunit.xml`) roda em **SQLite**, e produção é **PostgreSQL** (dev local é MySQL via Sail). São três motores, e o SQLite é o mais permissivo exatamente onde o P4 mora: `client_key` é `varchar` no SQLite e `uuid` nativo no Postgres, e FK é metadado no SQLite — de onde sai o `ON DELETE SET NULL` que impede apagar histórico de saúde. Achado de 2026-09-27: 8 testes verdes no SQLite estouravam no Postgres por usarem `'aaaa-1111'` como `client_key`. O script sobe o Postgres, roda a suíte e limpa sozinho; aceita os mesmos argumentos do PHPUnit (`--filter`, etc.).
- **Testes**: build de desenvolvimento via EAS Build instalado no celular (não Expo Go — incompatível com SDK 56)
- **Sem commits a cada mudança**: só commitar quando o usuário pedir explicitamente
- **Deploy backend**: NO AR desde 2026-08-08 em `api-assidua.narniano.com` (VPS Hetzner, Docker, Postgres; CI/CD publica imagem no GHCR). O hostname antigo `api-remedios.narniano.com` **não resolve mais** (verificado por DNS em 2026-09-27) e foi removido daqui — deploy para ele falha. **Não existe staging:** o canal `preview` do EAS aponta para este mesmo backend, então testar no aparelho **escreve no banco de produção**. Ver `api/CHECKLIST-VERIFICACAO-P4.md`.
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
- Deploy completo do backend (api-assidua.narniano.com) com Sentry configurado
- Integração RevenueCat (Laravel Webhooks + SDK) — inerte até chave/produto existirem
- **Remédio de resgate / dose avulsa (P4, 2026-09-27)**: marcar "só quando
  precisar" no cadastro, botão "Registrar dose" no detalhe, histórico com
  fila offline, adesão pelo D13 e terceiro caso no relatório do médico.
  Duas regras do contrato que **não** podem ser afrouxadas: a
  `dose_schedule_id` anulável vem **depois** da `client_key` (a ordem é o
  que impede duplicidade), e `POST /dose-logs` faz XOR — híbrido é
  rejeitado de propósito.

### Pendente
- L0: conta Google Play (US$25) → `eas build --profile production` só aí (antes disso, atualizações são só `eas update`)
- RevenueCat: criar produtos no dashboard + Play Store (bloqueado por L0)
- Versão web: plano pronto no ROADMAP.md, spike W0 ainda não começou

## Próximo passo ao retomar

**Ler a seção `## 📌 PAINEL DE PENDÊNCIAS E ORDEM DE IMPLEMENTAÇÃO` no
topo do `ROADMAP.md`** — é o índice de tudo que está pendente, a ordem
recomendada e os itens que o próprio roadmap marca errado. Não planejar a
partir do corpo do ROADMAP: ele está organizado por data de achado, não por
prioridade, e tem partes que envelheceram.

Offline support já foi entregue (2026-08-17).

**Estado de 2026-09-27:** travado num bloqueio de US$25 (conta Google Play),
com 10 blocos de trabalho já concluído parados atrás do botão de publicar
(inclusive o T1 — histórico sem paywall, e o P4 do PRN). O código está mais
adiantado do que o roadmap afirma. Últimas suítes: backend **332** / 858
assertions (2 skipped, P6), mobile **455** / 48 suítes, typecheck limpo.

**Estado de 2026-09-27 (fim do dia):** P0–P4 **estão em produção** —
commit `3dff0b6` (PR #3), deploy VPS ✅, migrations `[11]` aplicadas, FK de
`dose_logs.dose_schedule_id` em `SET NULL`, dados conferidos contra o backup
(`1 | 17 | 5 | 82`). Backup com restore testado em
`/var/backups/hetzner-infra/pre-p4-20260927_155536/`. Update EAS `26e68d89`
publicado no canal `preview`; APK em `~/Downloads/assidua-preview-p4.apk`.
**Falta só o teste no aparelho** — `api/CHECKLIST-VERIFICACAO-P4.md`, quatro
perguntas, nenhuma exige código. O bloco de estado completo, com as
pendências abertas e as mudanças de ambiente feitas, está no `ROADMAP.md`
(bloco "ESTADO EM 2026-09-27").

## Restrições do ambiente

- Fedora Linux
- Docker instalado (usado para rodar Laravel Sail)
- Node.js v22 instalado
- PHP/Composer NÃO instalados localmente — usar sempre via Docker:
  `docker run --rm --user $(id -u):$(id -g) -v "$(pwd)":/opt -w /opt laravelsail/php84-composer:latest <comando>`
- Arquivos criados pelo Docker ficam como root — usar `--user $(id -u):$(id -g)` para evitar
- IP local do PC: 192.168.18.4 (atualizar se mudar de rede)
