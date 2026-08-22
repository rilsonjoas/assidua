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
- [x] **Webhook configurado e VALIDADO em produção** (2026-08-21): secret
      gerado localmente (`openssl rand -hex 32`) e colado cru nos dois
      lados — campo "Authorization header value" do RC e
      `REVENUECAT_WEBHOOK_SECRET` no `.env` do VPS (`/opt/meus-remedios/
      api/.env`, backup feito antes). Container recriado com
      `--force-recreate`. Validação real via curl:
      sem auth → 401; com auth → `{"status":"ignored"}` (tipo
      desconhecido + usuário inexistente ignorados com graça).
      ⚠️ **URL certa tem prefixo `/api`**:
      `https://api-remedios.narniano.com/api/webhooks/revenuecat`
      (rota mora em routes/api.php; sem o prefixo dá 404 silencioso).
      HMAC fica desabilitado (o backend autentica pelo header; HMAC
      seria melhoria futura).
- [x] **Entitlement criado** (2026-08-22): `pro` ("Meus Remédios Pro") é
      o identifier oficial pra produtos reais pós-L0. DECISÃO: o antigo
      `meus_remédios_pro` (com acento, criado antes) fica como está,
      preso aos 3 produtos da Test Store — não afeta produção porque o
      backend concede Pro pelo TIPO do evento, nunca pelo entitlement_id
      (conferido no código e nos 9 testes), e o client só usa offerings.
      Deletar exigiria desanexar produto a produto; custo > benefício.
      Post-L0: produtos reais (`meus_remedios_pro_mensal` / `_anual`)
      nascem anexados ao `pro`.
- [x] **Webhook ENTREGA CONFIRMADA pelo RC** (2026-08-21/22): primeiro
      test event deu 404 — o Rilson tinha colocado o `/api` NO FIM da
      URL (`/webhooks/revenuecat/api`, visto no access log); corrigido
      pra `/api/webhooks/revenuecat` → 200 com `{"status":"ignored"}`
      (evento TEST + UUID ignorado com graça = comportamento correto).
      Validado dos dois lados: curl manual E delivery real do RC
      (`"POST /api/webhooks/revenuecat" 200 "-" "RevenueCat"` no access
      log do container). Secret idêntico nos dois lados, HMAC
      desabilitado de propósito.
- [ ] **Compra sandbox real** — bloqueada pela L0 (produto na Play +
      teste interno). Último passo do fluxo.

### ⚖️ Conformidade — Políticas da Play Store + LGPD (auditada 2026-08-22)

> Pedido do Rilson: "nem sei se o app está de acordo com as políticas
> de uso e LGPD". Auditoria dedicada ANTES de submeter à Play (L0),
> porque reprovação na revisão atrasa semanas. Dado de saúde = dado
> SENSÍVEL no LGPD (art. 11) — barra mais alta que app comum.

**Regra permanente do projeto:** todo lugar que citar contato
(política de privacidade, ajuda, formulários da Play, e-mails
transacionais) usa **meusremedios@narniano.com** — nunca e-mail
pessoal.

- [x] **Permissões Android** — achado real: `RECORD_AUDIO` (microfone!)
      declarado num app de lembrete de remédio, zero uso no código,
      zero pacote de áudio instalado. Removida de `app.json`
      (commit `9e4ec81` era a política; remoção da permissão no commit
      seguinte). Vale lembrar: permissão sai do APK só no PRÓXIMO BUILD
      (eas update não muda manifest) — como não existe build de
      produção ainda, o primeiro AAB já nasce limpo. As 3 restantes
      têm justificativa direta (NOTIFICATIONS/RECEIVE_BOOT_COMPLETED/
      SCHEDULE_EXACT_ALARM = lembretes).
- [x] **Política de privacidade auditada e corrigida ao vivo**
      (`9e4ec81`, deploy confirmado): faltavam disclosure de 4
      processadores reais (Resend/e-mail, Expo/push, RevenueCat/
      assinaturas, Hetzner por nome) + transferência internacional
      (servidor na UE → art. 33 LGPD) + retenção honesta dos backups
      ("exclusão definitiva" convivia com dumps diários de 14 dias sem
      dizer isso). Tudo escrito; página servindo a versão nova.
- [x] **Base legal do dado sensível (art. 11)** — já correta desde
      antes: consentimento explícito na criação da conta, retirável
      excluindo a conta (seção 7 da política).
