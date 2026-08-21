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

### Fase 1.5 — Cuidador remoto (aposta de diferenciação, antes de L1)

> [!DONE] Completa em 2026-08-09
> As 5 etapas prontas, testadas e no ar (backend deployado, cron do
> scheduler rodando no VPS): modelo de dados, convite/resgate,
> autorização revisada, push via servidor, UI essencial no app. 117/117
> testes backend, 16/16 mobile. 2 achados reais em produção corrigidos
> no caminho (500 em rota não-autenticada sem `Accept: application/json`,
> Sentry poluído por `php artisan test` local).

> [!DECISION] Decidido em 2026-08-09
> Pergunta feita: o app tem potencial de crescer sozinho como está, ou
> precisa de algo a mais? Resposta honesta: essa categoria não tem
> dinâmica viral (ninguém compartilha app de lembrete de remédio como
> compartilha rede social), e hoje o app está em **paridade** de
> funcionalidade com Medisafe/MyTherapy, não à frente deles — replicar
> o que os grandes já fazem bem não é motivo de troca. Decisão: apostar
> na diferenciação real identificada em L3 (cuidador↔paciente) **antes**
> de L1 (monetização) — monetizar paridade de funcionalidade não resolve
> o problema de aquisição, só adiciona atrito antes de ter algo que
> realmente diferencia.

Hoje "perfis" é multi-paciente **dentro da mesma conta** (ex.: um pai
gerenciando o próprio filho no mesmo aparelho) — não existe o cenário
que é o gancho emocional real do nicho: uma filha em outra cidade
acompanhando remotamente se o pai idoso tomou o remédio, recebendo
alerta se ele esquecer. Isso exige conta **compartilhada entre usuários
diferentes**, não só multi-perfil numa conta só.

Construindo por etapas, cada uma testada e revisada antes da próxima:

- [x] **Etapa 1 — Modelo de dados de compartilhamento** (2026-08-09):
      tabela `profile_collaborators` (profile_id, invited_by_user_id,
      user_id nulo até aceitar, role, invite_code único, accepted_at) —
      dono continua sendo `profiles.user_id`. `User::sharedProfiles()`
      só retorna colaborações aceitas. Cascata testada nos dois
      sentidos: apagar perfil apaga colaborações; apagar conta do
      cuidador apaga só a colaboração, não o perfil (`ProfileCollaboratorModelTest.php`, 6/6)
- [x] **Etapa 2 — Fluxo de convite** (2026-08-09): `POST
      /profiles/{id}/collaborators` (só dono, `Gate::authorize('update')`
      reaproveitado da `ProfilePolicy`) gera código de 8 caracteres sem
      ambiguidade (sem 0/O/1/I/l — pensando em alguém digitando o
      código), expira em 7 dias. `POST /invites/{code}/accept` (rota
      solta, quem resgata não é dono) valida: código existe e não foi
      usado, não expirou, dono não resgata o próprio convite, sem
      duplicar colaboração. `GET`/`DELETE` de colaboradores pro dono
      gerenciar. `ProfileCollaboratorInviteTest.php`, 11/11
- [x] **Etapa 3 — Autorização revisada** (2026-08-09): decisão de
      escopo — cuidador pode **ver e agir sobre doses/estoque**
      (marcar tomada/pulada/desfazer, reabastecer), mas **não gerencia
      o cadastro** (editar/apagar remédio, criar/editar horário,
      renomear/apagar perfil, convidar outro cuidador — isso continua
      só do dono). `DoseLogPolicy::create/delete` e
      `MedicationPolicy::manageStock` abrem pro colaborador;
      `update`/`delete` das outras Policies continuam checando só dono.
      2 achados reais no caminho: `DoseScheduleController::store()` e
      `MedicationController::store()` usavam `Gate::authorize('view',
      ...)` em vez de `'update'` — inofensivo antes (view e update eram
      o mesmo critério), teria virado brecha real agora que view() abre
      pro colaborador. Corrigido. Matriz dono/colaborador/estranho
      testada em cada recurso tocado (`ProfileCollaboratorAuthorizationTest.php`,
      12/12). 105/105 no total, zero regressão
- [x] **Etapa 4 — Notificação push real (servidor)** (2026-08-09):
      `MarkDoseMissedAndNotifyCollaborators` centraliza "o que acontece
      quando uma dose vira perdida" — chamada tanto por `today()`
      (preguiçoso, só roda se alguém abrir o app) quanto pelo novo
      comando `doses:check-missed` (agendado a cada 15 min via
      `bootstrap/app.php`, é o que garante o aviso mesmo que o paciente
      nunca abra o app). `ExpoPushService` envia via Expo Push API (sem
      precisar de credencial própria pro MVP), falha de envio nunca
      derruba o fluxo que marcou a dose. App mobile registra o token
      (`registerPushToken()`) depois de conceder notificação no
      onboarding, e refresca a cada abertura pra quem já passou por ali
      (token muda entre instalações). **Pré-requisito de infra
      cumprido**: cron `schedule:run` não existia pra este projeto no
      VPS, adicionado junto (ver hetzner-infra). 116/116 backend, 13/13
      mobile
- [x] **Etapa 5 — UI do cuidador** (2026-08-09, escopo revisado): o
      essencial pra fechar o ciclo — sem isso, Etapas 1-4 ficavam
      inacessíveis pelo app. Tela Perfil (decisão confirmada: misturar,
      não aba separada) agora lista perfis próprios + compartilhados
      juntos, com etiqueta "Cuidando de" nos que não são seus
      (`ProfileController::index` retorna `is_owner` por perfil). Botão
      de convidar (só em perfil próprio) gera código e abre o Share
      nativo do celular; botão "Tenho um código" resgata. Testado
      (`__tests__/profile-collaborators.test.tsx`, `ProfileTest.php`).
      **Ficou de fora, considerar depois**: indicador visual de "perdeu
      dose hoje" por paciente na lista (a notificação push já cobre o
      alerta em tempo real, isto seria só reforço visual); esconder
      botões de "adicionar medicamento"/"criar horário" quando o perfil
      ativo é compartilhado (hoje dá 403 do backend corretamente, mas a
      UI não esconde o botão antes — funciona, só não é o mais elegante)

### Fase 2 — Retenção e qualidade (v1.1, após primeiros usuários)

- [x] **Gráfico de adesão** (2026-08-13) — barras semanais no Histórico,
      **sem biblioteca de gráfico nova**: pra ≤8 barras simples, `View`
      com altura proporcional à % já resolve (mesma linha de raciocínio
      do Skeleton com `Animated` puro — dependência só quando o problema
      pede). Backend reaproveita `CalculateWeeklyAdherence` (criada pro
      resumo semanal) uma vez por semana; endpoint novo
      `GET /profiles/{id}/weekly-adherence`. **Decisão de produto real**:
      aplica o mesmo paywall que já existia pro histórico (`history()`
      já limitava grátis a 30 dias, Pro a 3650) — grátis vê 4 semanas,
      Pro vê até 8 (2 meses, o que o roadmap original pedia). Não abriu
      uma segunda forma de ver mais do que o plano permite. Testado:
      `WeeklyAdherenceChartTest.php` (5/5 — cobre paywall grátis/Pro,
      ordem cronológica, percentual real, autorização), mobile (3 casos
      novos em `history.test.tsx`: barra por semana com % certo, semana
      sem dado mostra "—"/rótulo de a11y específico (não 0%, que seria
      enganoso), gráfico não aparece com endpoint vazio). Achado no
      caminho, não relacionado ao gráfico: `skeleton.test.tsx` (de uma
      sessão anterior) flakava só rodando a suíte inteira em paralelo —
      `waitFor` padrão (1s) apertado sob carga do sistema, não bug de
      lógica; corrigido com timeout maior nessa asserção específica,
      confirmado estável em 3 rodadas seguidas da suíte completa.
      160/160 backend, 43/43 mobile
- [x] **Pausar medicamento** (2026-08-12) — suspende temporariamente
      sem apagar horários/histórico (ex.: internação, viagem), reativa
      depois. Decisão de modelagem: campo novo `is_paused`, **não**
      reaproveita `is_active` — `is_active` já tinha semântica de
      "apagado/oculto" travada por teste (`index()` só lista ativos);
      reaproveitar faria o medicamento sumir da lista de Remédios sem
      jeito de reativar pela UI. `is_paused` continua visível na lista
      (com selo "Pausado", card com opacidade reduzida), só para de
      gerar dose/notificação/entrar no streak enquanto pausado — 4
      pontos do backend precisaram do filtro (`DoseLogController::today`,
      `completingTodayMilestone`, `CheckMissedDoses`,
      `CalculateAdherenceStreak`). Achado real no caminho: pausar no
      backend sozinho não bastava — a notificação local do celular é
      agendada de forma persistente (`expo-notifications` DAILY/WEEKLY),
      não recalculada a cada dia, então sem cancelar explicitamente ela
      continuaria tocando pra tomar um remédio que a pessoa pausou.
      Reativar reagenda a notificação de cada horário de volta. Testado:
      `MedicationPauseTest.php` (6/6, cobre toggle, visibilidade na
      lista, ausência na tela Hoje, não virar perdido, streak neutro em
      dia com medicamento pausado), mobile (3 casos novos em
      `medication-schedule-edit.test.tsx`: pausa cancela notificação,
      reativa reagenda, aviso visível quando pausado). 143/143 backend,
      33/33 mobile
- [x] **Streak de adesão** (2026-08-11) — contador de dias consecutivos
      com 100% de doses tomadas, badge 🔥 no cabeçalho da tela Hoje,
      celebração (`Alert` + haptic) ao bater 7/30/60 dias. Decisões de
      escopo documentadas em `CalculateAdherenceStreak` (novo Action):
      dia sem nenhum horário previsto naquele dia da semana é **neutro**
      (não quebra nem conta — sem isso, quem toma remédio só às
      segundas veria a sequência "quebrar" toda terça); "hoje" nunca
      quebra a sequência sozinho enquanto tiver dose pendente, só conta
      quando 100% completo. Endpoint novo `GET /profiles/{id}/streak`
      (`current_streak`+`best_streak`). O marco só é retornado por
      `POST /dose-logs` quando aquela ação específica foi o que fechou o
      dia — sem essa checagem, qualquer toque em "Tomei" recalcularia o
      streak e re-disparia a mesma celebração em todo toque, não só no
      que completa o dia. Testado: `AdherenceStreakTest.php` (10/10,
      cobre sequência simples, quebra, dia neutro, hoje pendente,
      best≠current após quebra, autorização, e os 3 cenários de
      marco), mobile (`home.test.tsx`, 4 casos novos). 137/137 backend,
      30/30 mobile
