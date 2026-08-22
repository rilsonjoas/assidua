# Meus Remédios

Gestão de medicamentos para pacientes crônicos — controle de doses, alarmes, histórico de adesão e estoque. Produto de massa (freemium), com assinatura Pro via RevenueCat como prioridade de monetização (decisão 2026-08-21). AdMob fica adiado pra uma revisão futura, não descartado — mas nenhuma tela de dose/alarme recebe anúncio, decisão essa sim permanente.

---

## Por que isto existe

Metade da adesão medicamentosa no Brasil falha — gente esquece dose, perde controle de estoque, e quem mais sofre com isso raramente é só quem toma o remédio: é o filho que mora longe e liga toda hora perguntando "você tomou?", constrangendo os dois lados. Os apps grandes (Medisafe, MyTherapy) resolvem lembrete; poucos resolvem essa ponte entre paciente e cuidador de contas separadas, com push real.

Servir aos outros em nome de Cristo não é abstrato aqui — é o cuidador remoto sabendo, sem precisar ligar, que a mãe tomou o remédio. É o alarme certo, no fuso certo, porque errar isso quebra a confiança de quem depende do app pra cuidar de alguém que ama. Cuidar do corpo é mordomia; ajudar quem cuida de outro corpo é amor ao próximo em forma de engenharia.

Hoje: OAuth funcionando, fuso horário corrigido, LGPD com política real e revisada, cuidador remoto implementado — a base técnica que falta pra loja é conta e processo, não mais código. A visão de futuro não é competir em volume com os apps grandes — é ser a opção clara pra quem precisa da ponte cuidador-paciente que os outros não oferecem, mesmo que isso signifique milhares de duplas engajadas em vez de milhões de instalações soltas.

## Stack

| Camada | Tecnologia |
|---|---|
| App mobile | Expo SDK 56 (React Native) + TypeScript |
| Navegação | Expo Router (file-based) |
| Backend API | Laravel 13 (PHP 8.4) |
| Banco de dados | MySQL 8.4 via Sail (Dev) / PostgreSQL (Prod) |
| Autenticação | Sanctum (tokens) + Socialite (Google OAuth) |
| Notificações locais | expo-notifications |
| Estado global | Zustand |
| Cache / server state | TanStack React Query |
| HTTP | Axios + interceptor SecureStore |
| Ícones | @expo/vector-icons (MaterialCommunityIcons) |
| Tema | Hook `useTheme` + tokens light/dark, persistido em AsyncStorage |
| Build | EAS Build (cloud) |
| Anúncios | AdMob adiado pro futuro (2026-08-21) — RevenueCat é a prioridade agora |
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
- [x] Tela **Estoque** — edição inline de quantidade, alerta visual de estoque baixo; decremento automático a cada dose tomada
- [x] Tela **Perfis** — múltiplos perfis de paciente, ícone + cor customizáveis, seletor de tema (Sistema/Claro/Escuro)
- [x] Formulário de medicamento — múltiplos horários já no cadastro (atalhos 1x–4x/dia), presets de dias da semana e de intervalo (4/6/8/12/24h), duração do tratamento com data de fim calculada
- [x] **Cuidador remoto** — convite/resgate por código, conta separada do paciente; cuidador vê e age sobre doses/estoque (não gerencia cadastro), alerta se perder dose, push via servidor (funciona mesmo sem abrir o app)
- [x] Modo claro e escuro com detecção automática do sistema ou escolha manual
- [x] i18n pt/en/es
- [x] Marca no app (logo no header da Home, silhueta nos Perfis, rodapé de assinatura com versão)
- [x] Ícones em todo o app (MaterialCommunityIcons), sem emojis

### Backend
- [x] API REST completa com autenticação Sanctum
- [x] Endpoint `/today` calcula doses do dia dinamicamente via `dose_schedules` — não depende de logs pré-existentes
- [x] Filtros no histórico: `status`, `medication_id`, `date_from`, `date_to`
- [x] Colaboração cuidador↔paciente (convite, resgate, autorização por Policy)
- [x] Dockerfile + nginx + supervisord prontos para deploy em container
- [x] No ar em `api-remedios.narniano.com` (VPS Hetzner, Postgres compartilhado)

### Notificações
- [x] Locais: permissão solicitada no startup, agendada ao criar horário de dose, cancelada ao remover
- [x] Via servidor (cron no VPS) — dispara mesmo sem ninguém abrir o app; base do alerta do cuidador remoto

### Qualidade
- [x] Suíte de testes: 217 backend, 145 mobile
- [x] Sentry (backend + mobile), CI/CD com drift check

---

## Roadmap

Histórico completo de engenharia e produto (o que foi feito, achados
reais, decisões e o porquê) em [`ROADMAP.md`](ROADMAP.md) — inclui o
estado atual do projeto (pausado por decisão de marca, ver topo do
arquivo).

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