- [x] **Portabilidade de dados (art. 18, V) — IMPLEMENTADA** (era
      "só por e-mail"): `POST /me/export-link` gera URL assinada de
      10 min; download JSON completo (conta, perfis próprios,
      medicamentos, horários, estoque, histórico de doses; perfis
      compartilhados só como referência). Botão "Exportar meus dados"
      em Perfis. 5 testes novos no backend (auth obrigatória, id
      trocado → 403, sem assinatura → 403, isolamento entre usuários).
- [x] **Termos de Uso** — página `/termos` no backend + link no
      cadastro ("Política de Privacidade e Termos de Uso"). Com o
      disclaimer de saúde exigido pela política Health Apps da Play:
      app é organizador, NÃO dispositivo médico, não substitui
      orientação profissional, nunca decidir medicação pelo app.
      Checagem: nenhum claim médico nos textos do app (grep i18n).
- [x] **Data safety form pré-mapeado** — tabela pronta no README (L0)
      pra colar na Play Console quando chegar a hora.
- [ ] **Revisão manual TalkBack/VoiceOver** em aparelho físico (P7) —
      único item de acessibilidade que não dá pra automatizar.
- [ ] **Teste fechado L0**: 12 testadores / 14 dias (bloqueado pela
      conta Google Play).

> ⚠️ Nota de ambiente (2026-08-22, RESOLVIDA): rodar a suíte backend no
> container avulso `laravelsail/php84-composer` falha em 6 casos do
> MedicationPhotoTest com "GD extension is not installed" (imagem sem
> GD). **Resolução: rodar pelo Sail** (`./vendor/bin/sail artisan test`),
> que tem GD — verificado nesta data: **216/216 passando**, incluindo
> os 5 novos do DataExport. Nenhuma mudança de código foi necessária.

## Estado na pausa (2026-08-22)

Sessão encerrada com tudo publicado:

- **App**: último `eas update` canal `preview` inclui múltiplos horários
  + presets, logo na home/Perfis, botão "Exportar meus dados" e link
  dos Termos no cadastro (commit `a351963`, update `b635c4ab`).
- **Backend no ar** (`api-remedios.narniano.com`): política de
  privacidade revisada (LGPD), `/termos` novo, exportação LGPD ativa,
  webhook RevenueCat validado end-to-end.
- **Mobile**: 145/145 testes · TypeScript limpo. **Backend**: 216/216
  via Sail.
- **RevenueCat**: completo dentro do possível pré-L0 (chave `goog_`
  configurada nos 3 ambientes, webhook entregando 200, entitlement
  `pro` oficial).
- **Pendências abertas** (nada pausado por esquecimento): L0 (US$25) →
  desbloqueia loja + produtos RC + sandbox; TalkBack/VoiceOver manual;
  versão web (plano pronto, spike não iniciado); primeiro build de
  produção já nasce sem `RECORD_AUDIO`.

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
  estático no VPS (`meusremedios.narniano.com`, nginx + Traefik como os
  outros). **Domínio decidido pelo Rilson em 2026-08-22**: o produto é
  standalone e NÃO entra no cluster "A Biblioteca" (nicho diferente) —
  subdomínio próprio do nome do app.
- **W2 — Paridade útil:** cadastro/edição completa de medicamento (formulário
  longo rende muito mais no desktop), convite de cuidador por deep link
  (`?code=XXXX`), PWA instalável (manifest + service worker).
- **W3 — Notificações web:** Web Push (VAPID) como canal adicional do
  push por servidor que já existe (cron Laravel já dispara; adiciona-se
  destino web). Só depois de destravar L0/L1 mobile.

### ✅ W0 executado — GO (2026-08-22)

Spike compilou de primeira. Métrica de decisão (% adaptado vs.
duplicado): **zero telas duplicadas** — a web reusa as 9 telas, tema
WCAG-AA, componentes, stores, services e i18n intactos. O custo inteiro
foi 3 shims + 2 pequenos guards.

- **Deps** (`expo install`, versões do SDK): `react-dom@19.2.3`,
  `react-native-web@^0.21.2`, `@expo/metro-runtime@~56.0.20`
