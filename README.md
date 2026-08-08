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

- [ ] **Corrigir dose** — desmarcar um "Tomei" feito por engano (undo na tela Hoje)
- [ ] **Status automático "Perdido"** — doses que passaram do horário sem ação viram `missed` automaticamente (job no backend ou lógica no frontend ao abrir o app)
- [ ] **Onboarding guiado** — 3 telas exibidas apenas na primeira abertura: criar perfil → adicionar medicamento → ativar notificações
- [ ] **Haptic feedback** — vibração ao marcar "Tomei" (`expo-haptics`, uma linha de código)
- [ ] **Refill alert inteligente** — cálculo automático "seu estoque de X acaba em N dias" baseado em `current_quantity` ÷ doses por dia do schedule; alerta na tela Hoje e notificação
- [ ] **Exclusão de conta** — botão em Perfis que apaga todos os dados do usuário (obrigatório pela LGPD)
- [ ] **Política de privacidade** — link na tela de cadastro explicando que dados ficam na conta do usuário

### Fase 2 — Retenção e qualidade (v1.1, após primeiros usuários)

- [ ] **Gráfico de adesão** — barras semanais dos últimos 2 meses com % de doses tomadas; visível no Histórico
- [ ] **Pausar medicamento** — suspender temporariamente sem deletar (ex.: internação, viagem); reativar depois
- [ ] **Streak de adesão** — contador de dias consecutivos com 100% de doses; notificação de parabenização ao atingir 7, 30, 60 dias
- [ ] **Resumo semanal** — notificação local automática (ex.: domingo à noite) com % de adesão da semana
- [ ] **Skeleton loaders** — substituir `ActivityIndicator` por skeletons animados nas listas
- [ ] **Editar horário existente** — hoje só cria/deleta; falta poder alterar hora e dias de um schedule já criado
- [ ] **Filtro por medicamento no histórico** — dropdown/modal para filtrar por remédio específico

### Fase 3 — Infraestrutura (paralela às fases 1 e 2)

- [ ] **Google OAuth** — criar credenciais no Google Cloud Console, configurar URI de redirecionamento; frontend já implementado
- [ ] **Offline support** — salvar `dose_logs` localmente (expo-sqlite) quando sem internet, sincronizar ao reconectar
- [x] **Deploy do backend** (2026-08-08) — VPS Hetzner próprio, `api-remedios.narniano.com`, Postgres (não MySQL — ver `hetzner-infra/MIGRATION.md` Fase 4.2)

### Fase 4 — Monetização (pós-lançamento com usuários reais)

- [ ] **Limites do plano Free** — ex.: 1 perfil, 5 medicamentos, histórico de 30 dias (para motivar upgrade Pro)
- [ ] **Tier Pro** — perfis ilimitados, medicamentos ilimitados, histórico completo, sem anúncios; via RevenueCat
- [ ] **AdMob** — banners e/ou interstitials para usuários Free
- [ ] **Exportar histórico em PDF** — funcionalidade Pro: gerar relatório para levar ao médico
- [ ] **Publicar na Play Store e App Store**

---

## Roadmap de Engenharia (qualidade/produção)

Complementar ao roadmap de produto acima, não concorrente — essas fases
rodam em paralelo. Segue o padrão comum a todos os projetos pessoais,
documentado em `hetzner-infra/PADRAO-DE-ENGENHARIA.md` — aqui só o
estado real deste projeto em cada fase.

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
- [x] **P1 — Docker & VPS** (2026-08-08): deploy real em
      `api-remedios.narniano.com`, Postgres compartilhado do VPS
- [x] **P2 — CI/CD** (2026-08-08): `.github/workflows/ci.yml` rodando
      `php artisan test` (62 testes, SQLite em memória) + `composer
      audit` a cada push/PR. Confirmado com run real no Actions (não só
      leitura de código), sucesso em 18s
- [x] **P3 — Testes** (2026-08-08): Jest + React Native Testing Library
      no `app/`, cobrindo login (sucesso, erro genérico, guarda contra
      campo vazio) e marcar dose como tomada na tela Hoje. 5 testes,
      confirmados com run real no Actions. `npm audit fix` também
      rodado: resolveu 4 de 21 vulnerabilidades de dev-deps sem quebrar
      nada; as 17 restantes têm raiz única (`xcode`→`uuid`, dependência
      de terceiro do `@expo/config-plugins`, sem fix upstream disponível
      nem no SDK 57 mais recente) — só rodam em build-time
      (`expo prebuild`), nunca no app publicado. Não é ignorado, é
      bloqueado por terceiro; reavaliar quando o `xcode` package atualizar
- [x] **P4 — Monitoramento** (2026-08-08): Sentry no backend
      (`sentry/sentry-laravel`) **e** no mobile (`@sentry/react-native`)
      — código pronto nos dois, mas **DSN ainda não configurado**
      (conta é pessoal, só o Rilson cria em sentry.io). Mesmo padrão do
      Google OAuth: sem a chave, roda normal sem erro (no-op), só não
      manda telemetria ainda. Um projeto Sentry só cobre os dois (não
      precisa 1 conta por app, mesmo padrão do SIC)
- [ ] **P5 — UI/UX, acessibilidade e SEO**: app já tem tema claro/escuro
      e múltiplos perfis; falta auditoria de acessibilidade real (labels
      de `accessibilityLabel`, contraste, teste com TalkBack/VoiceOver —
      importa de verdade aqui, é app de saúde, usuário pode ter
      dificuldade visual). **SEO não se aplica** — app mobile privado
      atrás de login, sem conteúdo indexável
- [x] **P6 — Funcionalidades**: roadmap de produto próprio, ver seção
      "Roadmap" acima (Fases 1-4)

**Roadmap de engenharia completo (P0-P7), 2026-08-08.** Pendências reais
restantes: credencial do Google OAuth e DSN do Sentry — ambas dependem
de conta pessoal externa (Google Cloud Console, sentry.io), código já
pronto pras duas, só falta a chave.
- [x] **P7 — Documentação** (2026-08-08): `knuckleswtf/scribe` instalado
      (`require-dev` — mesmo padrão do SIC: doc de API só existe em
      dev/homologação, nem instala no build de produção). Gera OpenAPI
      3.0 + Postman collection a partir das rotas reais + `$request->
      validate()` de cada controller. Ver "Documentação da API" abaixo
      pra gerar localmente

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