- [x] **Resumo semanal** (2026-08-13) — **decisão de arquitetura real,
      diferente do que o roadmap sugeria**: não é notificação *local*.
      Notificação local é agendada com conteúdo fixo no momento do
      agendamento — não dá pra calcular a % de adesão de verdade só na
      hora de disparar. Usa a infra de push via servidor que já existia
      (Fase 1.5, Etapa 4 — `ExpoPushService`), com dado calculado na hora
      do envio. `CalculateWeeklyAdherence` (Action isolada e testável)
      soma tomadas/previstas dos últimos 7 dias, mesma lógica de "dia
      devido" do streak (schedule ativo+não pausado, projetado por dia
      da semana). `SendWeeklyAdherenceSummary` manda só pro **dono** do
      perfil (não pros cuidadores — é resumo da própria semana, diferente
      do alerta de dose perdida que já ia pro cuidador). Comando novo
      `adherence:send-weekly-summary`, agendado de hora em hora,
      **decide por perfil** se é domingo às 20h **no fuso daquele
      perfil** — mesmo raciocínio do `CheckMissedDoses`, "agora" não
      pode ser calculado uma vez só pra todos. `last_weekly_summary_sent_at`
      evita duplicar envio dentro da janela de 1h. Não manda nada se não
      tinha dose prevista essa semana (resumo vazio é ruído, não ajuda).
      Testado: `CalculateWeeklyAdherenceTest.php` (4/4, cálculo isolado),
      `SendWeeklyAdherenceSummaryTest.php` (3/3, conteúdo do push),
      `SendWeeklyAdherenceSummariesCommandTest.php` (5/5, cobre janela de
      horário por fuso — inclusive dois perfis em fusos diferentes
      recebendo em momentos diferentes — e dedupe). Sem mudança mobile
      (reaproveita o mesmo mecanismo de push já existente). 155/155
      backend, 40/40 mobile (sem mudança)
- [x] **Skeleton loaders** (2026-08-12) — `components/Skeleton.tsx` novo
      (`Skeleton`, `SkeletonListItem`, `SkeletonList`), `Animated` puro
      do React Native (pulso de opacidade), sem biblioteca nova. Um
      componente genérico só (círculo + linhas de texto), não um por
      tela — as 4 telas de lista têm DNA visual parecido o bastante pra
      não justificar 4 componentes quase iguais. Substituído nas 4 telas
      (Hoje, Remédios, Histórico, Estoque); `medication/[id].tsx` (form
      de edição, não lista) ficou de fora de propósito, mantém
      `ActivityIndicator`. Marcado `accessibilityElementsHidden` — leitor
      de tela não precisa navegar por esqueleto, é transitório. Achado
      no caminho: `getByTestId` do RNTL v13 não encontra elemento
      marcado como oculto pra acessibilidade por padrão — precisa de
      `{ includeHiddenElements: true }` na query pra testar sem abrir
      mão do a11y correto. Testado (`skeleton.test.tsx`, novo, 3/3):
      componente isolado não quebra, `SkeletonList` renderiza, e teste
      de integração real (promise controlada manualmente) provando a
      troca skeleton→conteúdo. 143/143 backend (sem mudança), 40/40
      mobile
- [x] **Editar horário existente** (2026-08-10) — o backend (`PUT
      /schedules/{id}`) já existia e já era testado desde antes; faltava
      só a UI. Botão de editar (lápis) em cada horário na tela do
      medicamento reaproveita o mesmo formulário de criar (mesmo estado,
      diferenciado por `editingScheduleId`), chama `updateSchedule` em
      vez de `createSchedule`, e reagenda a notificação local no lugar
      da antiga (`scheduleScheduleNotifications` já cancela a anterior do
      mesmo `scheduleId` antes de recriar — não precisou de código novo
      pra isso). Testado (`__tests__/medication-schedule-edit.test.tsx`,
      3/3): abre pré-preenchido, salva chamando o endpoint certo (não o
      de criar), cancela sem side-effect. Suíte mobile completa: 19/19
- [x] **Filtro por medicamento no histórico** (2026-08-12) — o backend
      já suportava `medication_id` desde sempre (`DoseLogController::history()`,
      `HistoryFilters` no serviço mobile) — era 100% trabalho de UI.
      Linha de chips por medicamento (mesmo padrão visual do filtro de
      status já existente), com "Todos os remédios" resetando. Estado
      vazio já reutiliza a mesma mensagem de "filtrado" pra qualquer
      combinação de filtro de status + medicamento, não só status
      sozinho. Testado (`history.test.tsx`, novo, 4/4): chips aparecem
      um por medicamento, selecionar refaz a busca com `medication_id`
      certo, "Todos" reseta, linha de filtro não aparece pra perfil sem
      medicamento cadastrado. 143/143 backend (sem mudança), 37/37
      mobile
- [ ] **Acessibilidade de leitura** (registrado 2026-08-10, não
      implementado) — público do app puxa forte pra idoso/baixa visão
      (é sobre saúde), e muita gente nessa faixa não sabe achar a
      configuração de fonte grande do sistema operacional, mesmo o app
      já respeitando ela hoje (`allowFontScaling` nunca foi bloqueado,
      conferido na passada de a11y de 2026-08-09). Ideia: seletor de
      tamanho de fonte **dentro do app** (Perfil, mesmo padrão visual do
      seletor de tema/idioma), com opções tipo Pequeno/Médio/Grande, +
      um modo de alto contraste pra baixa visão. Escopo real do
      trabalho: diferente de cor (`colors.text`, já é variável em tudo)
      ou idioma (`t()`, já centralizado), `fontSize` hoje é número fixo
      espalhado nas 12 telas — precisa virar um sistema de escala tipo
      `constants/theme.ts`, referenciado em cada `StyleSheet.create`.
      Mesma ordem de esforço do que fuso/idioma acima, não é trivial.
      Também vale auditar tamanho mínimo de alvo de toque (44×44pt)
      enquanto mexe nisso.

### Achados reais de teste manual em dispositivo (2026-08-13)

Primeira sessão de teste manual de verdade num build EAS real (não
Expo Go/simulador) — achou 4 coisas que nenhum teste automatizado
pegaria, exatamente o tipo de coisa que só aparece usando o app de
verdade:

- [x] **Crash ao abrir Remédios**: `[expo-router]: You are passing an
      array of styles to a child of <Slot>`. Causa: `style={[styles.card,
      condição && styles.cardPaused]}` (array) direto no filho de
      `<Link asChild>` — o `<Slot>` do expo-router exige estilo achatado
      num objeto só nesse caso específico. Corrigido com
      `StyleSheet.flatten(...)`.
- [x] **Onboarding sem gesto de swipe**: só avançava pelo botão
      "Próximo", mesmo com os pontinhos sugerindo navegação por
      arrastar. Trocado por `ScrollView` com paginação nativa
      (`pagingEnabled`) — swipe nos dois sentidos de verdade agora, e os
      pontinhos viraram tocáveis (pulam direto pra etapa), com
      `accessibilityState={{selected}}` cada um.
- [x] **Seletor de idioma apertado**: 4 opções espremidas no layout
      `flex:1` pensado pras 3 do tema — ícone colado na borda, e em
      espanhol "Del dispositivo" quebrava em 2 linhas. Layout virou
      grade 2x2 (largura fixa em vez de flex:1), rótulo do "sistema"
      encurtado pra "Sistema"/"System" (mesmo padrão do seletor de
      tema).
- [x] **Perfil ativo "escurecia" no modo escuro**: o chip do perfil
      selecionado (tela Hoje) usava `c.surface` de fundo — claro no
      tema claro (destaca bem), mas **escuro** no tema escuro, virando
      o chip mais apagado da fileira em vez do mais destacado. Trocado
      pra `c.headerText` (claro nos dois temas, é a cor pensada pra ler
      sobre o header colorido) — o selecionado agora é sempre o mais
      claro/vistoso, não o mais escuro, em qualquer tema.
- [x] **Diálogos de confirmação nativos destoando do app**: "Sair da
      conta", "Excluir conta" e "Remover horário" usavam `Alert.alert`
      — sempre renderiza o diálogo *nativo* do sistema, sem noção do
      tema claro/escuro do app. Criado `components/ConfirmDialog.tsx`
      (modal temático reutilizável) e trocado nos 3 lugares. `Alert.alert`
      continua legítimo pra erro/aviso de tela única (mensagem + "OK",
      sem decisão real) — não foi tocado nesses casos.

Testado: 16 casos novos (7 em `profile-collaborators.test.tsx` —
sair/excluir com confirmação real; 3 em
`medication-schedule-edit.test.tsx` — remover horário; reescrito
`onboarding.test.tsx` porque a asserção antiga, baseada em `getByText`
do título, parou de provar avanço depois que os 3 passos passaram a
ficar todos montados ao mesmo tempo no `ScrollView` — passou a checar
o estado `selected` real do pontinho). 51/51 mobile, 160/160 backend
(sem mudança de backend nesta rodada).

**Pergunta que apareceu no caminho — resposta real, não suposição**:
o código de convite de cuidador (`ProfileCollaborator`) expira em 7
dias **só enquanto não resgatado**. No `accept()`
(`ProfileCollaboratorController.php`), o próprio `expires_at` é
zerado (`'expires_at' => null`) no momento em que o convite é aceito —
a colaboração em si não tem prazo depois disso, fica valendo até o
dono revogar manualmente (`DELETE /profiles/{id}/collaborators/{id}`).
Os 7 dias são só a janela pra alguém digitar o código, não um prazo da
parceria.

### Campos do medicamento — achado + feature nova (2026-08-13)

Perguntado o que mais faltava além de nome/dosagem/cor/instruções:

- [x] **Campo "Observações" (`notes`)** — achado real: já existia no
      banco e na validação do backend desde o começo, mas nunca tinha
      chegado no formulário mobile. Buraco desde o início, não
      regressão. Corrigido — carrega, edita e salva junto com o resto.
- [x] **Foto do medicamento** — pro público idoso/cuidador, reconhecer
      visualmente costuma valer mais que ler o nome. Coluna
      `photo_path` interna (nunca exposta — `$hidden` no model);
      accessor `photo_url` monta a URL pronta via `Storage::disk('public')`,
      mesmo padrão do accessor `days_remaining` já existente. Endpoints
      novos e separados do `update()` normal (`POST`/`DELETE
      /medications/{id}/photo`) — upload multipart e edição de campos
      de texto são responsabilidades diferentes, misturar só
      complicaria os dois lados. Enviar foto nova apaga a antiga do
      disco (não acumula lixo); apagar o medicamento também limpa o
      arquivo — sem isso ficaria órfão pra sempre. Mobile: círculo de
      foto no topo do formulário (só depois de criado — precisa de id
      pra anexar) e miniatura na lista de Remédios no lugar da bolinha
      colorida quando existe foto. Ação de escolher (câmera/galeria/
      remover) continua `Alert.alert` nativo de propósito — diferente
      das confirmações sim/não que viraram `ConfirmDialog` temático, um
      seletor de 3+ opções é o tipo de coisa que o próprio SO já resolve
      bem como action sheet.
      **Deploy em produção (2026-08-14)**: `php artisan storage:link`
      (cria o symlink `public/storage` → `storage/app/public`) agora roda
      automaticamente no `entrypoint.sh` a cada start do container —
      sem isso a URL da foto retorna 404 mesmo com o arquivo salvo
      corretamente. **Achado real durante o deploy**: como o Dockerfile
      faz `COPY . .` e builda a imagem do zero a cada deploy,
      `storage/app/public` não sobrevivia a um rebuild — qualquer foto
      enviada seria apagada no próximo deploy. Corrigido com um volume
      Docker nomeado (`remedios-storage`) montado só nesse diretório em
      `hetzner-infra/meus-remedios/docker-compose.yml`; o symlink em si
      continua sendo recriado a cada boot (não é volume, fica na imagem).
      Testado: `MedicationPhotoTest.php` (7/7 — upload, troca apaga a
      antiga, rejeita não-imagem, rejeita >5MB, remover, apagar
      medicamento limpa o arquivo, autorização), mobile (2 casos de
      observações + 6 de foto em `medication-schedule-edit.test.tsx`).
      167/167 backend, 59/59 mobile.