- **Mecanismo**: extensões `.web.ts` do Metro — assinaturas idênticas
  às dos módulos nativos, nenhuma tela importou coisa nova:
  - `services/offlineQueue.web.ts` — web v1 ONLINE-ONLY: fila sempre
    vazia, `drainQueue` vira no-op natural e marcar dose offline falha
    visivelmente (erro de rede na tela) em vez de silenciar
  - `services/purchases.web.ts` — flag off estrutural:
    `getCurrentOffering()` null → pro.tsx mostra "em breve" com o ramo
    de UI que JÁ existe; tipos locais estruturais (pro.tsx só usa tipos,
    que somem no bundle)
  - `services/notifications.web.ts` — no-op honesto:
    `requestNotificationPermission()` false = telas tratam como "sem
    permissão"; lembretes locais não existem no browser, Web Push é W3
- **Guards**: `app/_layout.tsx` roda `Sentry.init/wrap` só no nativo
  (`@sentry/react` web é decisão pós-spike); `app.json` ganhou
  `web.output: "single"` (SPA atrás do nginx estático)
- **O que funcionou SEM tocar**: expo-secure-store (web usa localStorage),
  NetInfo, expo-haptics (no-op embutido), expo-image-picker (vira file
  picker), expo-auth-session (web é o habitat nativo dele)
- **Validação**: `expo export --platform web` OK (bundle 4.2MB) ·
  `tsc --noEmit` limpo · 145/145 testes mobile passando (shims não
  afetam resolução nativa) · `dist/` servida com HTTP 200
- **Confirmado FORA do bundle web**: `expo-sqlite` e
  `react-native-purchases`

### 🔍 Primeiro teste real da web — 3 achados corrigidos (2026-08-22)

Rilson rodou `expo start --web` e testou login de verdade. O que
quebrou, a causa raiz de cada um e o fix:

1. **"Conexão recusada" ao tocar Google** — não era código: o backend
   dev (`docker compose`/Sail na :80) estava PARADO. Subido, API
   respondeu 401 certinho. O `.env` aponta pra
   `http://100.85.29.100/api` (IP Tailscale da própria máquina).
2. **Magic link sem reação nenhuma na tela** — causa raiz feia e real:
   `Alert.alert` é NO-OP no react-native-web. Todo erro capturado do
   app morria silencioso na web, em TODAS as telas (29 call sites).
   Fix: `lib/alert.ts` com `showAlert()` (web → `window.alert`, nativo →
   SDK, mensagem ausente NÃO vira '' — os testes fixam aridade 1).
   Exceção preservada: ActionSheet de foto no `[id].tsx` continua
   `Alert.alert` com botões no nativo; na web vai DIRETO pra galeria
   (`<input type=file>`), porque câmera não existe lá.
3. **Google OAuth web** — `return_url=meusremedios://auth-callback`
   (custom scheme) não navega no browser. Fix em
   `services/auth.ts`: branch web usa redirect completo na mesma aba
   com `return_url = {origin}/auth-callback` — a rota já lia query
   params desde o achado de 14/08, então o contrato é idêntico ao deep
   link nativo.

**CORS**: verificado — sem `config/cors.php`, vale o default do Laravel
(`allowed_origins: *`) e funciona porque o app usa Bearer token sem
cookies. Pendência de produção: restringir pra
`https://meusremedios.narniano.com`.

Validação pós-fix: `tsc --noEmit` limpo · 145/145 testes · export OK.

### 🔍 Segunda rodada de testes reais — 4 achados (2026-08-22, tarde)

1. **🔴 Achado GRAVE, além da web: links de magic-link quebrados em
   TODOS os ambientes** — `url('/auth/magic-link/redirect')` no e-mail
   monta pela ROOT DA REQUEST quando roda em contexto HTTP (o APP_URL só
   vale no console), então o link saía SEM o prefixo `/api` da rota →
   404 ao clicar. Local confirmado com 404; produção provavelmente idem
   (a rota `/api/auth/magic-link/redirect` responde lá, mas o link do
   e-mail apontava pra variante sem `/api`). Fix determinístico no
   `MagicLinkMail`: origem do `APP_URL` (com ou sem sufixo `/api`) +
   `/api/auth/magic-link/redirect?token=...` explícito. **Se alguém já
   reclamou de "link de acesso não funciona", era isso.**
2. **Migrations locais desatualizadas** — tabela `login_links`
   (14/08) não existia no MySQL do Sail; POST /magic-link estourava
   500 (virou issue no Sentry). `php artisan migrate --force` resolveu.
