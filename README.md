# Meus Remédios

Gestão de medicamentos para pacientes crônicos — controle de doses, alarmes, histórico de adesão e estoque. Produto de massa (freemium), com AdMob + assinatura Pro via RevenueCat planejados para pós-MVP.

---

## Stack

| Camada | Tecnologia |
|---|---|
| App mobile | Expo SDK 56 (React Native) + TypeScript |
| Navegação | Expo Router (file-based) |
| Backend API | Laravel 13 (PHP 8.4) |
| Banco de dados | MySQL 8.4 via Laravel Sail (Docker) |
| Autenticação | Sanctum (tokens) + Socialite (Google OAuth) |
| Notificações locais | expo-notifications |
| Estado global | Zustand |
| Cache / server state | TanStack React Query |
| HTTP | Axios + interceptor SecureStore |
| Ícones | @expo/vector-icons (MaterialCommunityIcons) |
| Tema | Hook `useTheme` + tokens light/dark, persistido em AsyncStorage |
| Build | EAS Build (cloud) |
| Anúncios | AdMob — pendente |
| Assinaturas | RevenueCat — pendente |

---

## Estrutura

```
meus-remedios/
├── app/                          # Expo (React Native)
│   ├── app/
│   │   ├── _layout.tsx           # Root layout, auth guard, permissão de notificação
│   │   ├── (auth)/
│   │   │   ├── login.tsx         # Login email/senha + botão Google
│   │   │   └── register.tsx      # Cadastro + botão Google
│   │   ├── (tabs)/
│   │   │   ├── index.tsx         # Hoje — doses do dia com Tomei/Pular
│   │   │   ├── medications.tsx   # Lista de medicamentos
│   │   │   ├── history.tsx       # Histórico com filtros de status
│   │   │   ├── stock.tsx         # Controle de estoque
│   │   │   └── profile.tsx       # Perfis, conta, seletor de tema
│   │   └── medication/[id].tsx   # Criar/editar medicamento + gerenciar horários
│   ├── constants/
│   │   └── theme.ts              # Tokens de cor light/dark
│   ├── hooks/
│   │   └── useTheme.ts           # Hook que retorna colors + isDark
│   ├── services/
│   │   ├── api.ts                # Instância Axios com interceptor de token
│   │   ├── auth.ts               # login, register, logout, getMe, loginWithGoogle
│   │   ├── medications.ts        # CRUD medicamentos, horários, estoque
│   │   ├── doses.ts              # Doses de hoje, histórico, registrar dose
│   │   └── notifications.ts      # Agendar/cancelar notificações locais
│   └── store/
│       ├── authStore.ts          # Usuário autenticado
│       ├── profileStore.ts       # Perfil ativo + lista de perfis
│       └── themeStore.ts         # Preferência de tema (system/light/dark)
└── api/                          # Laravel 13
    ├── app/Http/Controllers/
    │   ├── AuthController.php    # register, login, logout, me, googleRedirect, googleCallback
    │   ├── ProfileController.php
    │   ├── MedicationController.php
    │   ├── DoseScheduleController.php
    │   ├── DoseLogController.php
    │   └── StockController.php
    ├── app/Models/               # User, Profile, Medication, DoseSchedule, DoseLog, StockItem
    ├── database/migrations/
    ├── routes/api.php
    └── docker/                   # nginx.conf, supervisord.conf, entrypoint.sh (para deploy)
```

---

## Modelo de dados

```
users
 └── profiles
      └── medications
           ├── dose_schedules → dose_logs
           └── stock_items
```

---

## O que está funcionando

### Auth
- [x] Cadastro e login com email/senha
- [x] Google OAuth — backend pronto (Socialite); frontend com `expo-web-browser` implementado, aguarda credenciais no Google Cloud Console
- [x] Auth guard automático (redireciona para login se não autenticado)
- [x] Validação de erros em português (pt_BR via laravel-lang)

### App mobile
- [x] Tela **Hoje** — lista doses do dia calculadas a partir dos schedules ativos, botões Tomei/Pular, contador de progresso, chips de perfil com ícone
- [x] Tela **Remédios** — lista com cor, dosagem, quantidade em estoque; FAB para adicionar
- [x] Tela **Histórico** — filtro por status (Todos/Tomado/Pulado/Perdido), agrupado por data, card de adesão com %
- [x] Tela **Estoque** — edição inline de quantidade, alerta visual de estoque baixo
- [x] Tela **Perfis** — múltiplos perfis de paciente, ícone + cor customizáveis, seletor de tema (Sistema/Claro/Escuro)
- [x] Formulário de medicamento — criar/editar dados, seletor de cor, gerenciamento de horários com picker de dias da semana
- [x] Modo claro e escuro com detecção automática do sistema ou escolha manual
- [x] Ícones em todo o app (MaterialCommunityIcons), sem emojis