### Auditoria de responsividade (2026-08-13, prep pra Acessibilidade de leitura)

Feita **antes** de construir o seletor de tamanho de fonte (Fase 2,
ainda não implementado) — checar responsividade só depois de já ter
construído a feature seria tarde demais pra corrigir barato. Achados
reais, por `grep` em toda a base (`numberOfLines`, `width`/`height`
fixos combinados com texto), não achismo:

- [x] **Corrigido**: botões de dia da semana
      (`medication/[id].tsx`, `dayBtn`) eram um círculo de
      `width`/`height` **fixos** (36×36) guardando uma letra só. Com
      fonte do sistema maior, a letra cortaria em vez do botão crescer.
      Trocado pra `minWidth`/`minHeight` — mesmo tamanho visual hoje,
      mas cresce em vez de cortar quando a fonte aumenta. Sem
      contraindicação, não dependia de nenhuma feature nova pra ser
      uma melhoria real.
- [ ] **Risco médio, não corrigido ainda** (mais sentido de corrigir
      junto da própria feature de fonte, quando der pra testar de
      verdade com escala aumentada):
      - `photoCircle` (`medication/[id].tsx`) — círculo fixo de 96×96;
        o texto do placeholder ("Adicionar foto", `fontSize: 10`) pode
        apertar demais em fonte grande. Com foto de verdade não tem
        problema (é `Image`, não texto).
      - `themeBtn`/`languageBtn` (`profile.tsx`) — linha de 3-4 botões
        em `flex:1`/`width:'48%'` com texto curto. Não quebra (RN cresce
        a altura sozinho quando o texto quebra linha), mas fica
        visualmente apertado. `languageBtn` já tem `numberOfLines={1}`
        (corta com reticências em vez de quebrar layout) — degrada bem,
        não corrige de verdade.
      - **Barra de abas (rodapé)** — 5 abas dividindo a largura da tela,
        rótulo mais longo é "Histórico". É o componente de tab padrão do
        `expo-router`/React Navigation, fora do controle direto do
        código do app — precisa testar com fonte grande de verdade num
        aparelho antes de saber se corta/quebra, não dá pra afirmar só
        lendo código.
- [x] **Conferido e já é seguro, sem mudança necessária**: ícones
      (`MaterialCommunityIcons`) não escalam com fonte do sistema — usam
      `size` numérico próprio, não `fontSize`. Todo círculo/caixa fixa
      que guarda só ícone (perfil, tema, onboarding, cor) está seguro
      por natureza, não precisa de `minWidth`. Textareas de instruções/
      observações usam `numberOfLines` só como dica de altura inicial
      (comportamento padrão de multiline), não corta conteúdo.

Conclusão prática: a base está em condição razoável pra receber a
feature de fonte grande — achou 1 risco real (corrigido) e 2-3 pontos
de atenção (não bloqueantes, degradam sem quebrar), não uma pilha de
problema. Nenhum teste automatizado novo aqui — responsividade em
escala de fonte real só se prova testando no aparelho de verdade com a
fonte do sistema aumentada, não é algo que `jest`/RNTL simulam.

### Plano Pro — tela de benefícios, sem pagamento real (2026-08-13)

Achado real de UX: mostrar "Plano Gratuito" sem contexto nenhum (sem
botão, sem explicar o que muda) parecia feature quebrada, não "ainda
não lançamos". L1 (cobrança de verdade) continua **deliberadamente**
não implementado — decisão de 2026-08-09 de apostar na diferenciação
antes de monetizar, não mudou. Esta tela só explica, não processa
pagamento nenhum.

- [x] Etiqueta de plano (tela Perfil) virou link tocável pra `/pro`
      (rota nova, modal, mesmo padrão do `medication/[id]`)
- [x] Tabela comparando grátis × Pro com **números reais**, não
      inventados — batem exatamente com o que o backend já aplica:
      perfis (4 → ilimitado), medicamentos por perfil (15 → ilimitado),
      histórico (30 dias → 10 anos), gráfico de adesão (4 → 8 semanas)
- [x] Sem botão de comprar funcional — aviso explícito "assinatura em
      breve", pra não fingir uma opção que não existe
- [x] Quem já é Pro vê agradecimento em vez do aviso de "em breve"

Testado: `pro.test.tsx` (2/2 — números certos pro usuário grátis,
estado correto pro usuário Pro), mais 1 caso em
`profile-collaborators.test.tsx` (toque na etiqueta navega pra `/pro`).
167/167 backend (sem mudança), 62/62 mobile.

- [ ] **Widget de tela inicial Android (registrado 2026-08-21, não
      começado)** — "próxima dose" (horário, remédio, ação de
      confirmar direto do widget) sem precisar abrir o app. Reforça
      exatamente o que já é a proposta de valor do produto (o alarme
      certo, na hora certa, sem fricção) e é retenção pura — não tem
      relação com monetização (RevenueCat é a prioridade ali, AdMob
      adiado — ver decisão em Fase 4). `expo-android-widgets` (ou módulo nativo
      equivalente) é o caminho técnico mais direto no stack atual
      (Expo). Escopo pra decidir quando começar: widget read-only
      (mostra a próxima dose) vs. com ação (confirmar do próprio
      widget, exige write de volta pro app/API).

### Fase 3 — Infraestrutura (paralela às fases 1 e 2)

