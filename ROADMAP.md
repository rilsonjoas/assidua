# Roadmap — Meus Remédios

**Status (2026-08-21):** No ar em `api-remedios.narniano.com` (Laravel 13 + Postgres + Docker no VPS Hetzner) + App Mobile Expo (React Native). P0-P7 de infraestrutura e qualidade 100% concluídos. Suíte de testes mobile: 145 passando (10 novos na sessão de hoje; ~221 no total com backend).

---

## Sessão de 2026-08-21 — Frequência configurável, marca na UI e plano web

Trabalho direto no código a partir do levantamento abaixo.
**Publicado**: commit `15926bd` (pushed em `main`) + `eas update` canal
`preview` / ambiente `preview` (update group
`45cbf01b-a61f-4843-9554-556b6d42248f`). Lição nova registrada no
README: `eas update` não-interativo exige `--environment preview`
explícito — sem ele, bundle sai sem `EXPO_PUBLIC_API_URL` (bug do
localhost de 14/08 de novo).

### ✅ Feito — frequência e duração configuráveis

- **Múltiplos horários já no cadastro** — o maior buraco: antes dava pra
  cadastrar UM horário ("Primeiro horário") e os outros só depois de
  criar, reabrir e editar. Agora a seção Horários na criação tem lista
  de rascunhos editáveis/removíveis (mesma UI da seção de horários de
  remédio existente). Todo remédio exige ≥1 horário; quem remove todos
  recebe aviso claro (`errorNoSchedule`) em vez de salvar um remédio
  invisível no dashboard.
- **Atalho "Quantas vezes por dia?"** — chips `1x/2x/3x/4x por dia`
  preenchem a lista com horários padrão (08:00 · 08+20 · 08+14+20 ·
  06+12+18+00), todos fixos/todos os dias, cada um editável depois.
  Chip fica destacado enquanto a lista corresponde exatamente ao atalho.
- **Presets de dias da semana** — chips `Todos` / `Seg a Sex` /
  `Fim de semana` acima dos círculos D S T Q Q S S (nos dois editores:
  criação e remédio existente).
- **Presets de intervalo** — chips `4h 6h 8h 12h 24h` acima do campo
  livre "de quantas em quantas horas".
- **Duração do tratamento com data concreta** — ao digitar N dias,
  aparece `Fim previsto: {{date}}` (locale-aware via `toLocaleDateString`),
  transformando número solto em informação tangível.
- **i18n completo** pt/en/es para tudo acima (+ `profile.version`).
- **Testes** — 10 novos cobrindo múltiplos horários, atalhos, presets
  de dias/intervalo e data de fim. Suíte inteira: **145 passando**
  (era 211 contando backend; 145 é o pacote mobile).

### ✅ Feito — logotipo na UI

> Achado primeiro: o header da home JÁ tinha o logo desde 14/08
> (`eaa6b14`, ícone monocromático 30px) — passou despercebido de tão
> pequeno (e o build instalado pode ser anterior ao commit). Perfis
> estava sem NENHUM ponto de marca, confirmado.

- **Home (`(tabs)/index.tsx`)** — marca d'água grande (170px, opacity
  0.12, recortada no header) com a silhueta coração+relógio atrás da
  data/título, além do mark pequeno que já existia. Presença de marca
  sem brigar por atenção — literalmente o "nem que seja como marca
  d'água" pedido.
- **Perfis (`(tabs)/profile.tsx`)** — duas âncoras novas: silhueta
  translúcida no canto do card colorido do usuário (primeiro lugar onde
  o olho pousa) e rodapé de assinatura no fim do scroll (logo tingido
  com `textMuted`, adapta aos dois temas + nome do app + **versão** via
  `expo-constants`, útil pra report de bug).

### ✅ Feito — plano da versão web

Escrito em detalhe na seção "🌐 Versão Web" abaixo: recomendação de
spike curto com Expo Router web medindo o custo real dos módulos
nativos (notificações, RevenueCat, foto) antes de decidir contra uma
SPA separada; fases W0→W3; backend já pronto (só CORS novo).

## Backlog de Produto — Issues e Bugs (levantamento 2026-08-21)

> Levantamento de UX e produto feito pelo Rilson.

### 🔴 Crítico / Alta Prioridade (UX e Configuração de Uso Real)

- [x] **Frequência e duração do tratamento incompletas** — usuários precisam de:
  - Frequência flexível: a cada X horas, a cada X dias, dias da semana específicos ou horários livres/múltiplos. → **Implementado 2026-08-21** (múltiplos horários no cadastro + atalhos 1x–4x/dia + presets de dias e intervalo; ver seção acima).
  - Duração do tratamento: limite de dias com "Fim previsto" visível. → **Implementado 2026-08-21** (aviso quando acaba; o app nunca pausa sozinho — decisão de produto de 2026-08-14 mantida).