### Backend
- [x] API REST completa com autenticação Sanctum
- [x] Endpoint `/today` calcula doses do dia dinamicamente via `dose_schedules` — não depende de logs pré-existentes
- [x] Filtros no histórico: `status`, `medication_id`, `date_from`, `date_to`
- [x] Dockerfile + nginx + supervisord prontos para deploy em container

### Notificações locais
- [x] Permissão solicitada no startup
- [x] Notificação diária ou semanal agendada ao criar horário de dose
- [x] Notificação cancelada ao remover horário

---

## Roadmap

### Fase 1 — MVP profissional (fazer antes de lançar)

Funcionalidades que, se faltarem, o usuário desinstala ou não confia no app.

- [x] **Corrigir dose** (2026-08-09) — toque no badge "Tomado"/"Pulado" na tela Hoje desmarca (`DELETE /dose-logs/{id}`, `DoseLogPolicy`, testado em `DoseLogDestroyTest.php` e `__tests__/home.test.tsx`)
- [x] **Status automático "Perdido"** (2026-08-09) — dose com horário passado e sem log vira `missed` na hora em que o app é aberto (não precisa de cron), persistido de verdade pra contar no histórico; continua acionável (dá pra marcar "Tomei" atrasado, sobrescreve via `updateOrCreate`)
- [x] **Onboarding guiado** (2026-08-09) — carrossel de 3 telas na primeira abertura (`app/(onboarding)/`), gate por `onboardingStore` persistido (não por perfil vazio — apagar perfis não deveria reabrir onboarding). Pedido de notificação saiu do boot "a frio" e passou a acontecer contextualizado no fim do onboarding
- [x] **Haptic feedback** (2026-08-09) — `expo-haptics`, dispara no sucesso da mutação (não no toque em si, evita falso positivo se a chamada falhar)
- [x] **Refill alert inteligente** (2026-08-09) — `days_remaining` calculado no backend (`Medication::dosesPerDay()`, considera `days_of_week` restrito, não só doses/dia fixo), exposto em todo JSON de medicamento; banner na tela Hoje, texto "Acaba em N dias" na tela Estoque, notificação local agendada ao atualizar quantidade (limiar: 7 dias, ajustável via `LOW_STOCK_DAYS_THRESHOLD`)
- [x] **Exclusão de conta** — já implementado (tela Perfil, confirma senha se houver), mas achado real em 2026-08-09: zero teste cobria isso. `AuthDestroyAccountTest.php` agora confirma cascata real no banco (profile → medication → schedule → dose_log → stock, todos apagados), senha errada rejeitada, conta OAuth sem senha exclui sem pedir senha
- [x] **Política de privacidade** — já implementado: link real na tela de cadastro (`app/(auth)/register.tsx`) pra `/privacidade`, página publicada no backend (`routes/web.php`, `resources/views/privacy.blade.php`)

### Fase 2 — Retenção e qualidade (v1.1, após primeiros usuários)

- [ ] **Gráfico de adesão** — barras semanais dos últimos 2 meses com % de doses tomadas; visível no Histórico
- [ ] **Pausar medicamento** — suspender temporariamente sem deletar (ex.: internação, viagem); reativar depois
- [ ] **Streak de adesão** — contador de dias consecutivos com 100% de doses; notificação de parabenização ao atingir 7, 30, 60 dias
- [ ] **Resumo semanal** — notificação local automática (ex.: domingo à noite) com % de adesão da semana
- [ ] **Skeleton loaders** — substituir `ActivityIndicator` por skeletons animados nas listas
- [ ] **Editar horário existente** — hoje só cria/deleta; falta poder alterar hora e dias de um schedule já criado
- [ ] **Filtro por medicamento no histórico** — dropdown/modal para filtrar por remédio específico

### Fase 3 — Infraestrutura (paralela às fases 1 e 2)