- [x] **Google OAuth** (2026-08-08) — credenciais criadas, testado com redirect real em produção
- [~] **Offline support — implementado, ainda não testado em dispositivo
      real nem publicado (2026-08-17)**: prioridade 2 pedida pelo
      Rilson explicitamente ("os usuários são idosos, não sabem o que é
      sincronizar — tudo tem que acontecer em segundo plano"), depois
      de resolver o login quebrado (prioridade 1, ver "Esqueci a
      senha" acima).

      **Achado que simplificou tudo**: o backend já faz
      `updateOrCreate` pela chave (dose_schedule_id + scheduled_at),
      não pelo id do log — reenviar a mesma ação 2x nunca duplica, só
      sobrescreve. Não precisou de nenhuma mudança no backend nem
      chave de idempotência nova.

      O que foi feito:
      - `services/offlineQueue.ts` — fila local em `expo-sqlite`
        (dependência já existia, nunca tinha sido usada). Enfileira
        ações de marcar dose; um "desfazer" numa dose que ainda nem
        sincronizou cancela a ação enfileirada direto, sem nunca
        contatar o servidor (evita ensinar o servidor sobre uma dose
        que, pro usuário, nunca existiu de verdade)
      - `services/sync.ts` — drena a fila quando a conexão volta
        (`@react-native-community/netinfo`, dependência nova). Erro de
        rede no meio do drain para e preserva o resto pra próxima
        tentativa; erro real do servidor descarta só aquela ação
      - `app/_layout.tsx` — dispara a sincronização automática no boot
        do app, sem nenhum botão ou tela de "sincronizar" — 100% em
        segundo plano, como pedido
      - `app/(tabs)/index.tsx` — as 3 mutações (marcar, pular,
        desfazer) tentam a API real primeiro; se falhar por rede (não
        por erro de validação/servidor), enfileira e atualiza a UI
        otimisticamente do mesmo jeito que já fazia online. Ícone
        discreto "Aguardando conexão" no item, não é acionável
      - Doses já marcadas offline continuam aparecendo marcadas se o
        app fechar e reabrir ainda offline (`applyPendingOverlay`) —
        sem isso, reabrir o app faria a dose "voltar" a aparecer
        pendente até a fila drenar
      - 17 testes novos (`offlineQueue.test.ts`, `sync.test.ts`),
        cobrindo especificamente o cenário de retry sem duplicar, erro
        de rede vs. erro real do servidor, e 404 em undo tratado como
        já resolvido. 129/129 testes passando no total, typecheck
        limpo

      **Publicado via `eas update` (canal `preview`) em 2026-08-17**,
      decisão consciente do Rilson depois de eu recomendar esperar um
      teste manual em dispositivo real primeiro (nunca tinha sido
      testado fora de simulador/lógica unitária) — ele preferiu seguir
      mesmo assim. Update group `189c7ba5-d59d-4aba-903a-b03d48303b78`.
      **Ainda pendente**: o teste manual real em dispositivo com modo
      avião continua não feito — vale rodar quando der, mesmo já
      publicado, pra confirmar que o comportamento bate com o esperado
      na prática, não só nos testes automatizados.
- [x] **Deploy do backend** (2026-08-08) — VPS Hetzner próprio, `api-remedios.narniano.com`, Postgres (não MySQL — ver `hetzner-infra/MIGRATION.md` Fase 4.2)
- [x] **Redeploy da Fase 2 completa + APK standalone pro teste manual** (2026-08-14) —
      motivação: teste manual de 2 semanas não devia depender de
      Tailscale + rede local. `rsync` do `api/` pro VPS (sem `.git`
      lá — não dá pra usar `git pull`), rebuild via `make deploy`
      (`hetzner-infra`); `entrypoint.sh` já roda `migrate --force` a
      cada start, então as 4 migrations da Fase 2 (timezone, pausa,
      resumo semanal, foto) subiram automático. **Achado real**: volume
      persistente pra `storage/app/public` (ver entrada de Foto do
      medicamento acima) — sem isso qualquer foto enviada some no
      próximo deploy. Endpoints novos confirmados no ar via
      `route:list` direto no container de produção. Mobile: perfil
      `preview` novo no `eas.json` com `EXPO_PUBLIC_API_URL` apontando
      pra produção (não mais IP do Tailscale) e `buildType: apk`
      (internal distribution gera `.aab` por padrão, que não instala
      direto no aparelho). **Achado real durante o build**: EAS
      empacota o repositório git inteiro, não só `app/` — como é
      monorepo com `api/` no mesmo repo, e `api/storage/framework/
      testing/disks` fica com dono `root` (artefato do PHPUnit rodando
      dentro do container Sail), o scan do EAS quebrava com `EACCES`.
      Corrigido com `.easignore` na raiz excluindo `api/` inteiro do
      tarball — nunca devia ir junto mesmo. **Segundo achado real, já no
      Gradle**: build de release aciona a task do plugin do Sentry que
      sobe sourcemap pro Sentry.io, e essa task exige uma organização
      configurada (`--org`) que nunca existiu — só o DSN de crash
      reporting em runtime estava configurado, upload de sourcemap no
      build nunca tinha sido testado porque só existiam builds
      `development` (dev client, que pula essa task). Corrigido
      desabilitando só o upload (`SENTRY_DISABLE_AUTO_UPLOAD=true` no
      `env` do perfil `preview`) — crash reporting em si não é afetado,
      só o build para de tentar publicar sourcemap sem credencial.
      Build final: sucesso, com o `expo-image-picker` compilado de
      verdade (resolve a degradação graciosa aplicada antes — ver
      achado do crash de foto), instalável direto por link/QR sem
      precisar de Metro nem rede local.
      **Achado real no teste em aparelho físico (2026-08-14, pendente
      de novo build)**: login com Google mostrou "Unmatched Route" com
      o token inteiro na URL, em vez de logar direto. Causa: o fluxo
      depende de `WebBrowser.openAuthSessionAsync` (em `services/
      auth.ts`) interceptar o redirect antes dele virar um deep link de
      verdade — mas nesse aparelho (Custom Tabs do Samsung) o Android
      tratou `meusremedios://auth-callback?...` como abertura normal do
      app, e não existia nenhuma rota registrada pra esse caminho.
      O login funcionou de qualquer jeito (a Promise deve ter resolvido
      em paralelo — confirmado reabrindo o app depois, autenticado com
      nome/email certos), mas não dava pra depender de sorte. Criada
      `app/auth-callback.tsx` como rede de segurança: lê a query string
      sozinha (token, id, nome, email, tier), salva no `SecureStore` e
      chama `setUser` — o `AuthGuard` já existente em `_layout.tsx`
      cuida de navegar pro lugar certo (onboarding ou tabs) sozinho a
      partir da mudança de `user`, sem duplicar lógica de roteamento
      aqui. Typecheck limpo. **Fica para a próxima leva de build** (não
      é urgente — o login atual já funciona, isso é sobre tornar
      confiável em vez de depender de timing).
      **Achado real de ambiente, mesma sessão**: depois de logar de
      verdade no build de produção, perfis e medicamentos apareceram
      vazios — **não é bug**. Todo o teste manual da Fase 2 rodou
      contra o banco local do Sail (MySQL, via Tailscale), enquanto o
      APK novo aponta pra produção (Postgres, VPS), um banco
      completamente separado que nunca viu esses dados. Nada foi
      perdido — os dados de teste locais continuam intactos no Sail —
      só não migram sozinhos entre motores de banco diferentes, e não
      valeria o esforço pra dado de teste mesmo. Decisão: começar o
      teste manual de 2 semanas com banco de produção limpo, recriando
      1-2 perfis/medicamentos reais em vez de herdar dado de teste.

### Achados reais do primeiro dia de teste em produção (2026-08-14)

- [x] **Login com Google mostrava "Unmatched Route"** — ver seção do
      build/APK acima; fix (`app/auth-callback.tsx`) pronto, aguardando
      próximo build.
- [x] **`auth-callback.tsx` não é a única lição** — ao investigar esse
      bug, ficou claro que "só usar OAuth, nunca conta local" (pergunta
      direta do Rilson) é o design errado pro público deste app
      especificamente. Ver "Decisão: OAuth + conta local" abaixo.
- [x] **Conta nova não vinha com perfil nenhum** — toda conta criada
      (registro por e-mail/senha ou primeiro login por Google cria
      usuário novo — checado via `wasRecentlyCreated` do Eloquent pra
      não recriar perfil em logins seguintes) caía direto na tela
      "Nenhum perfil criado", mesmo sendo o caso mais comum (a pessoa
      cuidando do próprio tratamento). `AuthController::createDefaultProfile()`
      agora cria um perfil com o nome da própria conta automaticamente.
      Testado: `test_registro_cria_perfil_padrao_automaticamente`,
      `test_login_google_de_usuario_novo_cria_perfil_padrao`,
      `test_login_google_de_usuario_existente_nao_duplica_perfil`.
- [x] **Bug real, achado pelo Rilson testando**: criar perfil com
      qualquer ícone além do primeiro dava `422` — "O campo avatar
      emoji não deve conter mais de 10 caracteres". Causa: o campo
      `avatar_emoji` nunca guardou emoji de verdade, guarda o nome do
      ícone do MaterialCommunityIcons (`baby-face-outline` = 17
      caracteres) — o limite de 10 é herdado de uma época anterior à
      decisão de usar ícones, nunca revisado. **7 dos 12 ícones da
      própria lista de seleção quebravam** — maioria, não caso raro.
      Migration `widen_avatar_emoji_on_profiles_table` (coluna →
      `varchar(40)`), validação do controller ajustada nos dois
      lugares (`store`/`update`). Testado:
      `test_cria_perfil_com_nome_de_icone_longo`. Deployado em produção
      no mesmo lote.
- [x] **Modal de erro nativo, de novo** — mesma reclamação de antes
      (Sair/Excluir), agora pra avisos de uma mensagem só (erro ao
      criar perfil, resgatar convite, etc.). A distinção que a gente
      tinha feito ("confirmação vira `ConfirmDialog`, aviso de uma tela
      só pode continuar `Alert.alert` nativo") não se sustentou no uso
      real. Criado `components/AlertDialog.tsx` (irmão de um botão só
      do `ConfirmDialog`), aplicado aos 6 avisos de `profile.tsx` com
      um único estado genérico (`alertInfo`) em vez de 6 booleans.
      **Ainda ficam ~22 outros usos de `Alert.alert` no app** (login,
      registro, estoque, remédio) — não convertidos agora de propósito,
      pra não mexer em tela nenhuma sem testar durante o período de
      teste manual. Fica pra próxima leva, como sweep dedicado.
- [x] **Cuidado compartilhado sem explicação nenhuma na tela** — o
      Rilson perguntou "pra que serve mesmo" ao usar o próprio app.
      Não tinha nenhum texto explicando o conceito — só um botão "Tenho
      um código" sem contexto, e um ícone de convidar sem rótulo
      visível (só `accessibilityLabel`, invisível pra quem enxerga).
      Adicionado `profile.patientProfilesHint`, uma frase curta acima
      da lista de perfis explicando o que é um perfil e pra que serve o
      ícone de convite.

### Feedback de uso real, anotado no Obsidian (2026-08-14)

Rilson usando o app no dia a dia, sem o código aberto — anotou no vault
(`Meus remédios.md`) em vez de perder o achado, sincronizado depois via
`git pull`. 12 itens, triados por porte antes de mexer em código —
"quero que vc adicione tudo ao roadmap... passo a passo, com segurança,
cuidado com ui/ux e tudo, e testes, pra a gente passar via eas update".

**Fixes diretos (JS puro no mobile + 1 toque no backend) — feitos (2026-08-14):**

- [x] **Dosagem obrigatória → opcional** — migration
      `make_dosage_nullable_on_medications_table` (coluna era `NOT
      NULL`), validação `nullable` nos dois lados do `MedicationController`.
      Auditado todo lugar que *exibe* dosagem (não só o formulário) —
      histórico, lista de remédios, Home, notificação local — todos
      concatenavam `dosage unit` direto; sem tratar `null`, viraria
      "null mg" na notificação (template literal stringifica `null`)
      ou espaço em branco solto no resto. Criado `formatDosageUnit()`
      único, usado em todo lugar. i18n: `{{dosage}} {{unit}}` virou
      `{{dosageUnit}}` num placeholder só, nos 3 idiomas.
      Testado: `test_cria_medicamento_sem_dosagem`,
      `test_limpa_dosagem_de_medicamento_existente` (backend);
      describe novo em `medication-schedule-edit.test.tsx` (mobile).
      173/173 backend, 86/86 mobile.
- [x] **Teclado cobre os campos** — `KeyboardAvoidingView` adicionado
      (mesmo padrão de login/registro, que já tratavam isso;
      formulário de medicamento nunca teve).
- [x] **"Criar medicamento" → "Cadastrar medicamento"** — copy nos 3
      idiomas (`Add medicine`/`Agregar medicamento` no EN/ES,
      equivalente ao mesmo ajuste de tom, não só PT).
- [x] **Ordem do formulário** — Horários subiu pra logo depois dos
      dados do remédio; Salvar virou a última ação do formulário, no
      fim de tudo. Reorganização de posição só — nenhuma lógica mudou,
      confirmado pelos 22 testes de `medication-schedule-edit.test.tsx`
      continuando verdes.
- [x] **Estoque não aparece no cadastro** — campo opcional "Estoque
      inicial", só ao criar (editar continua sendo função da aba
      Estoque). Reaproveita `updateStock()` — um segundo request
      depois de criar o medicamento, sem rota nova nem mudança de
      schema. Sem preencher, fica no default (0) de sempre.
      Testado: 3 casos novos (preenche → chama `updateStock`; não
      preenche → não chama; editar não mostra o campo).
- [x] **Botão "Adicionar" da Home** — linkava pra aba Remédios
      (`/(tabs)/medications`), agora abre direto `/medication/new`
      (mesma rota que o "+" da própria aba já usa). Não existia teste
      nenhum cobrindo esse botão antes — criado.
- [x] **Gráfico de adesão "só esqueleto" quando vazio** — não era bug
      de loading: quando nenhuma dose foi registrada ainda, todo ponto
      tem `percentage: null`, e o gráfico desenhava uma fileira de
      barrinhas cinzas com "—" sem nenhuma explicação — perecia
      quebrado, não "ainda sem dado". Estado vazio de verdade
      (`AdherenceChart`) quando **nenhuma** semana tem dado; quando é
      só *algumas* semanas sem dado (misturado com semana real), o
      rótulo "Sem dados nessa semana" por barra continua — esse ainda
      é o caso certo de usar. **Não existia teste nenhum pro
      `AdherenceChart`** — criado do zero (`adherence-chart.test.tsx`,
      3 casos). Um teste existente em `history.test.tsx` cobria
      justamente o cenário que virou o achado (1 semana só, `null`) —
      atualizado pra refletir o comportamento novo e correto, mais um
      teste dedicado ao caso misto pra não perder a cobertura original.

### Achados reais pós-`eas update` (2026-08-14)

- [x] **Onboarding aparecia em toda abertura do app, não só na
      primeira** — achado real de uso ("isso irrita"). `setCompleted()`
      já era chamado certinho no fim do onboarding; o bug era o
      `AuthGuard` (`_layout.tsx`) ler `hasCompletedOnboarding` *antes*
      do zustand-persist terminar de reidratar do AsyncStorage
      (operação assíncrona, corrida com o boot do app) — decisão de
      navegar acontecia com dado desatualizado (`false` default).
      Corrigido com um flag `hasHydrated` no `onboardingStore`,
      setado via `onRehydrateStorage`; `AuthGuard` espera esse flag
      antes de decidir. Adicionada também uma rede de segurança: se
      por algum outro caminho a pessoa cair no onboarding já tendo
      completado antes, volta sozinho pras tabs em vez de prender ali.
      **Não existia teste nenhum cobrindo essa lógica de navegação** —
      criado `auth-guard.test.tsx` (5 casos), exportando `AuthGuard`
      só pra ser testável em isolamento sem montar o `<Stack>` inteiro.
- [x] **CRÍTICO — login com Google quebrado depois do primeiro `eas
      update`**: "não foi possível conectar", tentando `localhost`.
      Causa: `EXPO_PUBLIC_API_URL` é embutida no bundle em tempo de
      build/export, não lida em runtime — `eas build` usa o `env` do
      perfil no `eas.json`, mas **`eas update` usa um mecanismo
      diferente** (EAS Environment Variables, servidor), nunca
      configurado. Sem isso, o export caiu no fallback de emergência
      `?? 'http://localhost/api'` do próprio código. Confirmado
      baixando o bundle publicado (`dist/`) e conferindo a string
      embutida antes de tirar conclusão. Corrigido configurando
      `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_SENTRY_DSN` de verdade no
      ambiente `preview` do EAS (`eas env:create`) — não é mais um
      passo manual fácil de esquecer num próximo `eas update`.
      Republicado e reconfirmado no bundle novo antes de avisar.
- [x] **"(opcional)" no rótulo de estoque inicial era redundante** —
      achado do próprio Rilson: convenção do formulário já é "campo
      com `*` é obrigatório, sem `*` é opcional" (`Nome *` vs
      `Dosagem`); escrever "(opcional)" por extenso quebra esse
      padrão. Removido.
- [x] **"mg" pré-preenchido no campo de unidade não fazia sentido** —
      mesma pergunta direta do Rilson: dosagem virou opcional, então
      por que a unidade já vinha com "mg"? Campo começa vazio agora;
      sem preencher, `unit` fica de fora do payload (`undefined`,
      omitido no JSON) e o backend aplica o próprio default sensato
      (`mg` na coluna do medicamento, `comprimidos` no estoque) — em
      vez de sugerir visualmente um valor que ninguém escolheu.
      Testado: caso novo em `medication-schedule-edit.test.tsx`.
      173/173 backend (sem mudança), 92/92 mobile.

**Recursos maiores — decisões confirmadas com o Rilson (2026-08-14):**

- [x] **Frequência de horário** ("a cada X horas") — **feito**. Decisão:
      vale o esforço de um modelo de intervalo de verdade em vez de só
      sugerir cadastrar N horários fixos manualmente pra simular "de 8
      em 8 horas". **Achado real no início**: `interval_hours` já
      existia na coluna, na validação do `DoseScheduleController` e até
      no tipo TypeScript do mobile — alguém tinha começado essa feature
      antes e nunca ligou em nenhum lugar que gera dose de verdade.
      Criada `App\Actions\GenerateScheduleOccurrences`, único lugar que
      decide quantas doses um `DoseSchedule` gera num dia e a que horas
      — intervalo ignora `days_of_week` de propósito (remédio de
      intervalo é tipicamente de curso contínuo, não "só terças"), e
      não deixa ocorrência vazar pro dia seguinte (10 em 10h a partir
      das 20h gera só 1 ocorrência nesse dia, não 2). Usada nos 5
      lugares que antes assumiam "1 dose por horário por dia":
      `DoseLogController::today()`, `CheckMissedDoses`,
      `completingTodayMilestone` (gatilho de marco de streak),
      `CalculateAdherenceStreak`, `CalculateWeeklyAdherence` — todos
      ajustados pra contar *ocorrências*, não *schedules*. **Achado no
      caminho**: id de dose pendente (`pending_<scheduleId>`) colidiria
      entre ocorrências do mesmo horário no mesmo dia — virou
      `pending_<scheduleId>_<HHmm>`.
      Mobile: toggle "Horário fixo" / "A cada X horas" no formulário de
      horário (criar remédio novo e editar horário existente,
      compartilhando a mesma função de UI pras duas telas); lista de
      horários mostra "A cada N horas" em vez dos dias quando aplicável.
      **Decisão de escopo revista no mesmo dia**: a notificação local
      chegou a ficar agendada só pelo horário-âncora, 1x/dia, mesmo
      pra schedule de intervalo — ver "Continuação" mais abaixo pra
      correção (fechado ainda em 2026-08-14, não ficou pendente).
      Testado: `GenerateScheduleOccurrencesTest` (6 casos, unitário,
      cobre inclusive o não-vazamento pro dia seguinte), mais casos
      novos de intervalo em `DoseLogTodayTest`,
      `CheckMissedDosesCommandTest`, `AdherenceStreakTest`,
      `CalculateWeeklyAdherenceTest`, `DoseScheduleTest` — e no mobile,
      describe novo em `medication-schedule-edit.test.tsx` (6 casos).
      188/188 backend, 98/98 mobile.
- [x] **Duração do tratamento (dias)** — **feito**. Decisão confirmada:
      quando os dias acabarem, só avisar (notificação tipo "tratamento
      com X terminou hoje"), sem pausar automático — o remédio continua
      ativo/gerando dose até alguém decidir pausar ou apagar.
      Reversível, sem surpresa pro usuário. Migration adiciona
      `treatment_duration_days` (opcional) e `treatment_end_notified_at`
      (dedupe de aviso) em `medications`; accessor `treatment_ends_at`
      calcula a data a partir de `created_at + duração`, exposto no
      JSON. Novo `App\Actions\NotifyTreatmentEnding` + command
      `medications:notify-treatment-ending` (agendado de hora em hora),
      mesmo padrão de `SendWeeklyAdherenceSummary` — notifica só o dono
      do perfil, uma vez, respeitando o timezone de cada perfil pra
      decidir "hoje". **Achado real ao testar**: `treatment_end_notified_at`
      tinha sido posto em `$hidden` (correto — não deveria aparecer no
      JSON) mas esquecido em `$fillable` (errado — sem isso o
      `update()` do command nunca persistia o flag de dedupe, e o
      comando notificaria de novo a cada execução horária). Achado só
      porque o teste reescrito exercia duas rodadas do command de
      verdade, não só uma. Mobile: campo "Duração do tratamento (dias)"
      no formulário (criar e editar), validado (`min:1`), enviado junto
      do resto do payload.
      Testado: `NotifyTreatmentEndingTest` (2), `NotifyTreatmentEndingCommandTest`
      (5, reescrito depois do achado do `$fillable`), mais casos em
      `MedicationTest`. Mobile: describe novo em
      `medication-schedule-edit.test.tsx` (5 casos). 198/198 backend,
      103/103 mobile.
- [x] **"Esqueci a senha" — resolvido por arquitetura, não por feature
      nova (2026-08-16)**: achado ao investigar este item — o backend
      já tinha migrado pra **login sem senha (magic link)** em
      2026-08-14 (`AuthController::requestMagicLink`, ver "Login sem
      senha" acima), mas o app mobile nunca foi atualizado — `login.tsx`
      e `register.tsx` ainda chamavam `/auth/login` e `/auth/register`,
      rotas que **não existem mais**. Login e cadastro local estavam
      quebrados de verdade, no meio do teste fechado de 2-3 semanas.
      Corrigido: as duas telas viram email-only (register pede nome
      também), chamam `requestMagicLink()`, mostram tela de "link
      enviado". Sem senha, não tem o que recuperar — o item original
      deixa de fazer sentido.
      **E-mail de verdade configurado no mesmo dia**: Resend (SMTP
      relay), domínio `narniano.com` verificado, `meusremedios@
      narniano.com` como remetente. Testado ponta a ponta — chamada
      real à API de produção, e-mail chegou de fato na caixa de entrada
      (não só "sem erro no log"). `MAIL_MAILER` deixou de ser `log`.

**Fora do código:**

- [x] ~~Logomarca~~ — **feita (2026-08-14)**. Confirmado que o app
      nunca teve ícone de verdade: `icon.png`, `android-icon-*.png`
      eram literalmente os placeholders padrão do Expo (seta azul +
      linhas-guia de zona segura), nunca substituídos. Gerado brief +
      prompt pra IA de imagem (paleta real do app, não inventada —
      índigo `#4f46e5`, tom que carrega a identidade nos dois temas);
      Rilson gerou a arte (coração + relógio, indígo sobre
      transparente) e depois uma versão em resolução maior (684×684)
      quando a primeira (171×171) saiu pequena demais pros 1024×1024
      que ícone de app/loja exige.
      **Achado real no processo**: o primeiro-plano do ícone adaptativo
      Android saiu na mesma cor índigo do fundo (também índigo) —
      quase invisível no launcher. Corrigido usando a silhueta *branca*
      da logo como primeiro-plano sobre o fundo índigo sólido (padrão
      comum de ícone: cor sólida + símbolo de 1 cor, tipo WhatsApp/
      Spotify), conferido via composição manual + máscara circular
      antes de aceitar como pronto — não só "gerei e assumi que tá bom".
      Gerados os 6 arquivos que o `app.json` já esperava
      (`icon.png`, `android-icon-{foreground,background,monochrome}.png`,
      `favicon.png`, `splash-icon.png`) mais uma variação branca solta
      (`meus-remedios-logo-branca.png`, na raiz do repo) pra uso fora
      do app (material promocional, fundo escuro).
      **Achados extras no `app.json`, mesma revisão**: `android.permissions`
      tinha cada permissão duplicada (8 entradas, 4 reais — limpo);
      `adaptiveIcon.backgroundColor` e a cor do plugin `expo-notifications`
      ainda apontavam pro índigo antigo (`#6366f1`, de antes do ajuste
      de contraste WCAG) — atualizados pro `#4f46e5` atual; o ícone da
      notificação apontava pro `icon.png` (opaco, fundo branco) em vez
      de um asset transparente — Android renderiza ícone de notificação
      como silhueta usando só o alpha, um PNG sem transparência vira
      bloco sólido branco na barra de status. Trocado pro
      `android-icon-monochrome.png` (branco sobre transparente, já
      correto pra esse uso).
      **Publicado (2026-08-14)**: `eas build` novo (perfil `preview`,
      Android, APK — id `178df98c-be34-41ed-b942-78032c642840`) rodado
      depois do `eas update` com as correções de JS do dia (frequência
      de intervalo, duração do tratamento, flash do onboarding,
      lembrete local de intervalo). Ícone conferido de verdade no
      dispositivo pelo Rilson — o APK compilado ofusca nome de recurso
      (`res/xH.png` etc., padrão do AGP), então não dava pra confirmar
      abrindo o `.apk` sem `aapt2` instalado; a fonte (`app.json` +
      assets) foi reconferida antes do build, mas a prova real só o
      dispositivo dava.
- Visual "minimalista demais" — feedback de gosto, não bug; registrado,
  sem ação prevista por ora.

### Decisão: Google OAuth + conta local, nunca só um (2026-08-14)

Pergunta direta do Rilson: "acho que OAuth resolve tudo, melhor que
conta local em 100% dos casos, não?" — resposta: não, e o próprio bug
do dia (`auth-callback.tsx`) é prova viva disso. OAuth depende de deep
link, Custom Tabs do navegador do aparelho e uma `Promise` que precisa
resolver certo — superfície de falha inteira que conta local não tem.
Fora isso: público real do app (idoso, cuidador com baixa familiaridade
digital) é o perfil que mais estranha "entrar com Google" num app de
saúde, e a Apple **exige** "Entrar com Apple" se você oferece "Entrar
com Google" (App Store Guideline 4.8) — "só Google" não é opção viável
em iOS de qualquer forma. Mantido como está: Google é atalho, conta
local (hoje magic link, não mais senha — ver "Login sem senha" acima
e o item corrigido em "Esqueci a senha", 2026-08-16) é a base que
nunca falta.
**Levantamento nos outros projetos pessoais (mesma pergunta)**: nenhum
outro projeto no VPS tem OAuth de usuário final — `a-bancada-evangelica`
não tem auth nenhum (conteúdo público); `biblia-na-arte` teve auth via
Supabase, arquivado; `scriptorium-divinum` só tem login de admin único
(não OAuth — e tem um bypass documentado no próprio `ROADMAP.md`,
"TEMPORARY... make all logged users admin", já rastreado lá, não é
achado novo); `lecionario` não tem conta de usuário. Ou seja: esse bug
e essa decisão são isolados do `meus-remedios`, não têm gêmeo escondido
em outro projeto — mas a regra "OAuth como atalho, nunca substituto
completo da conta local" fica registrada aqui pra qualquer projeto
futuro que precise de conta de usuário final.

### Balanço: o app está "elderly friendly"? (2026-08-14)

Pergunta direta do Rilson, pedindo honestidade. Resposta: **melhor que
a média, mas não terminado** — e o maior buraco já está mapeado e é o
próximo passo real.

**O que já ajuda:**
- Passada de acessibilidade (P7, ver Roadmap de Engenharia) — todo
  ícone sem texto tem `accessibilityRole`+`accessibilityLabel`, estado
  de seleção anunciado, leitor de tela funciona de ponta a ponta.
- Fonte dinâmica do sistema já funciona (nenhum `allowFontScaling={false}`
  bloqueando) — só falta o controle *dentro* do app.
- Auditoria de responsividade feita (2026-08-13) antes de prometer
  aumento de fonte — sem isso, fonte maior quebraria layout em vez de
  ajudar.
- Diálogos de confirmação/erro agora consistentes com o resto do app
  (`ConfirmDialog`/`AlertDialog`), sem susto de modal nativo destoante.
- Ação de 3+ escolhas (foto: câmera/galeria/remover) usa o action sheet
  nativo do SO — o que essa faixa etária já reconhece do resto do
  aparelho, não inventa padrão novo.

**Buracos reais, nenhum escondido:**
- [x] ~~Tamanho de fonte configurável no app ainda não existe~~ —
      **feito no mesmo dia** (ver "Tamanho da fonte" abaixo).
- [x] ~~Botão de editar estoque só-ícone~~ — **corrigido** (texto
      "Editar" visível ao lado do lápis). O de convidar cuidador
      continua só-ícone (linha de perfil é apertada demais pra texto
      sem redesenhar) — mitigado com o texto explicativo acima da
      lista, não com rótulo no próprio botão. Podem existir outros
      não auditados ainda; isto foi um sweep dirigido pelos 2 achados
      do dia, não uma varredura completa do app.
- [x] ~~Conceitos técnicos sem explicação~~ — **mitigado** com a tela
      de Ajuda + guia compartilhável (ver abaixo). Não elimina o
      problema de fundo (o público real pode mesmo precisar de outra
      pessoa configurando o app na primeira vez — isso não é bug, é
      realidade do produto), mas agora tem onde voltar quando esquecer,
      e um jeito de deixar instruções com quem vai usar no dia a dia.
- [x] ~~Nenhuma auditoria dedicada de contraste de cor~~ — **feita**
      (ver "Auditoria de contraste de cor" abaixo). Achados reais e
      graves (`success`/`warning` como texto davam 2.05–2.28:1 no tema
      claro), corrigidos e travados por teste.

### Tamanho da fonte (2026-08-14)

Item #1 do balanço acima, feito no mesmo dia por pedido explícito do
Rilson ("vamos continuar pra deixar o mais elderly friendly possível").
Decisão de arquitetura: não dá só pra confiar na fonte dinâmica do
sistema operacional (já funcionava, mas esse público nem sempre sabe
mexer nas configurações de acessibilidade do aparelho) — precisa de um
controle *dentro* do app, em Perfil → Aparência, mesmo padrão visual
dos seletores de tema/idioma já existentes.

- **`store/fontScaleStore.ts`** — Zustand persistido (mesmo padrão de
  `themeStore`/`languageStore`), 3 modos: Normal (1x) / Grande (1.15x)
  / Extra (1.3x). Valores calibrados com margem pra auditoria de
  responsividade de 2026-08-13 não quebrar.
- **`components/AppText.tsx`** — substituto do `<Text>` nativo que
  multiplica o `fontSize` já definido no `style` da tela pelo
  multiplicador atual. Só escala quando `fontSize` está explícito
  (todo texto visível do app já define o próprio tamanho via
  `StyleSheet`). `allowFontScaling` do sistema continua ligado por
  cima — quem também aumenta a fonte do aparelho tem os dois efeitos
  somados, de propósito, não um cancelando o outro.
- **Sweep mecânico e de baixo risco nos 13 arquivos que renderizam
  `Text`**: troca só o import (`import { AppText as Text } from
  '.../AppText'`), nenhuma outra linha muda — todo `<Text>` existente
  continua sintaticamente igual, só passa a escalar. Confirmado que
  RNTL (`getByText`) continua funcionando igual através do wrapper.
- **Achado real, no próprio recurso**: "Extra Grande" (12 caracteres)
  numa fileira de 3 colunas de largura igual (`flex:1`, mesmo padrão do
  seletor de tema) quebra sozinho — o mesmo bug do seletor de idioma já
  corrigido antes (2026-08-13), agora na própria opção que aumenta a
  fonte. Corrigido com rótulo visível curto ("Extra") separado do
  rótulo completo do leitor de tela ("Extra Grande", via
  `accessibilityLabel`) e `numberOfLines={1}` como rede de segurança
  nos 3 seletores (tema, idioma já tinha, fonte).
- Testado: `font-scale.test.tsx` (5 testes — multiplicação por modo,
  style em array, texto sem `fontSize` explícito não quebra) e novo
  describe em `profile-collaborators.test.tsx` (3 testes — seleção
  inicial, trocar de opção salva no store e atualiza
  `accessibilityState`). 171/171 backend (sem mudança), 70/70 mobile.
- **Não feito nesta parte, decisão consciente**: não toquei em
  `TextInput` (só `Text` — o que se lê, não o que se digita, que é
  menos crítico pra este público neste app). Contraste de cor foi pro
  próximo item, abaixo.

### EAS Update configurado (2026-08-14)

Pergunta direta do Rilson: "o eas update não atualiza JS sem gerar
novo APK?" — resposta: hoje não, porque o projeto nunca teve
`expo-updates` instalado (nenhum cliente de update embutido no binário
já compilado). Configurado agora: `npx expo install expo-updates` +
`eas update:configure` (gera `runtimeVersion: {policy: "appVersion"}`
e `updates.url` no `app.json`, `channel` por perfil no `eas.json` —
tudo automático via CLI, não editado à mão). **Efeito prático**: a
partir do próximo build (que já vai carregar o cliente de update
nativo), qualquer fix só-JS futuro — como os desta sessão inteira —
pode ir direto via `eas update`, sem precisar gerar e reinstalar um
APK novo. Builds continuam necessários só quando um módulo nativo novo
entrar (ex.: o próprio `expo-image-picker`, se um dia quisermos que a
foto funcione sem degradação graciosa).

### Auditoria de contraste de cor — WCAG AA (2026-08-14)

Segunda metade do pedido "deixa o mais elderly friendly possível".
Calculada a razão de contraste real (fórmula da própria spec do WCAG
2.1, luminância relativa) de cada par cor-de-texto/cor-de-fundo
efetivamente usado no app — não chute visual, número calculado.
**Achados reais, e feios**: `success` e `warning` usados como cor de
*texto* (badge "Tomado", horário atrasado, aviso de estoque baixo)
davam 2.05–2.28:1 no tema claro — não é "quase passa", é bem abaixo
até do mínimo pra texto grande (3:1). `headerSubtext` (data + "X de Y
doses" na Home, sempre visível) dava 2.99:1. `brand` como texto pequeno
dava 4.47:1, por pouco abaixo do mínimo de 4.5:1 pra texto normal — e
por ser também o `headerBg` do tema claro, o mesmo problema afetava o
texto branco do cabeçalho. No tema escuro, o achado mais sério: texto
branco sobre botão da cor `brand` (o caso mais comum de botão do app)
dava só 2.98:1 — abaixo até do mínimo de 3:1 — porque `brand` no escuro
é claro de propósito (funciona bem como *texto*, mas não como *fundo
com texto branco em cima*).

**Correção**: valores de `brand`/`headerBg`/`headerSubtext`/`textMuted`
/`success`/`warning` ajustados no tema claro pra passar 4.5:1 (`textMuted`
é exceção documentada — é o tom mais claro dos 3 níveis de texto,
intencionalmente reservado pra legenda/ícone, cobre só 3:1). Criado
token novo, `onBrand` (texto sobre fundo `brand`) — branco no tema
claro, e no escuro usa o próprio `background` do tema (quase preto,
5.98:1 sobre a lavanda de `brand`) em vez de branco. **Sweep mecânico
de baixo risco** nos 13 lugares que tinham `color: '#fff'` hardcoded
sobre botão `c.brand` (trocado por `c.onBrand`); o único `'#fff'` que
sobrou (`userName` em `profile.tsx`) fica sobre `headerBg`, não
`brand` — já tinha contraste bom nos dois temas, documentado o motivo
de não mudar.
Testado: `color-contrast.test.tsx` (3 testes) — trava os valores reais
via a mesma fórmula WCAG, não mock nem screenshot; se alguém trocar uma
cor "porque ficou mais bonita" no futuro e derrubar o contraste, o
teste quebra. 171/171 backend, 76/76 mobile.

### Tela de Ajuda + guia compartilhável (2026-08-14)

Resposta a "não tem como facilitar pra novos usuários com um guia?".
O onboarding (3 telas) só aparece uma vez, na primeira abertura — se a
pessoa esquecer o que algo significa, ou nunca chegou a ver o
onboarding porque foi o cuidador quem configurou o aparelho pra ela,
não tinha pra onde voltar. `app/help.tsx` (novo, rota `/help`, modal
igual `/pro`) fica sempre acessível em Perfil → Ajuda: 6 tópicos em
linguagem simples (o que é perfil, o que significa cada status de
dose, como funciona o cuidado compartilhado, estoque, aparência, e um
tópico direto pra quem está configurando o app pra outra pessoa).
Botão "Compartilhar guia" usa o `Share` nativo (mesmo mecanismo do
código de convite) pra mandar um resumo de 4 linhas em texto puro —
pensado pra ir por WhatsApp ou ser impresso e deixado junto de quem
vai usar o app no dia a dia, não só pra quem configurou.
Testado: `help.test.tsx` (3 testes — todos os tópicos aparecem, botão
de compartilhar chama `Share.share` com o texto certo, link "Ajuda" no
Perfil navega pra `/help`). 171/171 backend, 76/76 mobile.

### Continuação — flash de onboarding e lembrete de intervalo (2026-08-14)

Pedido do Rilson depois do balanço de recursos maiores: "continua o
máximo possível antes de qualquer atualização, quero o app mega
maduro" + "quero continuar meus testes reais e correções reais" — sem
publicar nada ainda. Dois achados reais nessa continuação:

- [x] **Mensagem de onboarding ainda piscava meio segundo em toda
      abertura**, mesmo depois do fix do `hasHydrated` (que resolvia o
      *loop* de aparecer sempre, não esse resíduo). Causa raiz
      diferente: a decisão de redirecionar roda dentro de `useEffect`,
      que só executa **depois** da primeira renderização — então
      `<Stack>` sempre desenha a primeira tela registrada (o
      onboarding) por um frame antes do redirect corrigir, não importa
      o quão certa esteja a lógica do próprio redirect. Corrigido em
      `ThemedLayout` (`_layout.tsx`): enquanto `isLoading` ou
      `!hasOnboardingHydrated`, renderiza uma `View` em branco (tema
      certo, `StatusBar` certo) em vez do `<Stack>` — nada pra piscar
      porque nada errado chega a ser desenhado.
- [x] **Lembrete local de schedule de intervalo tocava só 1x/dia**,
      mesmo o medicamento tendo várias doses no dia (ex.: de 8 em 8h).
      Gap já estava documentado no código como decisão de escopo
      deliberada do dia da feature — fechado ainda hoje em vez de ficar
      pendente. `scheduleScheduleNotifications` (mobile) ganhou o
      parâmetro `interval_hours`: quando presente, calcula cada horário
      de ocorrência do dia espelhando exatamente
      `GenerateScheduleOccurrences` do backend (âncora + intervalo,
      sem passar da meia-noite) e agenda um lembrete `DAILY` do Expo
      por ocorrência, com identifier único (`schedule_<id>_interval_<n>`)
      — o cancelamento por prefixo já existente continua funcionando
      sem mudança. Os 3 pontos que chamavam essa função (criar
      medicamento, salvar/editar horário, reativar após pausa) foram
      atualizados pra passar `interval_hours` adiante; o de reativar
      era o mais fácil de esquecer (achado ao revisar, não só o de
      criar).
      Testado: `notifications.test.ts` (novo, 4 casos — mocka o SDK do
      Expo diretamente, não o módulo inteiro, justamente pra travar o
      cálculo de horários; um dos testes prova que 3× 8h a partir das
      07h vira 07h/15h/23h e não vaza pra 07h do dia seguinte). Mais 2
      casos novos em `medication-schedule-edit.test.tsx` (intervalo no
      fluxo de criar, e reativar medicamento pausado com schedule de
      intervalo). 198/198 backend (sem mudança nesta rodada), 108/108
      mobile.

### Continuação 3 — publicação, backup do VPS, feedback de uso real (2026-08-14)

**Publicação (finalmente):**

- [x] **`eas update`** (branch/ambiente `preview`, Android + iOS) — leva
      tudo de JS acumulado no dia: intervalo, duração do tratamento,
      flash do onboarding, lembrete local de intervalo. Confirmado no
      bundle exportado antes de avisar (`grep` no `.hbc`, mesmo padrão
      do incidente do login): URL de produção presente, sem cair no
      fallback `localhost`; strings novas (`interval_hours`,
      `treatment_duration_days`) presentes.
- [x] **`eas build`** (perfil `preview`, Android, APK, id
      `178df98c-be34-41ed-b942-78032c642840`) — única forma de levar o
      ícone/splash novos, por serem asset nativo. **Limite da minha
      verificação**: o APK compilado ofusca nome de recurso (AGP
      resource shrinking, tipo `res/xH.png`), e não havia `aapt2`
      instalado pra resolver `resources.arsc` e confirmar de dentro do
      `.apk` que o ícone certo foi parar no recurso certo — só a fonte
      (`app.json` + arquivo) foi reconferida antes do build. A
      confirmação real veio do Rilson, instalando no aparelho.

**Achado real, fora do código — backup do VPS não cobria fotos:**

- [x] Pergunta direta do Rilson: "temos volume pra salvar de verdade, e
      tá incluso no backup?" — volume Docker nomeado (`remedios-storage`,
      fotos de medicamento) já existia e persiste entre rebuild/restart,
      mas o backup diário (`hetzner-infra/backup/backup.sh`) só cobria
      bind mounts (`FILE_PATHS`) — o volume nunca entrou. Se o disco do
      VPS morresse, banco e `.env` voltariam, fotos não. Corrigido no
      repo `hetzner-infra` (fora deste repo): nova seção `DOCKER_VOLUMES`
      no `backup.sh` (container Alpine descartável tarando o volume —
      evita mexer em permissão do host, que é `root:root`), checagem de
      integridade semanal em `backup-restore-test.sh`, `.env.example`
      documentado, `.env` real do VPS configurado. **Testado de ponta a
      ponta no próprio VPS**: rodei o backup manualmente e confirmei via
      `tar -tzf` que `volume-meus-remedios_remedios-storage.tar.gz`
      estava de fato dentro do backup gerado. Commitado localmente no
      `hetzner-infra` (`696ff24`); `git push` ainda não feito, fica a
      critério do Rilson.

**Rodada de feedback de uso real (lista trazida pelo Rilson, conferida
item a item contra o código antes de responder — a maioria já tinha
sido resolvida em rodadas anteriores do mesmo dia):**

- [x] Dosagem obrigatória — já resolvido antes (ver "Achados reais
      pós-`eas update`" acima).
- [x] **Teclado cobrindo campo** — resolvido em login/registro/cadastro
      de medicamento antes; **achado real ao reconferir agora**: faltava
      em `stock.tsx` (editar quantidade — o item pode estar em qualquer
      altura da lista) e `profile.tsx` (colar código de convite, criar
      perfil, senha pra excluir conta). Mesmo `KeyboardAvoidingView` +
      `keyboardVerticalOffset` do padrão já usado nas outras telas,
      aplicado nas duas que faltavam.
- [x] Frequência por intervalo — já resolvido antes.
- [x] "Criar medicamento" → "Cadastrar medicamento" — já resolvido antes.
- [x] Ordem do formulário (horário antes do botão de salvar) — já
      resolvido antes.
- [x] Estoque inicial sumido do cadastro — já resolvido antes.
- [x] Duração do tratamento — já resolvido antes.
- [x] Gráfico de adesão vazio parecendo quebrado — já resolvido antes.
- [x] Botão "Adicionar" da Home indo pra lista, não pro cadastro — já
      resolvido antes.
- [x] Sem logomarca — já resolvido antes (e confirmado no aparelho
      hoje).
- [x] **"Muito minimalista/vazio, falta identidade"** — único item
      realmente novo da lista. Avaliação: não espalhar o logo em várias
      telas (lê como inseguro); um ponto de ancoragem basta. Adicionada
      a silhueta monocromática branca (mesmo asset do ícone de
      notificação) no header da tela "Hoje" — primeira tela que a
      pessoa vê toda vez —, 30×30, decorativa
      (`accessible={false}`/`importantForAccessibility="no"`, o título
      já descreve a tela pro leitor de tela). Reaproveita o
      `marginTop` já existente do `profileList` em vez de duplicar
      espaçamento.
      Testado: `tsc --noEmit` limpo, 108/108 mobile (sem teste novo
      dedicado à marca em si — é puramente decorativa, sem
      comportamento pra travar; os testes de `home.test.tsx` já cobrem
      que os textos do header continuam renderizando depois da
      reestruturação em `headerTop`).

**Decisão registrada, sem mudança de código — exclusão de conta e LGPD:**

Pergunta do Rilson: usuário exclui conta e cria de novo com o mesmo
e-mail dias depois — recupera dado ou perde tudo? Conferido no código
(`AuthController::destroyAccount`, migrations com `cascadeOnDelete()`):
é hard delete de verdade, sem soft-delete, `email` só com `unique()`
simples — recriar com o mesmo e-mail (mesmo minutos depois) é conta
100% nova, zero vínculo com a anterior. Isso cumpre a LGPD (Art. 18,
VI — direito à eliminação) de sobra; a lei não exige período de
carência nem recuperação, isso seria só decisão de produto. **Decisão:
manter como está** — mudar pra "lixeira" com prazo contradiz a
política de privacidade atual, que já promete exclusão "imediata e
definitiva".

### Fase 4 — Monetização (pós-lançamento com usuários reais)

- [x] **Limites do plano Free** — 4 perfis, 15 medicamentos por perfil, histórico de 30 dias — já implementado e testado (ver `tests/Feature/ProfileTest.php`, `MedicationTest.php`, `DoseLogHistoryTest.php`). Falta a parte de cobrança em si (Fase L1 abaixo)
- [ ] **Tier Pro** — perfis ilimitados, medicamentos ilimitados, histórico completo; via RevenueCat (**prioridade**, decisão 2026-08-21)
- [ ] **AdMob — adiado pro futuro (2026-08-21), não descartado.** Não é
      prioridade de L1 (RevenueCat vem primeiro). Se/quando for
      revisitado, restrição permanece de pé: nenhuma tela de dose ou
      alarme recebe anúncio — é justo onde toque errado tem
      consequência real (medicação, idoso, cuidador remoto). Se cabe
      em algum lugar, é fora do fluxo de tomar remédio (ex.: tela de
      Histórico/Adesão), nunca nele.
- [ ] **Exportar histórico em PDF** — funcionalidade Pro: gerar relatório para levar ao médico
- [ ] **Widget de tela inicial Android** — ver item em Fase 2 acima (retenção, não monetização)
- [ ] **Publicar na Play Store e App Store**

---

## Roadmap de Lançamento e Crescimento (2026-08-08)

Resposta a uma pergunta direta: "o quanto falta pra virar um app com
milhares de usuários na Play Store?". Não duplica as Fases 1-4 acima —
linka nelas onde já existe o item, só adiciona o que faltava (processo
de publicação em si, monetização de verdade, aquisição, legal em
escala). Prioridade estrita: **L0 → Fase 1.5 → L1 → L2 → resto**, nessa
ordem — não adianta ter monetização sem estar na loja, nem growth sem
retenção, nem monetizar paridade de funcionalidade sem diferenciação
real (decisão de 2026-08-09, ver Fase 1.5 acima).

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

> [!NOTE] Ordem revisada em 2026-08-09
> **Fase 1.5 (cuidador remoto) vem antes disto.** Monetizar um app em
> paridade de funcionalidade com os concorrentes grandes não resolve o
> problema de aquisição — só adiciona atrito antes de ter algo que
> realmente diferencia. Ver decisão completa na Fase 1.5.

- [x] Limites do plano Free já codados e testados (ver Fase 4 acima)
- [ ] **RevenueCat**: criar conta, configurar produto de assinatura
      (mensal + anual, com desconto no anual), integrar SDK
      (`react-native-purchases`), tela de paywall
- [ ] **Decisão de preço**: pesquisar concorrência direta antes de
      chutar número — Medisafe e MyTherapy são a referência do nicho
- [ ] **AdMob** — adiado pro futuro, RevenueCat é a prioridade de L1
      (ver Fase 4 acima)
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
- [ ] **Ângulo de diferenciação real** — decisão tomada em 2026-08-09:
      cuidador↔paciente remoto (ver Fase 1.5 acima, em construção)
- [ ] **Analytics de aquisição real** — hoje não existe nada disso
      (Sentry cobre erro, não uso). Firebase Analytics ou similar antes
      de gastar esforço tentando crescer às cegas

### L4 — Legal/compliance em escala

- [x] Política de privacidade real, publicada (`/privacidade`)
- [x] **Achado real (2026-08-14)**: a política tinha 3 imprecisões
      factuais, encontradas ao revisar em resposta a uma pergunta direta
      do Rilson sobre LGPD. **A mais séria**: a seção 7 afirmava que
      dado de saúde era "visível apenas para a conta que o cadastrou" —
      falso desde a Fase 1.5 (cuidador remoto/perfil compartilhado), que
      deliberadamente permite outra conta ver o mesmo perfil. Corrigido
      pra descrever o fluxo real (convite opcional, uso único, 7 dias,
      revogável). Também: a seção 6 prometia "exportar histórico" como
      já existente — não existe (é item da Fase 4, Pro); suavizado pra
      não prometer o que o produto não entrega ainda. E o Sentry (EUA,
      terceiro real que recebe telemetria de erro) não estava
      disclosurado na seção 4 — adicionado, com nota de que não
      coletamos dado de saúde nele (`send_default_pii=false` no
      backend, sem PII explícito no mobile).
- [ ] **Revisão jurídica de verdade** da política — dado de saúde é
      categoria sensível pela LGPD; com poucos usuários o risco é
      teórico, com milhares vira exposição real (resposta a incidente,
      portabilidade de dado, etc.)
- [ ] Termos de uso — hoje só existe a política de privacidade, não um
      termo de uso separado
- [ ] **Exportação de dados de verdade** (portabilidade, LGPD art. 18
      VI) — hoje só existe "revisar na tela Histórico"; a política
      agora é honesta sobre isso, mas o direito de portabilidade real
      ainda depende de pedir por e-mail. Vale antecipar antes de L0 se
      o volume de usuário justificar, mesmo sendo Fase 4 no roadmap de
      produto

### L5 — Infra em escala (só quando o uso justificar, não adiantar)

- [ ] **Notificação push via servidor**, não só local — antecipado pra
      Fase 1.5 (Etapa 4) como pré-requisito do alerta de cuidador, não
      mais só "quando escalar". O que resta aqui depois disso é só
      generalizar pra outros usos além do alerta de dose perdida
- [ ] Sair do VPS único compartilhado com os outros projetos pessoais,
      se o uso realmente justificar — não é preocupação de agora

### Resumo honesto

**Pra estar na loja**: dias/poucas semanas — é a parte mais perto de
terminar, a base técnica (P0-P7) que fechamos hoje é justamente o que
mais diferencia isto de um projeto que nunca sai do papel.
**Pra ter milhares de usuários reais**: a distância maior não é mais
código — é produto (retenção, L2) e principalmente aquisição (L3), que
é decisão de negócio e de nicho, não engenharia. **Atualizado
2026-08-09**: decidimos atacar a diferenciação (cuidador remoto, Fase
1.5) antes de L1 — sem isso, "milhares de usuários" não tem por que
escolher este app em vez do Medisafe.

**Estimativa de potencial (2026-08-15, teto plausível, não medição
real):** hipertensão e diabetes tratados farmacologicamente somam
dezenas de milhões de pessoas no Brasil (ordem de grandeza de censos de
saúde pública, não número pesquisado especificamente pra este projeto)
— mas o recorte relevante pra este app não é esse universo inteiro, é
quem tem 3+ medicamentos com horário fixo **e** tem um cuidador
familiar disposto a acompanhar remotamente (o diferencial real). Sucesso
de nicho aqui não exige competir em volume com Medisafe/MyTherapy —
alguns milhares de duplas paciente+cuidador engajadas já validam o
diferencial — e a infra atual (VPS compartilhado, Postgres já
consolidado) aguenta essa escala sem mudança nenhuma.

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
- [x] **Achado real em produção, 2026-08-09**: qualquer requisição sem
      `Accept: application/json` (curl cru, bot, scanner) numa rota
      protegida derrubava com **500**, não 401 — o middleware
      `Authenticate` tentava montar a rota nomeada `login` pra
      redirecionar, que não existe numa API pura, e explodia com
      `RouteNotFoundException`. Pré-existente, não introduzido pela
      Fase 1.5 — só apareceu porque testei as rotas novas com `curl`
      cru. Corrigido com `$middleware->redirectGuestsTo(fn () => null)`
      em `bootstrap/app.php`, força 401 JSON sempre, testado
      (`UnauthenticatedRequestTest.php` — confirmei que falha sem a
      correção antes de reaplicar, não só assumi que resolveria),
      verificado ao vivo em produção depois do deploy
- [x] **P1 — Infra & Deploy** (2026-08-08): deploy real em
      `api-remedios.narniano.com`, Postgres compartilhado do VPS
- [x] **P2 — Saúde & Resiliência** (2026-08-09): achado real — `/up`
      só confirmava "processo de pé", não testava o banco. Se o
      Postgres caísse, o app continuaria reportando saudável pro Uptime
      Kuma (alerta falso-negativo bem na hora que mais importa).
      Corrigido com listener em `DiagnosingHealth` (hook oficial do
      Laravel 11+) checando `DB::connection()->getPdo()`. Testado
      forçando falha de conexão de verdade (`HealthCheckTest.php`, 2/2
      — confirma 200 saudável e 500 com banco indisponível, não só
      assumido). `SIGTERM`/cleanup de timers: não se aplica aqui —
      PHP-FPM é stateless por requisição, sem conexão persistente/timer
      pra limpar como um processo Node teria
- [x] **P3 — CI/CD** (2026-08-14): `.github/workflows/ci.yml` atualizado para incluir build e push automático da imagem Docker (`remedios-api`) para o GHCR. Corrigidas as permissões de gravação de pacotes e o escopo do owner.
- [x] **P4 — Testes** (2026-08-14): Suíte de testes (108 testes em 17 arquivos) otimizada com mocks síncronos de `expo-font` e `@expo/vector-icons`, reduzindo o tempo de build em mais de 50% (de 27s para 11s) e eliminando warnings de `act(...)` que travavam os workers. Corrigido race condition de localidade do Actions mockando globalmente `getDeviceLanguage()` para `"pt"`. `npm audit fix` também rodado: resolveu 4 de 21 vulnerabilidades de dev-deps sem quebrar nada; as 17 restantes têm raiz única (`xcode`→`uuid` no `@expo/config-plugins`).
- [x] **P5 — Monitoramento & Logs** (2026-08-09): Sentry no backend
      (`sentry/sentry-laravel`) **e** no mobile (`@sentry/react-native`)
      — **DSN configurado e testado de verdade**: evento real enviado e
      confirmado tanto local quanto direto do container de produção
      (`sentry:test`, IDs `8d7c8f25...` e `c087dff4...`). Rotação de log
      (parte nova desta categoria, do SHIELD-I) ainda não auditada —
      Laravel usa `LOG_CHANNEL=stack` padrão, não confirmado se tem
      rotação configurada. **Uptime Kuma** monitora `api-remedios.narniano.com`
      com alerta real em **Telegram e e-mail** (não é só painel visual) —
      explicitado aqui em 2026-08-14, item já estava concluído.
- [x] **P6 — Backups & Recuperação**: depende 100% do backup do
      Postgres compartilhado do VPS (`hetzner-infra/backup/`), testado
      ponta a ponta. **Confirmado ao vivo em 2026-08-16** (não assumido
      — checado direto no `.env` real da VPS): `meus_remedios_db` está
      no `POSTGRES_DBS`, entra no backup diário junto dos outros 3
      bancos. Não tem backup *próprio* dedicado, mas está coberto.
- [x] **P7 — UI/UX, acessibilidade e SEO** (acessibilidade real em
      2026-08-09): achado — zero `accessibilityLabel` no app inteiro até
      então (`grep` confirmou, não suposição). Passada completa nas 9
      telas com elemento tocável: `accessibilityRole`/`accessibilityLabel`
      em todo ícone-sem-texto (botão de pular dose, editar estoque,
      remover horário, convidar cuidador), `accessibilityState` pra
      seleção (perfil ativo, dia da semana, tema, filtro de histórico),
      `accessibilityState={{ busy }}` nos botões que viram só spinner
      durante loading (senão o leitor de tela não anuncia nada nesse
      estado). Achado extra corrigido no caminho: os botões de dia da
      semana ("D S T Q Q S S") são visualmente ambíguos — Terça/Quinta e
      Sexta/Sábado têm a mesma letra — sem rótulo, um usuário de leitor
      de tela não teria como diferenciá-los; agora usam o nome completo
      do dia. Fonte dinâmica do sistema: já funcionava (sem
      `allowFontScaling={false}` bloqueando em lugar nenhum, conferido).
      Teste com TalkBack/VoiceOver de verdade num aparelho ainda não
      feito — só dá pra fazer manualmente, não automatizado. **SEO não
      se aplica** — app mobile privado atrás de login, sem conteúdo
      indexável
- [x] **Fuso horário** (2026-08-10): achado real — o backend inteiro
      calculava "hoje" (tela Hoje, detecção de dose perdida) em UTC fixo
      (`config('app.timezone')`), sem nenhum campo de fuso no modelo de
      dados. Pra Brasília (UTC-3), a virada de dia acontecia às 21h
      local, 3h adiantada; em Manaus/Acre (UTC-4/-5), 4-5h — e o Brasil
      sozinho já tem 4 fusos, então isso pegava usuários reais, não só
      hipótese de expansão internacional. Corrigido: coluna `timezone`
      em `profiles` (default `America/Sao_Paulo`, capturado do
      dispositivo via `Intl.DateTimeFormat().resolvedOptions().timeZone`
      — sem dependência nativa nova), `DoseLogController::today()` e
      `CheckMissedDoses` agora calculam "hoje" com `Carbon::today($profile->timezone)`
      em vez de `Carbon::today()` cru (o comando também passou a
      recalcular por perfil dentro do loop, não uma vez só pra todos).
      App mobile manda o fuso ao criar perfil e se autocorrige
      silenciosamente no login pra quem já tinha perfil antes desta
      feature (todos nasceram com o default). Notificação local (o
      lembrete em si) já era segura — roda no relógio do próprio
      aparelho, não dependia do servidor. Testado com o cenário que
      provava o bug (dois perfis em fusos diferentes veem "hoje" como
      dias diferentes no mesmo instante): `ProfileTimezoneTest.php`
      (7/7), mobile `device-timezone.test.ts` (3/3). 127/127 backend,
      22/22 mobile
- [x] **Idioma (i18n)** (2026-08-10): app era 100% português hardcoded,
      zero infraestrutura de tradução — toda string literal direto no
      componente. Adicionado `i18next` + `react-i18next` (sem dependência
      nativa nova). pt/en/es completos (todas as 12 telas + `Alert`s +
      `accessibilityLabel`s), com pluralização real via `_one`/`_other`
      (ex: "1 horário" vs "2 horários"), não concatenação manual.
      Detecção automática do idioma do aparelho via `Intl`, com seletor
      manual na tela Perfil (mesmo padrão visual do seletor de tema:
      Sistema/Português/English/Español) pra quem quiser forçar um
      idioma diferente do de sistema. `date-fns` também segue o idioma
      (formato de data do Histórico/Hoje muda: `EEEE, d 'de' MMMM` em
      pt/es vira `EEEE, MMMM d` em en). Ambiente de teste trava em 'pt'
      de propósito — testes existentes continuam batendo nos textos
      literais em português sem precisar reescrever nada. Achado real no
      caminho: inicializar o i18next importando o módulo de produção no
      `jest.setup.ts` carregava `services/api` (via `services/device`)
      *antes* do `jest.mock('../services/api', ...)` de cada teste
      registrar — testes que mockam a API bateriam silenciosamente na
      instância axios de verdade por trás do mock. Corrigido inicializando
      o i18next direto no setup, sem esse acoplamento. Testado
      (`i18n.test.tsx`, 4/4: renderiza pt por padrão, troca pra en, troca
      pra es, idioma não suportado cai em pt). 26/26 mobile no total
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