- [x] **Logotipo ausente na UI** — colocar a logomarca no header da página inicial e na tela de perfis. → **Feito 2026-08-21**: home ganhou marca d'água no header (o mark pequeno já existia desde 14/08); Perfis ganhou marca no card + rodapé com nome e versão. Ver seção da sessão acima.
- [x] **Editar agendamentos existentes** — permitir alterar horários e frequências de um remédio já cadastrado sem ter que deletar e recriar. → Já existia (editor por horário, testes em `medication-schedule-edit.test.tsx`); o que faltava era múltiplos horários *no cadastro*, resolvido acima.

### 🟡 Média Prioridade / Evolução

- [ ] **Versão Web do Meus Remédios** — plano completo na seção abaixo (2026-08-21).
- [ ] **Fluxo de L0 (Google Play)** — aguardando taxa de $25 para conta de desenvolvedor. Quando destravar: `eas build --profile production` → submeter → 14 dias de teste fechado (12 testadores).

### 💰 RevenueCat — estado real e o que falta (levantado 2026-08-21)

Projeto "Meus remédios" **já criado no dashboard** pelo Rilson, com
chaves pública e privada geradas. Estado verificado no código:

- [x] Backend webhook completo e testado (`RevenueCatWebhookController`
      + 9 casos em `RevenueCatWebhookTest.php`: auth por secret,
      INITIAL_PURCHASE/RENEWAL/EXPIRATION/CANCELLATION, compra
      não-renovante, app_user_id desconhecido sem quebrar).
- [x] Client integra SDK (`services/purchases.ts`), UI Pro trata
      ausência de oferta com "em breve".
- [x] **App Google Play criado no dashboard** (2026-08-21) — achado
      antes disso: a primeira chave tinha sido copiada de um app
      **Test Store** (prefixo `test_`, a loja falsa do RC pra testar
      paywall). Chave certa agora: `goog_Uwier...` (app
      `app748e094ea7`, URL scheme `rc-748e094ea7` — guardado pra deep
      link do portal do assinante no futuro).
- [x] **Chave configurada nos 3 lugares** (2026-08-21): `.env` local +
      EAS Environment **preview** e **production**
      (`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`). Republicado `eas update`
      canal preview logo em seguida (update group
      `2e4c2b2d-edfa-45cf-9c60-c7f409179bc3`) — sem isso o bundle não
      embute a chave.
- [ ] **Webhook ainda não configurado de verdade**: falta criar o
      webhook no dashboard RevenueCat (Integrations → Webhooks)
      apontando pra `https://api-remedios.narniano.com/webhooks/revenuecat`,
      copiar o valor do header `Authorization` que o RC gera e setar o
      MESMO valor em `REVENUECAT_WEBHOOK_SECRET` no `.env` do VPS.
      ⚠️ No VPS, depois de editar o `.env`: `docker compose up -d
      --force-recreate` (restart simples NÃO recarrega env_file —
      lição já registrada no hetzner-infra/README.md). Validar com o
      "send test event" do dashboard.
- [ ] **Estrutura de entitlement/produto**: criar entitlement `pro` +
      convenção de IDs (`meus_remedios_pro_mensal` / `_anual`) no
      dashboard AGORA; os produtos reais da Play só nascem pós-L0, mas
      os IDs têm que bater exato — decidir antes de criar lá.
- [ ] **Compra sandbox real** — bloqueada pela L0 (produto na Play +
      teste interno). Último passo do fluxo.

### ⚖️ Conformidade — Políticas da Play Store + LGPD (registrado 2026-08-21)

> Pedido do Rilson: "nem sei se o app está de acordo com as políticas
> de uso e LGPD". Auditoria dedicada ANTES de submeter à Play (L0),
> porque reprovação na revisão atrasa semanas. Dado de saúde = dado
> SENSÍVEL no LGPD (art. 11) — barra mais alta que app comum.

**Regra permanente do projeto:** todo lugar que citar contato
(política de privacidade, ajuda, formulários da Play, e-mails
transacionais) usa **meusremedios@narniano.com** — nunca e-mail
pessoal.

- [ ] **Permissões Android declaradas vs. justificáveis** — `app.json`
      declara `RECORD_AUDIO` (microfone!) num app de lembrete de
      remédio: ou tem uso real documentável ou REMOVER (provavelmente
      sobrou de algum módulo). Revisar também NOTIFICATIONS,
      RECEIVE_BOOT_COMPLETED, SCHEDULE_EXACT_ALARM (esses três têm
      justificativa clara: lembretes). Permissão injustificada é motivo
      clássico de rejeição.
- [ ] **Formulário Data Safety da Play** — já listado no L0; preencher
      com o que a política de privacidade REALMENTE diz (nome, e-mail,
      dados de tratamento, foto opcional; backend próprio, não
      terceiros além Sentry/RevenueCat/Resend).