- [x] **Google OAuth** (2026-08-08) — credenciais criadas, testado com redirect real em produção
- [ ] **Offline support** — salvar `dose_logs` localmente (expo-sqlite) quando sem internet, sincronizar ao reconectar
- [x] **Deploy do backend** (2026-08-08) — VPS Hetzner próprio, `api-remedios.narniano.com`, Postgres (não MySQL — ver `hetzner-infra/MIGRATION.md` Fase 4.2)

### Fase 4 — Monetização (pós-lançamento com usuários reais)

- [x] **Limites do plano Free** — 4 perfis, 15 medicamentos por perfil, histórico de 30 dias — já implementado e testado (ver `tests/Feature/ProfileTest.php`, `MedicationTest.php`, `DoseLogHistoryTest.php`). Falta a parte de cobrança em si (Fase L1 abaixo)
- [ ] **Tier Pro** — perfis ilimitados, medicamentos ilimitados, histórico completo, sem anúncios; via RevenueCat
- [ ] **AdMob** — banners e/ou interstitials para usuários Free
- [ ] **Exportar histórico em PDF** — funcionalidade Pro: gerar relatório para levar ao médico
- [ ] **Publicar na Play Store e App Store**

---

## Roadmap de Lançamento e Crescimento (2026-08-08)

Resposta a uma pergunta direta: "o quanto falta pra virar um app com
milhares de usuários na Play Store?". Não duplica as Fases 1-4 acima —
linka nelas onde já existe o item, só adiciona o que faltava (processo
de publicação em si, monetização de verdade, aquisição, legal em
escala). Prioridade estrita: **L0 → L1 → L2 → resto**, nessa ordem —
não adianta ter monetização sem estar na loja, nem growth sem retenção.

### L0 — Publicação (bloqueadores reais, sem isso não sai do zero)

- [ ] Conta de desenvolvedor Google Play (**US$25, taxa única**)
- [ ] **Teste fechado obrigatório**: Google exige **12 testadores ativos
      por 14 dias** antes de liberar produção pra conta de desenvolvedor
      nova — não dá pra pular, planejar esse tempo
- [ ] **Formulário "Data safety"** no Play Console — declarar coleta de
      dado de saúde, passa por revisão mais rigorosa que app comum
- [ ] `eas build --profile production` + `eas submit` — nunca rodado
- [x] **Fase 1 completa** (2026-08-09) — os 7 itens que, segundo o
      próprio roadmap, "se faltarem, o usuário desinstala" (corrigir
      dose, status "Perdido", onboarding, haptic feedback, refill alert,
      exclusão de conta, política de privacidade). Único bloqueador real
      de L0 que restava era código — o resto é conta/processo/tempo de
      espera do Google, não engenharia

### L1 — Monetização de verdade (a régua já existe, falta cobrança)

- [x] Limites do plano Free já codados e testados (ver Fase 4 acima)
- [ ] **RevenueCat**: criar conta, configurar produto de assinatura
      (mensal + anual, com desconto no anual), integrar SDK
      (`react-native-purchases`), tela de paywall
- [ ] **Decisão de preço**: pesquisar concorrência direta antes de
      chutar número — Medisafe e MyTherapy são a referência do nicho
- [ ] **AdMob**: conta, unidades de anúncio, SDK, posicionamento que não
      atrapalhe a experiência de quem toma remédio (nada de interstitial
      na hora de marcar "Tomei")
- [ ] Exportar histórico em PDF (Pro) — já mapeado acima

### L2 — Retenção (Fase 2 acima, sem mudança — só reforçando a ordem)

Sem isso, app de hábito tende a abandono alto nos primeiros dias — é o
padrão da categoria, não conquista de pouca gente. Fazer **antes** de
investir em aquisição, senão o usuário novo entra e sai sem voltar.

### L3 — Aquisição (a parte que não é código)

- [ ] **ASO** (App Store Optimization) — título, descrição, screenshots
      e ícone da ficha otimizados pra busca dentro da própria Play
      Store (é a maior fonte de instalação orgânica pra app novo sem
      budget de ads)
- [ ] **Ângulo de diferenciação real** — Medisafe/MyTherapy já têm
      milhões de instalações; "mais um app de lembrete" sozinho não
      compete. Precisa de um motivo específico (nicho: idioma, público
      cuidador↔paciente, algo que os grandes não fazem bem) — decisão de
      produto, não de engenharia, mas trava tudo o resto se não for
      resolvida
- [ ] **Analytics de aquisição real** — hoje não existe nada disso
      (Sentry cobre erro, não uso). Firebase Analytics ou similar antes
      de gastar esforço tentando crescer às cegas