3. **Magic link na web exigia branch próprio** — o redirect hardcoded
   `meusremedios://` não navega no browser. Implementado com segurança:
   `WEB_AUTH_ORIGINS` (allowlist no .env/.env.example), SPA manda
   `redirect_origin` na criação, o link carrega `&origin=` e o
   `magicLinkRedirect` valida DUAS vezes contra a allowlist antes de
   mandar pra `{origin}/auth-callback` — sem isso, pedir link pro
   e-mail alheio seria vetor de roubo de token. Teste ponta-a-ponta
   local: 302 → `localhost:8081/auth-callback?token=...` ✓
4. **Armadilha registrada: NÃO colocar sufixo no APP_URL** — feature
   tests usam `APP_URL` como baseUrl; com `APP_URL=.../api` toda
   requisição virava `/api/api/...` → 19+2 testes 404 globalmente
   (custou um debug desnecessário). APP_URL fica origem pura; o e-mail
   resolve o prefixo sozinho (item 1).

**Pendente de ação externa (Google dev)**: adicionar
`http://localhost/api/auth/google/callback` às "Authorized redirect
URIs" do OAuth client no GCloud pro login social funcionar no ambiente
local (produção já tem o dele). Erro atual: `400 redirect_uri_mismatch`.

### 🔴 PENDENTE — Fragmentação de contas: Google vs magic link com mesmo e-mail (reportado 2026-08-22)

**Achado real em produção**: logou pelo Google, depois por magic link
com o MESMO e-mail — dados vistos são diferentes. Duas contas para a
mesma pessoa.

**Causa raiz** (`AuthController::googleCallback`): `updateOrCreate`
casa exclusivamente por `google_id`; conta pré-existente criada por
magic link (e-mail sem google_id) nunca é encontrada → duplicata.
O fluxo inverso já casa certo (magic-link busca por e-mail).

**Correção em 2 partes:**

1. **Código** — resolver conta por `google_id` OU por `email`;
   achando por e-mail, VINCULAR o google_id na conta existente
   (+ avatar/verificação), não criar nova. Seguro: o Google garante
   posse do e-mail. Teste novo obrigatório: "login Google de e-mail
   que já existe via magic link NÃO duplica conta" (cenário atual
   passa reto e nem tem teste).
2. **Dados** — merge one-time das duplicatas JÁ existentes (caso do
   próprio Rilson). Backup do banco ANTES (P6); apontar google_id pra
   conta dona dos dados; migrar órfãs se houver; excluir a vazia.
   Script versionado (comando artisan), nunca SQL solto.

**Regra de produto**: um e-mail = uma pessoa = uma conta, qualquer
porta de entrada.

### 🟡 W2 — Backlog visual web (testes reais do Rilson, 2026-08-22 noite)

- [ ] **Logo real em vez de ícone genérico**: telas de login/cadastro
      usam `MaterialCommunityIcons 'pill'` no logoBox e a WebTopNav usa
      o mesmo ícone de fonte — trocar pelo logotipo de verdade
      (coração+relógio, assets já existem). Favicon da web conferir.
- [ ] **Home web: menos logos repetidos** — hoje acumula navbar (marca)
      + header com mark pequeno + marca d'água grande. Em wide, escolher
      UM ponto de marca por tela (navbar carrega a identidade; header
      interno pode ficar só tipografia).
- [ ] **Onboarding desktop quebrado** — elementos soltos/desalinhados
      em tela larga (layout assume largura de celular). Nota: aparece
      UMA vez por navegador/storage (flag própria), mas precisa ficar
      bonito na primeira vez também.
- [ ] **Perfil: chips de Idioma quebrando em 2 linhas** mesmo com
      conteúdo ≤960px — revisar minWidth/flex dos chips quando wide
      (Aparência/Fonte cabem em 1 linha; Idioma tem 4 opções).
- Nota de calibração: a centralização matemática confere (margens
  iguais nos dois lados); a sensação de desalinhado vem da faixa vazia
  à direita vs navbar full-bleed — reavaliar após os itens acima.

### 🎨 Adaptação UI web completa — aprovada pelo Rilson (2026-08-22, noite)

Da crítica "parece mobile esticado" ao aprovado em 4 iterações de uso
real. Fundação:

- **Breakpoint único**: `hooks/useBreakpoint.ts` (`useIsWideScreen`,
  ≥768px). Regra de ouro descoberta no processo: **o que faz algo
  parecer site é a NAVEGAÇÃO, não a largura**.