- [ ] **Política Health Apps da Play** — apps de medicação caem sob
      política específica de saúde do Google Play: checar exigências de
      disclosure na primeira abertura e restrições de publicidade
      (relevante pro AdMob futuro: anúncio em tela de dose é
      permanentemente vetado por decisão própria, mas a política
      reforça).
- [ ] **LGPD art. 11 — base legal do dado sensível**: política atual
      fala em consentimento; conferir se o texto cobre explicitamente
      dado de saúde (tratamento/horários) e a hipótese de tutela da
      saúde. Ajustar texto se preciso.
- [ ] **LGPD portabilidade (art. 18, V)** — hoje não há exportação de
      dados pelo usuário (só exclusão). Item já mapeado como feature
      Pro (PDF); avaliar exportação simples em JSON independente de
      pagamento — barato e elimina risco reputacional.
- [ ] **Transferência internacional** — VPS Hetzner fica na UE: dados
      de brasileiros saem do país. LGPD permite, mas exige garantias
      (art. 33); conferir se a política menciona isso e se o contrato
      Hetzner/SCC cobre. Documentar decisão.
- [x] **Canal de contato único** — política de privacidade e remetente
      do magic link já usam `meusremedios@narniano.com` (commit
      `d1d28cb`). Regra permanente registrada no CLAUDE.md: TODO lugar
      que citar contato usa esse endereço.

---

## 🌐 Versão Web — Planejamento (2026-08-21)

> O projeto nasceu como app, mas tem espaço natural pra web: **o cuidador
> no computador**. Quem gerencia remédio de pai/mãe/filho à distância
> vive no desktop; conferir doses e histórico numa tela grande, com
> teclado de verdade pra cadastrar medicamento, é uso real — hoje sem
> resposta. O backend já está pronto pra isso: API REST + Sanctum,
> independente de cliente.

### Decisão de stack — duas opções honestas

| | **A. Expo Router web** (react-native-web) | **B. SPA separada** (Vite + React + TS) |
|---|---|---|
| Código | Um só (`expo export --platform web`) | Terceira base de UI |
| Reaproveito | ~90% (telas, stores Zustand, services, i18n, tema) | Só `services/` + tipos (axios puro) |
| Risco | Módulos nativos sem equivalente na web | Custo de manutenção dobrado pra sempre |
| UX | "App-like"; precisa trabalho responsivo | Web-native desde o dia 1 |

**Recomendação: começar pela A com spike curto (W0).** O app já é Expo
Router com lógica bem isolada em `services/`; o spike mede o dano real
em 1–2 dias e a decisão go/no-go fica documentada. Se o custo passar do
que vale, pivotar pra B já sabendo exatamente o que portar.

### O que NÃO porta direto (inventário do spike)

- `expo-notifications` — lembretes locais não existem na web assim → mock no-op na v1 (Web Push fica pro W3)
- RevenueCat / AdMob — billing e anúncios são ecossistemas separados na web → feature flag off (monetização web = decisão futura própria, Stripe/Pagar.me)
- `expo-image-picker` — câmera não; galeria vira `<input type=file>` ou fica desabilitada na v1
- `expo-sqlite` (fila offline) — web fica online-only na v1 (IndexedDB só se fizer sentido depois)
- `expo-haptics`, NetInfo etc. — têm fallback/no-op natural

O que reaproveita intacto: autenticação (mesmos tokens Bearer Sanctum —
backend só precisa de CORS pro domínio novo), stores Zustand persistidos,
services de API, i18n pt/en/es, tema claro/escuro, toda a regra de
negócio de doses/schedules que já mora no backend.

### Fases

- **W0 — Spike go/no-go (1–2 dias):** habilitar plataforma web, mocks dos
  módulos acima, rodar as 9 telas no browser, documentar o que quebrou.
  Métrica de decisão: % de código adaptado vs. duplicado.
- **W1 — MVP "companheira do cuidador" (~1 semana):** Hoje (marcar/
  pular/desfazer), Histórico, Estoque, login (Google OAuth com redirect
  URIs web novas no GCloud + magic link), layout responsivo, deploy
  estático no VPS (`web-remedios.narniano.com`, nginx + Traefik como os
  outros).
- **W2 — Paridade útil:** cadastro/edição completa de medicamento (formulário
  longo rende muito mais no desktop), convite de cuidador por deep link
  (`?code=XXXX`), PWA instalável (manifest + service worker).
- **W3 — Notificações web:** Web Push (VAPID) como canal adicional do
  push por servidor que já existe (cron Laravel já dispara; adiciona-se
  destino web). Só depois de destravar L0/L1 mobile.

### Princípio

Web entra como **segunda frente do mesmo produto**, não como projeto
paralelo: mesma API, mesmas contas, mesmos perfis compartilhados. O que
não existir na web (push, foto por câmera) degrada com aviso honesto,
nunca quebra silenciosamente.