### L4 — Legal/compliance em escala

- [x] Política de privacidade real, publicada (`/privacidade`)
- [ ] **Revisão jurídica de verdade** da política — dado de saúde é
      categoria sensível pela LGPD; com poucos usuários o risco é
      teórico, com milhares vira exposição real (resposta a incidente,
      portabilidade de dado, etc.)
- [ ] Termos de uso — hoje só existe a política de privacidade, não um
      termo de uso separado

### L5 — Infra em escala (só quando o uso justificar, não adiantar)

- [ ] **Notificação push via servidor**, não só local — hoje a
      notificação é agendada no próprio celular; se o SO mata o app ou
      o celular reinicia, pode falhar silenciosamente. Em escala pequena
      não importa muito, em escala grande vira reclamação recorrente
- [ ] Sair do VPS único compartilhado com os outros projetos pessoais,
      se o uso realmente justificar — não é preocupação de agora

### Resumo honesto

**Pra estar na loja**: dias/poucas semanas — é a parte mais perto de
terminar, a base técnica (P0-P7) que fechamos hoje é justamente o que
mais diferencia isto de um projeto que nunca sai do papel.
**Pra ter milhares de usuários reais**: a distância maior não é mais
código — é produto (retenção, L2) e principalmente aquisição (L3), que
é decisão de negócio e de nicho, não engenharia.

## Roadmap de Engenharia (qualidade/produção)

Complementar ao roadmap de produto acima, não concorrente — essas fases
rodam em paralelo. Segue o padrão comum a todos os projetos pessoais,
documentado em `hetzner-infra/PADRAO-DE-ENGENHARIA.md` — aqui só o
estado real deste projeto em cada fase.

> [!NOTE] Numeração atualizada em 2026-08-09
> `PADRAO-DE-ENGENHARIA.md` foi renumerado de forma limpa (fundido com o
> checklist SHIELD, que trouxe 2 categorias novas: Saúde & Resiliência e
> Backups & Recuperação). Os itens abaixo já usam a numeração nova e
> definitiva — se você tiver anotado a numeração antiga em algum lugar
> (P2 = CI/CD, P4 = Monitoramento), ela mudou.

- [x] **P0 — Segurança** (2026-08-08): `throttle:login` (5/min por
      email+IP) e `throttle:register` (5/min por IP) em
      `/api/auth/login` e `/api/auth/register` — antes não existia
      nenhum limite, permitia força bruta de senha. `app/Policies/`
      extraídas (`ProfilePolicy`, `MedicationPolicy`,
      `DoseSchedulePolicy`) — a autorização por dono do dado estava
      duplicada como método privado em 3 controllers, agora é uma fonte
      só via `Gate::authorize()`. Validado com 2 testes novos provando
      bloqueio na 6ª tentativa (429), + os 60 testes existentes
      continuam passando
- [x] **P1 — Infra & Deploy** (2026-08-08): deploy real em
      `api-remedios.narniano.com`, Postgres compartilhado do VPS
- [ ] **P2 — Saúde & Resiliência**: não auditado ainda. `/up` existe
      (health check padrão do Laravel), mas não confirmado se testa
      dependência real (banco) ou só "processo de pé". `SIGTERM`/cleanup
      de timers não verificado — categoria nova, nunca tinha sido
      perguntada antes desta fusão
- [x] **P3 — CI/CD** (2026-08-08): `.github/workflows/ci.yml` rodando
      `php artisan test` (62 testes, SQLite em memória) + `composer
      audit` a cada push/PR. Confirmado com run real no Actions (não só
      leitura de código), sucesso em 18s
- [x] **P4 — Testes** (2026-08-08): Jest + React Native Testing Library
      no `app/`, cobrindo login (sucesso, erro genérico, guarda contra
      campo vazio) e marcar dose como tomada na tela Hoje. 5 testes,
      confirmados com run real no Actions. `npm audit fix` também
      rodado: resolveu 4 de 21 vulnerabilidades de dev-deps sem quebrar
      nada; as 17 restantes têm raiz única (`xcode`→`uuid`, dependência
      de terceiro do `@expo/config-plugins`, sem fix upstream disponível
      nem no SDK 57 mais recente) — só rodam em build-time
      (`expo prebuild`), nunca no app publicado. Não é ignorado, é
      bloqueado por terceiro; reavaliar quando o `xcode` package atualizar