- **Shell web das tabs**: `components/WebTopNav.tsx` (navbar full-bleed
  com marca + links horizontais, estado ativo) substitui a tab bar
  inferior em telas largas; `(tabs)/_layout.tsx` esconde a tab bar e
  monta o shell só em `Platform.OS === 'web' && isWide` (nativo/iPad
  mantém tabs). `<Link asChild>` exige estilo FILHO achatado
  (`StyleSheet.flatten`) — array estoura erro do `<Slot>`.
- **Regra de frame**: `_layout.tsx` global só frameia auth/onboarding
  (coluna 520). Tabs = largura total (navbar full-bleed); telas fora
  das tabs controlam a própria largura por dentro.
- **Scroller nativo de site**: container de scroll SEMPRE full-bleed —
  barra encosta na borda da janela; limitação de largura mora no
  `contentContainerStyle` (`listWide`/`innerWide`, max 960/720).
- **Grids 2 colunas** no desktop: Hoje (doses), Remédios, Estoque
  (`numColumns={isWide?2:1}` + `key` pra remount obrigatório +
  `columnWrapperStyle`). Histórico/perfil permanecem coluna única
  centralizada por decisão de leitura.
- **Fachadas `.web.ts` novas**: `tokenStorage` (localStorage no browser;
  SecureStore puro-nativo explodiu em runtime no auth-callback) e
  `lib/alert.ts` (`showAlert` cross-platform; aridade preservada pros
  testes). ActionSheet de foto continua nativa; na web vai direto pra
  galeria.

Validação final da sessão: `tsc` limpo · **145/145 mobile · 216/216
backend** · export OK · aprovado visualmente pelo Rilso nas 9 telas.

**Deploy W1 acoplado nesta sessão**: serviço `remedios-web`
(nginx:alpine + `web-nginx.conf` SPA fallback) no compose do
hetzner-infra; workflow Deploy VPS agora constrói a web no runner
(`EXPO_PUBLIC_API_URL` de produção embutida via env do step) publica
em `/opt/meus-remedios/web` e sobe os dois serviços. One-time no VPS:
`WEB_AUTH_ORIGINS` de produção no `.env` da api + pull do
hetzner-infra (README do infra documenta).

### Princípio

Web entra como **segunda frente do mesmo produto**, não como projeto
paralelo: mesma API, mesmas contas, mesmos perfis compartilhados. O que
não existir na web (push, foto por câmera) degrada com aviso honesto,
nunca quebra silenciosamente.

---

## Marketing e Distribuição (2026-08-22)

> Tier 1 de monetização ([[Monetização e Saúde dos Projetos]]) merece plano
> de distribuição à altura. Código não gera usuário sozinho.

### Pré-requisito inegociável

- [ ] **Só divulgar depois do L0 publicado na Play Store** — tráfego pra app indisponível é desperdiçado e queima a primeira impressão. Bloqueio atual: $25 da conta Google Play

### Alavanca central: loop viral embutido no produto

O cuidador remoto exige convite entre contas separadas — cada usuário ativo tem motivo real pra trazer outra pessoa. Nenhum canal externo supera isso.

- KPI principal: % de usuários que enviam convite de cuidador
- KPI secundário: conversão free → pro (RevenueCat já integrado, entitlement `pro`)
- Ação: tela pós-convite precisa vender o valor pro CUIDADOR — quem recebe o link decide instalar

### ASO (Play Store), quando L0 sair

- Termos-alvo: "lembrete de remédio", "horário de medicamentos", "app para idosos tomar remédio", "cuidador de idoso", "controle de cartela"
- Descrição liderando com diferenciais reais vs Medisafe/MyTherapy: cuidador entre contas + push por servidor + offline

### Canais orgânicos (sem orçamento)

1. Grupos de Facebook/WhatsApp de cuidadores de idosos (nicho Alzheimer é grande e carente) — participar como gente, nunca spam; história pessoal ("fiz esse app pra minha família") é o pitch
2. TikTok/Reels de rotina de cuidado ("como organizo os remédios da minha avó")
3. Imprensa tech BR / newsletters nacionais — só depois do L0/L1, pra não cobrir app que não dá pra instalar
4. Reddit r/brasil — história pessoal real, não autopromoção

### Sequência

L0 publicado → teste fechado → produção → ASO polido → 2 canais em ritmo semanal → medir convites/semana → L1 quando houver base crítica.