- [x] **P5 — Monitoramento & Logs** (2026-08-09): Sentry no backend
      (`sentry/sentry-laravel`) **e** no mobile (`@sentry/react-native`)
      — **DSN configurado e testado de verdade**: evento real enviado e
      confirmado tanto local quanto direto do container de produção
      (`sentry:test`, IDs `8d7c8f25...` e `c087dff4...`). Rotação de log
      (parte nova desta categoria, do SHIELD-I) ainda não auditada —
      Laravel usa `LOG_CHANNEL=stack` padrão, não confirmado se tem
      rotação configurada
- [ ] **P6 — Backups & Recuperação**: não tem backup próprio — depende
      100% do backup do Postgres compartilhado do VPS (`hetzner-infra/
      backup/`, testado ponta a ponta). Categoria nova; vale confirmar
      que o dump inclui o banco `meus_remedios_db` especificamente, não
      só assumir que "o backup geral cobre"
- [x] **P7 — UI/UX, acessibilidade e SEO**: app já tem tema claro/escuro
      e múltiplos perfis; falta auditoria de acessibilidade real (labels
      de `accessibilityLabel`, contraste, teste com TalkBack/VoiceOver —
      importa de verdade aqui, é app de saúde, usuário pode ter
      dificuldade visual). **SEO não se aplica** — app mobile privado
      atrás de login, sem conteúdo indexável
- [x] **P8 — Funcionalidades**: roadmap de produto próprio, ver seção
      "Roadmap" acima (Fases 1-4)
- [x] **P9 — Documentação** (2026-08-08): `knuckleswtf/scribe` instalado
      (`require-dev` — mesmo padrão do SIC: doc de API só existe em
      dev/homologação, nem instala no build de produção). Gera OpenAPI
      3.0 + Postman collection a partir das rotas reais + `$request->
      validate()` de cada controller. Ver "Documentação da API" abaixo
      pra gerar localmente

**Google OAuth ativado e testado em produção (2026-08-08)** — client_id
e redirect_uri confirmados na resposta real do Google, não é mais
pendência. Únicas duas categorias genuinamente novas (P2, P6) ainda sem
auditoria — não são regressão, são perguntas que a fusão com o SHIELD
trouxe e que nunca tinham sido feitas antes.

---

## Como rodar localmente

### Backend (Laravel Sail)

```bash
cd api
./vendor/bin/sail up -d
./vendor/bin/sail artisan migrate
# API disponível em http://192.168.18.4 (porta 80)
```

> Se mudar de rede, atualizar `api/.env` → `APP_URL` e `app/.env` → `EXPO_PUBLIC_API_URL` com o novo IP.

### Documentação da API (Scribe)

```bash
cd api
./vendor/bin/sail artisan vendor:publish --tag=scribe-config  # 1x, gera config/scribe.php local (gitignored)
./vendor/bin/sail artisan scribe:generate
# abrir http://192.168.18.4/docs
```

> `config/scribe.php` **nunca é commitado** — ele usa classes do próprio
> pacote (`Knuckles\Scribe\Config\*`) direto no arquivo, e como o Scribe
> é `require-dev`, isso quebra `composer install --no-dev` (aconteceu de
> verdade em produção, 2026-08-08 — corrigido tirando o arquivo do git).

> Só funciona em dev — `knuckleswtf/scribe` é `require-dev`, não é
> instalado no build de produção (mesma decisão do SIC: doc de API
> completa não fica exposta publicamente). Regenerar sempre que mudar
> uma rota ou uma regra de validação, o conteúdo é extraído do código
> real, não escrito à mão.

### App mobile

```bash
cd app
npx expo start --clear
# Abrir no dispositivo com o build de desenvolvimento instalado
```

> Para gerar novo build de desenvolvimento: `eas build --platform android --profile development`

### PHP/Composer (sem instalar localmente)

```bash
docker run --rm --user $(id -u):$(id -g) \
  -v "$(pwd)/api":/opt -w /opt \
  laravelsail/php84-composer:latest \
  <comando>
```

---

## Variáveis de ambiente

### `api/.env` (desenvolvimento)
```
APP_KEY=base64:...
DB_HOST=mysql
DB_DATABASE=laravel
DB_USERNAME=sail
DB_PASSWORD=password
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://192.168.18.4/api/auth/google/callback
```

### `app/.env`
```
EXPO_PUBLIC_API_URL=http://192.168.18.4/api
```
