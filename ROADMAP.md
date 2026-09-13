# Roadmap — Meus Remédios

## 🔔👤 Mais 2 melhorias de UI/UX propostas e aprovadas (2026-09-11) — ✅ implementado, ⏸️ NÃO publicado

> Depois do "Modo Privacidade" em todas as abas (seção abaixo), pedido
> do Rilson: "Que outras melhorias de ui/ux você pode propor? Umas 3+
> por favor." — 3 achados reais (código lido, não inventado), propostas
> de UI feitas antes de implementar (`grill-me`, 3 perguntas), as 2 que
> precisavam de decisão aprovadas com as opções recomendadas.

**1. Notificações respeitando o Modo Privacidade** — antes, toda
notificação (lembrete de dose, alerta de estoque) sempre mostrava o
nome real do remédio, mesmo com o Modo Privacidade ligado — a
superfície mais exposta de todas (tela de bloqueio, sem precisar
desbloquear). Decisões aprovadas: mesmo toggle (`isPrivate`), sem
configuração nova; texto só atualiza no próximo reagendamento natural
(editar remédio/horário), sem forçar reagendar tudo na hora do toggle.
- [x] `services/notifications.ts` (nativo) e `.web.ts`: título do
      lembrete de dose vira "Hora de tomar seu remédio" (sem nome);
      corpo do alerta de estoque vira "Um remédio vai acabar em X
      dias..." — lido direto de `usePrivacyStore.getState()` no
      momento do agendamento.
- [x] Testes novos: `notifications.test.ts` (+5 casos, nativo),
      `notifications.web.test.ts` (+3 casos, mock de `window.Notification`
      já que o ambiente de teste não tem a API real).

**2. Aviso "Cuidando de {{nome}}" + troca de perfil em todas as abas**
— antes só a Home avisava de quem eram os dados vistos e só Home/Perfil
deixavam trocar de perfil; Histórico/Remédios/Estoque não tinham nem
aviso nem troca (mesmo risco de confusão "é meu remédio ou da minha
mãe?" que o banner da Home já existia pra evitar, sem cobertura ali).
Escopo aprovado: aviso + seletor de perfil juntos (não só o aviso).
- [x] `ProfileContextBar` novo (`components/`), extraído da Home —
      mesma lógica/texto, cores neutras de tema (o cabeçalho das
      outras abas é claro, não o roxo próprio da Home). Só aparece
      quando tem algo real pra mostrar (é cuidador OU mais de 1
      perfil) — Home mantém a versão dela, própria, sempre visível.
- [x] Plugado em Remédios/Histórico/Estoque. Perfil NÃO recebeu (já
      tem a lista completa de perfis própria, mais rica — duplicar
      seria clutter, não ajuda).
- [x] Testes novos: `profile-context-bar.test.tsx` (5 casos: nada com
      1 perfil só, aviso de cuidador, chips com 2+ perfis, troca ao
      tocar, `accessibilityState.selected` correto).

**Achado extra durante a implementação**: `scheduleRefillAlert` nunca
tinha teste no arquivo nativo (`notifications.test.ts`) antes de hoje —
mock de `cancelScheduledNotificationAsync` sem `mockResolvedValue`
quebrava na primeira chamada real à função. Corrigido junto.

- [x] Suíte completa depois de tudo isso: 48/48 suites, 382/382
      testes, `tsc --noEmit` limpo.

## 👁️ "Modo Privacidade" em todas as abas (2026-09-11) — ✅ implementado, ⏸️ NÃO publicado

> Achado real do Rilson: "o olhinho para esconder ou mostrar nomes de
> remédios só aparece na tela de hoje, o usuário tem que voltar lá para
> ativar de novo. Não tem como deixar nas outras telas? Aliás, o
> objetivo daquele olhinho está claro para os usuários?" — proposta
> feita antes de implementar (2 perguntas via `grill-me`), aprovada com
> as duas opções recomendadas.

- [x] O ESTADO (`isPrivate`) já era global/persistido — todas as telas
      já liam o mesmo store. O problema real era só o CONTROLE: existia
      apenas no cabeçalho custom da Home.
- [x] `PrivacyToggleButton` novo, plugado uma vez só em
      `screenOptions.headerRight` do layout das abas — aparece agora em
      Remédios/Histórico/Estoque/Perfil também (Home mantém o dela,
      própria, no cabeçalho colorido).
- [x] Linha "Modo Privacidade" nova em Perfil → "Privacidade e
      Segurança" (mesmo padrão visual do Alto Contraste/Bloqueio
      biométrico) — fecha a string `profile.privacyMode` que já
      existia no i18n mas nunca tinha virado UI de verdade. Seção
      passa a aparecer sempre (antes só existia se o bloqueio
      biométrico fosse suportado pelo aparelho).
- [x] Toast explicativo só na PRIMEIRA vez que a pessoa mexe no
      olhinho, de qualquer um dos lugares (`togglePrivacyWithHint`,
      `lib/privacy.ts`, flag `hasSeenPrivacyToggleHint` persistida) —
      nunca mais depois disso.
- [x] `accessibilityState={{ checked }}` + `accessibilityRole="switch"`
      alinhados em todos os lugares (o da Home não anunciava estado
      antes).
- [x] **Achado extra revisando o código** (mesma categoria, achado
      sozinho): `home.skippedLabel` (rótulo de acessibilidade do botão
      "Pulado") usava `item.medication.name` cru em vez de
      `maskedName` — leitor de tela dizia o nome real do remédio mesmo
      com o Modo Privacidade ligado. Corrigido.
- [x] Testes novos: `privacy.test.ts` (toast só na primeira vez, 3
      casos); `profile-collaborators.test.tsx` ajustado (query
      `getByText('Desativado')` deixou de ser única na tela com a
      seção sempre visível — escopado com `within()`).
- [x] Suíte completa: 47/47, 369/369, `tsc --noEmit` limpo.

## 🔒 Auditoria de segurança pré-build (2026-09-11) — em andamento, ⏸️ NÃO publicada

> O Rilson perguntou "está tudo testado? documentado? seguro? vale a
> pena gerar o APK?" — resposta honesta foi "os testes automatizados
> cobrem o que dá pra cobrir sem um build nativo real; segurança não
> tinha sido auditada de propósito ainda". Ele pediu pra rodar a
> auditoria antes do build ("Sim, rode a auditoria, e depois seguimos
> para o build").

- [x] **Achado real — corrida de reidratação no `privacyStore`
      (bloqueio biométrico "falha aberta")**: `BiometricLockScreen` lia
      `isBiometricsEnabled` direto do `usePrivacyStore`, sem esperar o
      `zustand-persist` terminar de reidratar do AsyncStorage
      (assíncrono — mesma classe de bug já achada e corrigida uma vez
      neste projeto, em `onboardingStore.ts`). No intervalo entre o app
      abrir e a reidratação terminar, o valor em memória é o default
      `false` — alguém que tinha o bloqueio biométrico LIGADO de
      verdade podia ver uma fresta real do app (dados de saúde) antes
      do bloqueio "descobrir" que devia travar. Corrigido com o mesmo
      padrão de `hasHydrated`/`onRehydrateStorage` já usado em
      `onboardingStore.ts`: `BiometricLockScreen` agora represa a
      decisão (`readyToDecide`) até os dois stores persistidos
      hidratarem, cobrindo a tela (sem ainda pedir biometria) nesse
      meio-tempo em vez de arriscar mostrar o app — falha FECHADA, não
      aberta. Arquivos: `store/privacyStore.ts`,
      `components/BiometricLockScreen.tsx`. Testado:
      `biometric-lock-screen.test.tsx`, 6/6 passando depois da mudança.
- [x] Revisão de autorização em todos os controllers do backend
      (`api/app/Http/Controllers/*.php`): todo endpoint que expõe um
      recurso de um perfil/remédio/dose/schedule específico passa por
      `Gate::authorize` (policies já existentes) antes de tocar no
      dado; `PushTokenController::store` escopa por `user()->id` do
      token autenticado; `DataExportController` usa URL assinada com
      expiração curta (LGPD, portabilidade) — id embutido na própria
      assinatura, não confiável sem ela; `ProfileCollaboratorController
      ::accept` valida convite pendente/não-expirado antes de
      qualquer coisa; `RevenueCatWebhookController` compara o secret
      com `hash_equals` (tempo constante, já corrigido em auditoria
      anterior de 2026-09-08). Nenhum achado novo aqui.
- [x] Checado SQL/SQLite injection nas mudanças novas desta sessão
      (`offlineQueue.ts`, migração `retry_count`) — tudo via query
      parametrizada, nenhuma interpolação de string. Nenhum achado.
- [x] Revisão de config de build (`eas.json`/`app.json`) —
      `appVersionSource: "remote"` (sem bump manual necessário),
      `runtimeVersion.policy: "appVersion"`. Sem achados.
- [ ] Reportar auditoria completa pro Rilson e aguardar confirmação
      antes do `eas build` (instrução dele: "rode a auditoria, e depois
      seguimos para o build" — sequencial, não simultâneo).

## 🆕 "Tomei antes da hora" (2026-09-11) — ✅ implementado, ⏸️ NÃO publicado

> Achado real do Rilson usando o app: tocar "Tomei" numa dose ainda
> longe no futuro (ex.: remédio das 20h, tocado às 17h) simplesmente
> gravava o horário AGENDADO como tomado, sem perguntar nada — só o
> lado ATRASADO tinha a oferta de "quer adiantar o horário de hoje/
> sempre?" (ver seção "Rodada de transparência" abaixo). Pergunta dele:
> "Se eu clicar em Tomei antes da hora ele não deveria me perguntar se
> eu quero adiantar a hora hoje e outros dias? Deveria."

- [x] Nova função `isEarly()` (espelha `isDelayed()`, mesmo limiar de
      30min já decidido pra "diferença grande o bastante pra valer a
      pena perguntar" — vale nos dois sentidos, não só atraso).
- [x] `handleTakePress` agora abre o modal "Outro horário" (em vez de
      marcar direto) tanto pra Atrasado quanto pra Adiantado 30min+;
      chip "No horário previsto" também fixado nos dois casos.
- [x] Toda a infraestrutura de recálculo ("só hoje"/"pra sempre",
      diálogo, endpoint `recalculate-today`, `PUT /schedules/{id}`) já
      era 100% direction-agnostic (usa diferença absoluta / `time` cru)
      — zero mudança de backend precisou, só o roteamento no frontend
      que faltava.
- [x] Testes novos em `home.test.tsx` (describe "Tomei numa dose muito
      adiantada"): abre modal em vez de marcar direto; "Agora" oferece
      o diálogo de recalcular; "No horário previsto" continua gravando
      o horário agendado sem oferecer recalcular.

## 🗣️ Rodada de transparência/UX pós-implementação (2026-09-11) — ✅ concluída, ⏸️ NÃO publicada

> A pedido do Rilson, depois de fechar a entrevista de decisões de
> horário: revisão do app inteiro com a lente de "transparência total +
> mínimo de builds de APK possíveis" (motivo dele: custo — cada build
> EAS não é de graça). Achados reais no código (não suposição), cada um
> virando uma decisão registrada aqui.

1. **Terminologia "Não tomado" vs. "Perdido"** — achado: o Histórico já
   usava `"filterMissed": "Não tomado"` pro status `missed`, diferente
   do "Perdido" que eu tinha acabado de colocar na Home no mesmo dia.
   **Decisão do Rilson: "Não tomado" é mais claro pra audiência em
   português — alinhar os dois pra essa palavra.** ✅ Implementado: Home
   agora reusa a MESMA chave i18n que o Histórico (`history.filterMissed`),
   não uma cópia — não tem mais como as duas telas divergirem de novo
   sem ninguém perceber (foi exatamente isso que causou a inconsistência
   original). Textos dos diálogos ("Continua perdida" etc.) também
   ajustados pt/en/es. Testado (`home.test.tsx`).
2. **Permissão de notificação negada era invisível pra sempre** —
   achado: só pedida 1x no onboarding, nunca mais checada; negar ou
   revogar depois nas configs do aparelho parava os lembretes sem
   nenhum aviso em lugar nenhum. **Decisão do Rilson: "Sim, ative isso.
   E explique para o usuário como ativar."** ✅ Implementado:
   `NotificationPermissionBanner` novo (mesma posição/padrão visual do
   `OfflineBanner` já existente), reconsulta a permissão sempre que o
   app volta a ficar ativo (`AppState`, não só no boot — pega quem
   revogou enquanto o app estava em segundo plano). Toque no banner
   explica o passo a passo e abre as Configurações do aparelho direto
   (`Linking.openSettings()`). `getNotificationPermissionStatus` novo
   em `services/notifications.ts`/`.web.ts`. Testado (6/6,
   `notification-permission-banner.test.tsx`).
3. **Dose perdida no offline sync, sem avisar ninguém** — achado: dose
   registrada offline que falha ao sincronizar por erro REAL do
   servidor (não falta de rede) era descartada silenciosamente, só um
   `console.error` que ninguém via; o contador `failed` já existia num
   store (`syncStore`) mas nada na tela lia ele. Rilson perguntou
   explicitamente se o sync automático ao reconectar já existia —
   **confirmado no código: sim** (`startAutoSync`, `NetInfo.addEventListener`
   persistente, drena a fila toda vez que a conexão volta, durante toda
   a sessão). **Decisão do Rilson: "vá pelo recomendado" (retry
   limitado) + garantir que nenhum dado se perca silenciosamente.**
   ✅ Implementado: retry de até 3 tentativas (uma por sincronização,
   não em sequência — evita bater no servidor repetido pro mesmo erro
   em segundos) antes de desistir de vez; erro de REDE continua
   reintentando pra sempre como já era (sem limite, resolve sozinho ao
   reconectar). Só avisa (toast) na desistência DEFINITIVA, nunca numa
   tentativa que ainda vai repetir — sincronização com sucesso continua
   silenciosa. Migração local nova (`retry_count` na tabela SQLite do
   device, `ALTER TABLE` com fallback pra quem já tinha o app
   instalado). Testado (`sync.test.ts`, incluindo prova de que uma
   falha isolada ainda sincroniza numa tentativa seguinte, antes de
   esgotar).
4. **Bloqueio biométrico (`services/biometrics.ts`) construído, nunca
   conectado a nenhuma tela** — achado ao auditar dependências nativas
   pendentes de build; o toggle (`isBiometricsEnabled`) também já
   existia pronto no `privacyStore`, igualmente nunca lido em lugar
   nenhum. **Decisão do Rilson: retomar e conectar, "com todo cuidado e
   teste possível" — só trava na ABERTURA do app (não a cada volta de
   segundo plano), toggle em Perfil (nova seção "Privacidade e
   Segurança", ao lado do "Modo Privacidade" que já existe — "se
   colocamos é para a privacidade, não é? Faz todo sentido"), sem
   brecha nenhuma se a autenticação falhar.** ✅ Implementado:
   `BiometricLockScreen` novo (overlay de tela cheia, mesmo padrão do
   `PrivacyBlur`/`OfflineBanner` já existentes), só ativa com usuário
   logado + onboarding completo (não trava a tela de login, que não tem
   nada sensível ainda); toggle escondido por completo em aparelhos sem
   biometria configurada (mostrar um toggle que não protege nada de
   verdade seria sua própria quebra de transparência). Fallback pra
   PIN/senha do aparelho já vem de graça do `authenticateWithBiometrics`
   existente. Testado (6/6, `biometric-lock-screen.test.tsx`, cobrindo
   os 4 cenários de quando trava/não trava + sucesso + falha com retry).
5. **Fricção do fluxo "Tomei numa dose Atrasada"** — Rilson perguntou se
   existia UI melhor que o diálogo de 2 botões + reabrir "Outro
   horário" (até 3 toques pro caso comum e trivial). Proposta: fundir
   os dois — "Tomei" numa dose Atrasada abre o modal "Outro horário"
   DIRETO, que ganha "No horário previsto (HH:mm)" fixado e destacado
   acima do grid de atalhos de sempre (mesmas 2 escolhas de antes,
   nenhuma opção a menos). **Decisão do Rilson: "vá no recomendado".**
   ✅ Implementado: diálogo separado removido, `handleTakePress`
   redireciona pro modal já existente; testado (`home.test.tsx`,
   incluindo prova de que o botão NÃO aparece numa dose que não está
   atrasada).

**Suítes verdes depois de tudo isso**: frontend 47/47 (363/363 testes),
`tsc --noEmit` limpo. Backend não foi tocado nesta rodada (todos os 5
itens são só frontend). Nada commitado/buildado/publicado ainda — só o
picker de horário de mais cedo hoje precisa de build nativo; o
bloqueio biométrico TAMBÉM precisa (`expo-local-authentication`, já
instalado desde antes mas nunca ativado num build de verdade) — os
dois podem entrar juntos no mesmo build quando aprovado. Todo o resto
(retry de sync, banner de notificação, terminologia, fusão de UI) é JS
puro, pode ir via `eas update` a qualquer momento.

---

## 🗣️ Entrevista de decisões de horário (skill `grilling`, 2026-09-11) — em andamento, nada implementado ainda

> A pedido do Rilson: usar a skill `grill-me`/`grilling` pra tirar dúvidas
> de produto sobre horário ANTES de mexer em código, uma rodada de
> perguntas por vez, registrando as respostas antes de seguir pra
> próxima rodada. Ordem explícita dele: **"Registrar, testar, perguntar,
> isso é muito importante"** — nada abaixo está implementado ainda, é só
> o registro das decisões já tomadas na entrevista.
>
> **Princípio geral que ele articulou, cobrindo todas as respostas**:
> nenhuma decisão automática sobre a saúde da pessoa deve acontecer
> escondida ou sem escolha dela — transparência total, agência total.
> Toda vez que o app decidir algo por conta própria sobre horário/dose,
> isso precisa ficar visível e, quando fizer sentido, virar pergunta pro
> usuário, não automatismo silencioso.

### Rodada 1 — decisões confirmadas

1. **Fuso do celular muda o fuso do perfil (mantém o comportamento
   atual)** — mas **precisa ficar claro pro usuário quando isso
   acontecer**. Hoje o `syncOwnedProfileTimezones` troca o fuso
   silenciosamente ao carregar a Hoje. Falta: avisar visivelmente
   quando o fuso realmente mudar.
2. **Adicionar período de tolerância antes de marcar "Perdido"**
   (hoje é instantâneo, sem tolerância nenhuma) — e isso precisa ficar
   claro pra pessoa (estado visual, não só timer invisível). Além
   disso: ao escolher um novo horário via "Outro horário" pra uma dose
   que já tinha virado "Perdido", **a pessoa deve poder escolher se ela
   continua contando como perdida ou não** — não é automático virar
   "Tomado" só porque um horário foi registrado.
3. **Horário fixo também deve poder recalcular as próximas doses do
   dia** (hoje só existe pra intervalo, fixo é rejeitado com 422) — mas
   **sempre como pergunta ao usuário**, nunca automático. "Ele que deve
   ser a pessoa capaz de escolher sobre o futuro de sua saúde pessoal."
4. **Recalcular que cruza a meia-noite deve "vazar" pro dia seguinte**
   (hoje simplesmente some — amanhã volta pro horário-âncora normal,
   sem herdar o deslocamento). Motivo dele: gente esquece de marcar,
   não vê notificação, esquece de recalcular — a aplicação precisa
   prever isso e deixar a escolha nas mãos do usuário, não descartar
   silenciosamente.
5. **Cancelar de verdade o lembrete local antigo ao recalcular** (hoje
   cria um lembrete novo e deixa o antigo vivo — pode notificar 2x pra
   mesma dose). "Esse tipo de coisa faz o usuário se confundir e
   ressentir do desenvolvedor."

### Rodada 2 — respondida

6. **Troca de fuso**: os dois — toast no momento + marcador permanente
   no Histórico ("fuso mudou de X pra Y aqui").
7. **Tolerância antes de "Perdido"**: 30 minutos.
8. **Estado visual durante a tolerância**: NENHUM estado novo — a dose
   continua parecendo "Pendente" normal pelos 30 minutos inteiros, sem
   virar "Atrasado" nem nada diferente antes disso. Só depois dos 30min
   vira "Perdido" de vez. ("Deixe sem atrasado até passar dos 30
   minutos.")
9. **Escolha de manter "Perdido" ou não em "Outro horário"**: opção (c)
   — só pergunta quando a dose JÁ estava "Perdida" de verdade antes de
   abrir "Outro horário". No fluxo comum (dose ainda pendente, só
   atrasada dentro da tolerância) não pergunta nada, "Outro horário" já
   implica que foi tomado.
10. **Recalcular horário fixo**: opção (a) — desloca todas as próximas
    doses fixas do dia pelo mesmo atraso, **sempre com confirmação**
    (reforçado explicitamente: "mas perguntar para confirmar").
11. **Limiar de 30min pro horário fixo**: sim, mesmo número do
    intervalo — e "deixar isso claro para o usuário" (o limiar não pode
    ser um número escondido/mágico, precisa aparecer de algum jeito
    visível pra pessoa entender por que foi ou não oferecido).
12. **Cruzar a meia-noite / mudança permanente vs. só hoje**: resolvido
    depois de uma rodada de esclarecimento — em vez do app decidir entre
    "só hoje" ou "pra sempre" sozinho, **pergunta explicitamente ao
    usuário**: "Voltar ao horário normal amanhã ou reajustar todos os
    dias?". As duas opções já existem em espírito na arquitetura atual:
    "só hoje" = o `today_override_date`/`today_override_time` que já
    existe; "pra sempre" = equivalente a editar o `time` permanente do(s)
    `dose_schedule`(s) — mesma coisa que "Editar horário" já faz, só que
    disparado por este fluxo também.
13. **Essa escolha (só hoje / pra sempre) é sempre oferecida ao
    recalcular** — intervalo ou fixo, cruzando meia-noite ou não. Não é
    condicional a nenhum cenário específico; vira a pergunta padrão de
    todo recálculo, substituindo o "Ajustar as próximas doses de hoje?"
    de hoje por uma pergunta com essas duas opções.

### Rodada 3 — grill-me do Claude em cima da entrevista (achados de código relidos antes de perguntar)

> Revisão de código encontrou pontos que a entrevista original não
> fechava: `home.delayed`/"Atrasado" é hoje o ÚNICO label pro status
> `missed`, sem nada chamado "Perdido" em lugar nenhum; e o comando
> agendado real `api/app/Console/Commands/CheckMissedDoses.php` flipa
> pra `missed` de forma **instantânea** (`if (! $scheduledAt->isPast())
> continue;`, zero tolerância) — confirmando que a tolerância É mudança
> de backend, não só de exibição.

14. **Terminologia — revisa o item 8**: mantém "Atrasado" (mais claro e
    suave que "Perdido"). Mas o modelo ganha um segundo patamar: a
    tolerância de 30min (item 7) passa a ser o limiar pra **"Atrasado"**
    (não pendente mais, mas ainda não perdido), e um limiar NOVO de
    **24h** vira o gatilho pra **"Perdido"** de vez. Ou seja: `<30min` =
    Pendente (sem mudança visual) → `30min–24h` = Atrasado (estado
    visual novo, computado) → `>24h` = Perdido (status `missed` real do
    backend, `CheckMissedDoses` passa a esperar 24h em vez de 0).
15. **Confirmado**: a mudança de tolerância é no backend
    (`CheckMissedDoses`), não cosmética de app. Constante global fixa
    (24h agora, não mais os 30min brutos) — sem configuração por
    remédio/perfil por enquanto.
16. **Limiar visível (item 11)**: aceito como recomendado — o diálogo de
    confirmação passa a citar o número explícito ("mais de 30 minutos
    de diferença do horário previsto") em vez do atual "bem diferente",
    vago. Nenhum indicador novo pra diferença pequena.
17. **Item 4 (vazar pra meia-noite)**: aceito como coberto por 12/13 —
    "pra sempre" já resolve o vazamento por construção; sem lógica
    própria adicional.
18. **Notificação duplicada em "só hoje" (item 5)** — Rilson não aceitou
    a resposta inicial ("não tem como evitar 100%"), pediu reinvestigar:
    "não tem mesmo como cancelar notificação e reagendar outra? Se não
    vai confundir o usuário." **Em aberto pra Rodada 4** — análise mais
    funda encontrou uma distinção real entre 2 casos (tomar ATRASADO vs.
    ADIANTADO em relação ao horário previsto) que muda o que é
    tecnicamente possível; ver pergunta detalhada na próxima rodada.
19. **Recalcular horário fixo (item 3/6 do grill)**: confirmado — escopo
    restrito só ao MESMO `dose_schedule` que foi ajustado. NÃO desloca
    outro horário fixo do mesmo remédio (ex.: 08h e 20h como schedules
    separados) sem perguntar por ele especificamente — deslocar sem
    perguntar violaria o princípio de agência total do próprio Rilson.
20. **Marcador de troca de fuso (item 6)**: aceito como recomendado —
    evento de sistema misturado no feed do Histórico (não seção
    separada), persistido no backend (sobrevive troca de aparelho/
    reinstall, mesma fonte de verdade que o resto do Histórico).

### Rodada 4 — respondida (UX/UI + fechar item 18)

21. **Notificação duplicada em "só hoje" (fecha item 18)**: aceito —
    cancelar+recriar o lembrete recorrente já resolve o caso comum
    (tomar ATRASADO — horário original já passou, nunca dispara de
    novo). Caso raro (tomar ADIANTADO, como o Ibuprofeno de hoje) pode
    gerar 1 aviso a mais só naquele dia, sem persistir — mitigado
    fazendo o app, se esse aviso for tocado, reconhecer que a dose já
    foi registrada ("já registrado, nada a fazer") em vez de pedir pra
    marcar de novo. Ataca a confusão real, não persegue zero-notificação
    perfeito (que reabriria a decisão já descartada de processo em
    segundo plano).
22. **Cor do "Atrasado"**: própria, distinta da cor de "Perdido" — os
    dois precisam ser diferenciáveis à distância, não só no texto.
23. **Atualização ao vivo dos estados por tempo**: SIM, quer atualização
    ao vivo (não só no próximo refresh). Confirmado técnico:
    Pendente→Atrasado (30min) é 100% computado no cliente
    (`scheduled_at` vs. agora) — dá pra ser instantâneo com um timer
    local, sem custo de rede. Atrasado→Perdido (24h) é um status real
    do backend, e o cron que faz esse flip (`doses:check-missed`,
    confirmado em `bootstrap/app.php`) roda a cada **15 minutos** — ao
    vivo de verdade aqui significa a tela reconsultar o servidor nesse
    intervalo, não instantâneo como o outro.
24. **"Outro horário" numa dose Atrasada (ainda não Perdida)**:
    confirmado, não pergunta nada extra (só pergunta quando já virou
    Perdido de verdade).
25. **"Tomei" numa dose Atrasada — revisa a recomendação anterior**:
    Rilson quer PERGUNTAR ("você tomou no horário certo?") em vez de
    gravar `scheduled_at` silenciosamente. "Dar mais opções ao usuário é
    sempre melhor." Desenho proposto (a confirmar): tocar "Tomei" numa
    dose Atrasada abre uma pergunta rápida de 2 botões — "Sim, no
    horário previsto" (comportamento atual, grava `scheduled_at`) vs.
    "Não, foi outro horário" (abre o fluxo "Outro horário" já existente)
    — sem inventar um terceiro caminho novo, só reconectando os 2 que já
    existem.

### Rodada 5 — respondida, entrevista concluída

26. **Cadência do "ao vivo"**: aceito como recomendado — timer local
    ~1min pra Pendente→Atrasado (sem custo de rede), `refetchInterval`
    ~5min pra pegar o flip real de Perdido do backend.
27. **Desenho do "Tomei numa dose Atrasada"**: aceito como recomendado —
    2 botões ("Sim, no horário previsto" / "Não, foi outro horário"),
    sem inventar um terceiro fluxo.

**Entrevista concluída (27 decisões, 5 rodadas). Autorizado a implementar:
"Pode começar depois de registrar. Pode ir até terminar." Pedido
explícito: capricho de UI/UX, usar skill de design se fizer diferença.**

---

## 📋 Plano de implementação consolidado (2026-09-11) — ✅ concluído, ⏸️ NÃO publicado

> Resumo de tudo que a entrevista decidiu, como checklist de execução.
> **Tudo abaixo está codificado e testado** — backend 274/274 (PHPUnit,
> Docker `laravelsail/php84-composer` já que não há PHP local), frontend
> 349/349 (Jest) + `tsc --noEmit` limpo. Ainda **NÃO publicado** — nada
> commitado/buildado/deployado, mesma instrução de hoje: só sobe quando
> o Rilson mandar.

**Backend (Laravel, `api/`)**
- [x] `CheckMissedDoses`: threshold de instantâneo pra 24h
      (`DoseLog::MISSED_TOLERANCE_HOURS`, fonte única também usada por
      `DoseLogController::today()`). Achado no caminho: o comando só
      olhava "hoje" — uma ocorrência tarde da noite nunca completava
      24h antes de "hoje" pro comando já ter virado outro dia; corrigido
      olhando "ontem" também.
- [x] Recalcular aceita horário FIXO também — na prática não precisou
      mexer no endpoint `recalculate-today` (um schedule fixo só gera 1
      ocorrência/dia, não sobra nada pra deslocar no mesmo dia); o
      frontend trata "só hoje" pra fixo como confirmação sem chamada
      nenhuma, e "pra sempre" reusa `PUT /schedules/{id}`.
- [x] "Só hoje" (mecanismo `today_override_*` que já existia) vs. "pra
      sempre" (edita `time` permanente via `updateSchedule`, mesmo
      endpoint de "Editar horário") — implementado 100% no frontend,
      sem precisar de endpoint novo.
- [x] "Continua contando como perdida?" — vira um GATE no frontend antes
      de abrir "Outro horário" numa dose `missed`; `store()` já aceita
      status `taken` sobrescrevendo `missed` via `updateOrCreate`
      (upsert por schedule+scheduled_at), não precisou de mudança.
- [x] Marcador de troca de fuso — tabela nova `profile_timezone_changes`
      (migration + model), gravado em `ProfileController::update`
      quando o `timezone` muda de verdade (idempotente — reenviar o
      mesmo fuso não cria marcador fantasma), exposto em
      `DoseLogController::history()` como chave nova `timezone_changes`
      (soma ao objeto do paginador, não quebra quem já consome só
      `.data`).

**Frontend (`app/`)**
- [x] Estado "Atrasado" novo, 100% computado no cliente (30min–24h),
      cor própria (`colors.delayed`, WCAG AA/AAA auditado nos 4 temas)
      distinta de "Perdido". Label "Perdido" assume o lugar do
      "Atrasado" antigo (`i18n` `missedStatus`, status `missed` real do
      backend, >24h).
- [x] Timer local 1min (`setInterval` + `nowTick`) pra Pendente→Atrasado
      + `refetchInterval: 5min` na query de `today-doses` pro flip de
      Perdido do backend.
- [x] "Tomei" numa dose Atrasada abre confirmação de 2 botões ("Sim, no
      horário previsto" / "Não, foi outro horário") — reconecta no
      fluxo "Outro horário" já existente, sem inventar um terceiro.
- [x] "Outro horário" numa dose Atrasada (não Perdida) continua sem
      perguntar nada extra; só pergunta quando `status === 'missed'` de
      verdade.
- [x] Modal de recalcular reescrito: sempre pergunta "Só hoje" / "Sempre,
      a partir de agora" (substitui o "Ajustar as próximas doses de
      hoje?" simples de antes); funciona pra horário fixo também; texto
      cita "mais de 30 minutos" explicitamente.
- [x] Toast de troca de fuso (`syncOwnedProfileTimezones` deixou de ser
      `void`, devolve o que mudou de verdade) + linha do marcador
      intercalada no feed do Histórico por data (não seção à parte).
- [x] Notificações — "pra sempre" reusa `scheduleScheduleNotifications`
      (cancela+recria sozinho, zero duplicata, closed de graça por
      reuso). **Item "toque numa notificação já registrada mostra 'já
      registrado'" — achado durante a implementação: não existe nenhum
      handler de toque de notificação neste app hoje** (sem
      `addNotificationResponseReceivedListener`); o comportamento
      padrão do SO ao tocar é só abrir o app na tela normal — que já
      busca `today-doses` fresco e mostra o estado REAL (dose já
      tomada aparece "Tomado", não reabre nenhum fluxo de marcar).
      Construir esse handler do zero seria infraestrutura nova só pra
      um caso raro (registrar ADIANTADO, no mesmo dia) que o
      comportamento padrão já resolve na prática — decisão de não
      construir, não pendência esquecida.
- [x] i18n: pt/en/es pra tudo isso (`home.*`, `history.*`).
- [x] Testes cobrindo cada item — backend: `CheckMissedDosesCommandTest`
      (+3 casos novos, incl. o achado de "ontem"), `DoseLogTodayTest`
      (revisado, endpoint não marca mais "missed" sozinho),
      `ProfileTimezoneTest` (+3 casos), `DoseLogHistoryTest` (+1).
      Frontend: `home.test.tsx` (Atrasado, diálogos novos, recalcular
      fixo/intervalo × só-hoje/sempre), `history.test.tsx` (marcador de
      fuso), `device-timezone.test.ts` (retorno novo),
      `color-contrast.test.tsx` (token `delayed`).

---

## ✅ Renomeação pra "Assídua" concluída (2026-08-22/23) — gate liberado

> **Histórico**: colisão de nome confirmada ("Meus Remedios" já existia
> na App Store/Play, mais homônimo B2B) levou à pausa de 2026-08-22 e
> à decisão de renomear pra **Assídua** antes do L0 (análise completa
> na seção ⚖️ abaixo, processo/checklist em `NAMING.md`). A renomeação
> foi executada de ponta a ponta: código, infra (Docker/Traefik/DNS),
> painéis externos (GCloud OAuth, EAS env vars), merge de contas
> duplicadas verificado (nenhuma duplicata real encontrada), container
> órfão do nome antigo removido, todos os itens "fácil" da lista de
> pendências (alerta feio, seleção de perfil) resolvidos.
>
> **No ar hoje**: web em `assidua.narniano.com`, API em
> `api-assidua.narniano.com` (Laravel + Postgres + Docker no VPS
> Hetzner), app mobile via OTA no canal `preview`. CI/CD verde
> (145/145 mobile, backend com suíte passando via branch+PR).
>
> **Único bloqueio real que resta**: L0 (Google Play Console),
> travado pela taxa de $25 da conta de desenvolvedor — tudo o que não
> depende disso já foi feito ou está no backlog abaixo, não represado
> por gate nenhum.

---

## UX/UI, Micro-interações & Retenção de Uso (v1.3)

- [x] **Satisfação & Engajamento do Usuário**:
  - [x] Feedback hático ao marcar "Tomei o remédio" — já existia
        (`Haptics.notificationAsync`, `app/(tabs)/index.tsx`); a
        micro-animação visual de celebração continua em aberto, o
        hático em si não é pendência.
  - [x] **Anel de progresso circular na Home** — `components/AdherenceRing.tsx`
        (2026-09-05), `react-native-svg` (dependência nova, ver nota de
        build abaixo). Mesmos limiares de cor do gráfico semanal
        (≥80/50-79/<50), com `accessibilityRole="progressbar"` e label
        pluralizado. Envolvido em `<ErrorBoundary fallback={null}>` —
        num build antigo sem o módulo nativo linkado, some sozinho sem
        quebrar a Home (o texto "N de M doses" ao lado já cobre a
        mesma informação). **Só ativa de verdade no próximo `eas build`**,
        mesma pendência já documentada pro `react-native-purchases`.
  - [x] **Modo Alto Contraste (AAA)** — `constants/theme.ts`
        (`highContrastLightColors`/`highContrastDarkColors`),
        `store/highContrastStore.ts`, toggle em Perfil › Aparência.
        Ortogonal ao claro/escuro (troca a paleta, não decide tema
        sozinho). Auditado em `__tests__/color-contrast.test.tsx` —
        7:1 real, não só a meta declarada.
  - [x] **Calendário de adesão (verde/amarelo/vermelho)** —
        `components/AdherenceCalendar.tsx`, endpoint novo
        `GET /profiles/{id}/daily-adherence` (Laravel:
        `CalculateDailyAdherence`, extraído de `CalculateWeeklyAdherence`
        pra reusar a mesma conta dia a dia — semana virou composição
        disso, não duplica lógica). Mês atual por padrão, navegação
        prev/next, mesmo teto de profundidade grátis/Pro do gráfico
        semanal. 242/242 backend, 38/38 suítes mobile.

### Follow-up de qualidade da v1.3 (2026-09-05/06)

- [x] **DRY**: cor por percentual (`>=80/50/<50`) duplicada em 3
      componentes — extraída pra `lib/adherence.ts` (`getAdherenceColor`).
- [x] **i18n**: legenda do `AdherenceChart` (semanal) era texto
      hardcoded, nunca passava por `t()` — inconsistente com o
      `AdherenceCalendar` novo. Unificados em `history.adherenceLegend*`,
      compartilhados pelos dois.
- [x] **Seção "Acessibilidade"** em Perfil agrupando Tamanho da fonte +
      Alto Contraste — antes o toggle de contraste não tinha título
      próprio, parecia sub-item da fonte.
- [x] **Toque mínimo de 48px (WCAG AAA)** — escopado só pro que foi
      tocado nesta sessão (não é a auditoria do app inteiro, que
      continua em aberto como item maior): botões Adicionar/Definir/
      Cancelar do estoque, setas de navegação do calendário, CTA de
      empty state (Home + Remédios) — todos ganharam `minHeight`/
      `minWidth: 48`. Testado em `__tests__/touch-targets.test.tsx`.
- [x] **Auditoria de toque mínimo do app inteiro — ✅ resolvido 2026-09-08**
      (a pedido explícito do Rilson, retomando o item acima). Passada
      tela por tela em todo `app/` e `components/` (260 elementos
      tocáveis revisados). Dois critérios, não um só "bota minHeight:48
      em tudo":
      - **Crescer a caixa** (`minHeight`/`minWidth: 48` + `justifyContent`
        quando faltava) onde crescer não aperta nada ao redor — botões de
        largura cheia, fileiras que já quebram linha (`flexWrap`), linhas
        de lista com espaço de sobra. Cobre: `AlertDialog`/`ConfirmDialog`
        (usados em TODO alerta/confirmação do app — maior alcance de
        todos), Login/Cadastro, `profile.tsx` (9 estilos, tela inteira
        sem nenhuma cobertura antes), `ErrorBoundary`, `WebTopNav`,
        `medication/[id].tsx` (formulário de horário, pausar, excluir,
        chips de preset), `stock.tsx` (editar), `medications.tsx`
        (ordenar), `history.tsx` (filtro/picker), Home (perfil, Tomei,
        modal de horário customizado).
      - **`hitSlop`, não crescer** onde o elemento é ícone sozinho numa
        fileira apertada, ao lado de outro alvo — achado do próprio
        Rilson revisando o trabalho ao vivo: a primeira versão cresceu
        o botão "Pular" (só um X) pra 48x48 quadrado, inflando a fileira
        inteira ao lado de "Tomei"/"Foi em outro horário". Corrigido pra
        `hitSlop` (preserva o visual compacto): "Pular" e "Reagir"
        (Home), swatches de cor (Perfil e Remédio, 30-32px). **Achado
        próprio ao revisar hitSlop de perto**: dois ícones vizinhos
        (editar/excluir horário, lado a lado) com hitSlop generoso
        DEMAIS faz as áreas de toque se sobreporem — risco real de
        excluir um horário tentando editar. Corrigido aumentando o vão
        real entre os dois ícones (`marginLeft` de 4 pra 14) antes de
        aplicar hitSlop de 10px nos dois, com a matemática comentada no
        código pra não se perder de novo.
      - **Exceções conscientes, documentadas, não "esquecidas"**: os 7
        círculos de dia da semana (dom-sáb) não cabem em 48px cada numa
        fileira só, nem com a tela cheia de largura — forçar quebraria o
        layout; mantido 38px (mesmo padrão de seletores de dia de
        calendário em geral). Links de privacidade/termos inline num
        parágrafo (WCAG 2.5.8 exime explicitamente alvo "inline", e nem
        `Text` nem `Link` do expo-router aceitam `hitSlop`).
      - Testes: `touch-targets.test.tsx` ampliado (79 asserções, cobrindo
        os padrões de maior alcance) + 1 teste novo em
        `medication-schedule-edit.test.tsx` que confirma matematicamente
        que os hitSlops de editar/excluir não se sobrepõem.
      - Verificação: `npm test` 2x estável, 45/45 suítes, 323/323 testes.
        Typecheck limpo.

Dependências (não é v1.3, é saúde do projeto pro build real que vem a
seguir — ver commit `chore(deps)`): expo-font/expo-linking como
dependência direta, expo-print/expo-sharing/expo-local-authentication
realinhados ao SDK 56, `npm audit fix` (sem `--force`) até convergir
(20→18 vulnerabilidades — as 18 restantes são ferramental de build sem
exposição em runtime, ou exigiriam downgrade destrutivo pra "corrigir").
Hermes V1 (regressão de memória, não segurança) fica pra uma sessão
dedicada de upgrade do SDK 56→57.

---

## Backlog de Produto — Sessão de uso real (2026-09-02, Rilson testando ao vivo)

> Levantamento do Rilson usando o app de verdade (web, 16h–18h). Item por
> item aqui registrado com o máximo de detalhe possível pra ser atacado
> depois com paciência e consciência. Nenhum implementado ainda — é só
> registro fiel do que foi observado e pedido, na ordem que surgiu.

### 1. Adicionar remédio no **estoque** sem precisar de horário — ✅ resolvido 2026-09-07

> Achado real do Rilson revendo a tela: já era possível **remover**
> todos os horários de um remédio já existente (fica só no estoque, sem
> lembrete) — só faltava a mesma liberdade no **cadastro**. Bloquear ali
> não impedia nada de verdade, só empurrava a mesma ação pra depois de
> criar. Removida a validação (`errorNoSchedule` — chave apagada, órfã)
> que impedia salvar com `draftSchedules.length === 0`; o laço que cria
> schedules já lida com lista vazia sozinho (simplesmente não itera).
>
> **Sem reintroduzir o problema original** (remédio "invisível" e
> confuso): o aviso `noSchedules` — reescrito nos 3 idiomas — agora deixa
> explícito que é uma **escolha reconhecida**, não um erro: "Sem
> horário — esse remédio só aparece no seu estoque, sem gerar lembrete.
> Adicione um horário quando quiser começar a receber avisos." Mesmo
> aviso nos dois lugares (cadastro com lista zerada e remédio existente
> sem horário), pra não ter duas linguagens diferentes pro mesmo estado.
> O toast final também diferencia esse caso (`createdStockOnlyToast`:
> "{{name}} cadastrado ✓ — sem horário, só no estoque.") em vez do toast
> genérico de criação — reforça que foi intencional.
>
> 2 testes novos/reescritos (cadastro com todos os horários removidos
> salva normalmente e não chama `createSchedule`; "+Adicionar" continua
> disponível depois — não é beco sem saída). 255/255 testes, typecheck
> limpo.

### 2. Botão "+" (adicionar) nas duas abas — home **e** remédios

- [ ] **Problema observado**: hoje é preciso ir até a aba de Remédios pra
      adicionar um remédio. O Rilson pede o botão "+" também na home,
      porque adicionar é demais uma ação constante — e o caminho até a
      aba certa não é óbvio pra todo mundo.
- **O que considerar**: o "+" na home pode abrir o mesmo fluxo de
  cadastro (remédio novo), ou um mini-menu (novo remédio / adicionar no
  estoque — em linha com o item 1). Decidir na implementação.
- **Critério de aceite**: consigo iniciar o cadastro de um remédio a
  partir da home e a partir da aba de Remédios, sem ter que mudar de aba
  primeiro.

### 3. Perfil ativo não é estável ao fechar/reabrir o app — ✅ resolvido 2026-09-05

> `store/profileStore.ts` ganhou `persist` (só o id, perfil completo
> sempre vem fresco da API). Causa raiz confirmada: sem nada salvo,
> `setProfiles` caía sempre no primeiro perfil da lista. Corrigido nos
> dois sentidos da corrida API-vs-AsyncStorage — achado real ao
> escrever o teste de regressão (`__tests__/profile-store.test.ts`):
> a primeira versão do fix só corrigia quando a reidratação terminava
> primeiro, não quando a API respondia primeiro.

- [x] **Problema observado**: estou logado/perfil **Rilson**, mas quando
      fecho e reabro o app ele vai direto pro perfil **Demonstração**
      (demo). O "perfil ativo" não está sendo lido/restaurado de forma
      confiável na inicialização — ou é escolhido por padrão o de
      demonstração quando o estado não persiste.
- **Investigar** (hipóteses, não confirmado): persistência do perfil
  ativo não sobrevive ao restart (estado em memória / não salvo em
  storage); ordem de hidratação na inicialização escolhe o primeiro perfil
  da lista (que pode ser o de demonstração); conflito de conta (ver
  "Fragmentação de contas" na seção Web). Considere salvar o id do perfil
  ativo de forma explícita e restaurá-lo na abertura, com fallback honesto.
- **Critério de aceite**: o perfil selecionado permanece o mesmo ao fechar
  e reabrir o app (ou, se o demo for intencional, fica claro e não é
  surpresa).

### 4. Demo/apresentação não ensina como usar o app

- [ ] **Problema observado**: a demonstração (onboarding/apresentação)
      não explica o funcionamento: para que serve o **ícone do olho**, como
      **adicionar remédios**, como **controlar estoque**, etc. O público usa
      sem orientação.
- **O que entra na demo**: um mini-guia de uso — o que cada controle
  faz (olho = mostrar/ocultar algo, provavelmente senha/dados sensíveis),
  passo a passo de "adicionar remédio", de "controlar estoque", de "marcar
  que tomei". Pode ser um tour/onboarding novo ou um item "Como usar"
  acessível a qualquer momento.
- **Critério de aceite**: alguém que nunca viu o app consegue entender, só
  pela demo/ajuda, para que serve o olho e como executar as 3 ações
  principais (adicionar remédio, controlar estoque, registrar dose).

### 5. Cadastro de remédio sem opção de tirar **foto** — ✅ resolvido 2026-09-07

> Corrigido com o mesmo padrão já usado pro estoque inicial: o círculo
> de foto agora renderiza também com `isNew`; escolher foto no cadastro
> guarda o URI localmente (`localPhotoUri`, sem chamada de rede — ainda
> não existe `id`) com uma dica visível ("Foto será salva junto com o
> remédio."); ao salvar, `saveMedication` sobe a foto guardada como uma
> chamada extra logo depois de `createMedication` retornar o `id`. Se
> essa chamada falhar, o cadastro **não é bloqueado** — o remédio já foi
> criado com sucesso, só o toast final avisa que a foto especificamente
> não subiu e sugere editar depois (`createdPhotoFailedToast`). 5 testes
> novos em `medication-schedule-edit.test.tsx` (placeholder também no
> cadastro, escolha local sem upload prematuro, upload após criar,
> cadastro sem foto não regressa, falha de upload não desfaz o
> cadastro). i18n pt/en/es. 251/251 testes, typecheck limpo.

> Reanalisado a pedido do Rilson (2026-09-07). **Causa raiz confirmada**
> em `app/medication/[id].tsx:798`: o bloco inteiro da foto está atrás de
> `{!isNew && (...)}`. Não é feature faltando — é feature que existe e
> funciona bem na edição (`pickPhoto`, `uploadMedicationPhoto`,
> `photoErrorMessage`, action sheet câmera/galeria/remover) mas fica
> inacessível no momento em que a pessoa está com a caixa do remédio ou a
> bula na mão, que é exatamente quando ela quer fotografar. A trava é
> técnica, não de produto: `uploadMedicationPhoto(id, uri)` precisa de um
> `id` que só existe depois do POST de criação.
> Precedente já resolvido no próprio arquivo pro mesmo tipo de problema:
> **estoque inicial** (`initialStock`, linha ~867) também não pode ir no
> POST de criação do remédio — é salvo com uma segunda chamada
> (`updateStock`) logo depois que o `id` existe (linha ~293-296). O mesmo
> padrão resolve foto: guardar o URI local escolhido durante o cadastro e
> disparar o upload assim que `createMedication` retornar o `id`.

- [ ] **Problema observado**: ao adicionar um medicamento, não aparece a
      opção de **tirar foto** — só depois de já ter criado e reaberto pra
      editar. Se a pessoa está com a caixa/bula na mão no momento do
      cadastro, tem que lembrar de voltar depois.
- **Correção proposta**: mostrar o círculo de foto também com `isNew`,
  usando `ImagePicker` pra guardar o URI localmente (sem upload ainda,
  não existe `id`); no sucesso de `createMedication`, subir a foto
  guardada como uma chamada extra (mesmo padrão do estoque inicial). Se
  o upload falhar depois do remédio já criado, avisar sem bloquear —
  remédio existe, foto fica pendente (mesma filosofia de erro tolerante
  já usada em `photoErrorMessage`).
- **Critério de aceite**: no cadastro (`isNew`) há a mesma opção de
  câmera/galeria que já existe na edição; se a pessoa tirar a foto antes
  de salvar, ela aparece anexada ao remédio recém-criado sem precisar
  reabrir a tela.

### 6. Botão de editar sem "X" de fechar — UI confusa — ✅ resolvido 2026-09-05

> `components/ModalCloseButton.tsx` substitui o `headerLeft` padrão nas
> 3 telas modais (medicamento, pro, ajuda) por um X grande e
> inequívoco — o chevron de voltar automático do Stack não bastou
> como affordance de saída no teste real. Formulário de horário
> (dentro do medicamento) já tinha "Cancelar" em texto, deixado como
> está.

- [x] **Problema observado**: o botão de editar não tem um "X" (fechar).
      A UI fica confusa — quem abre achando que vai sair não encontra como.
      (Provável: um drawer/modal de edição sem affordance clara de
      fechamento, ou um card que parece clicável mas não fecha.)
- **O que melhorar**: garantir affordance clara de fechar em qualquer
  superfície de edição (X no canto, backdrop dismiss, gesto de swipe).
  Auditar as outras telas de edição do app com o mesmo critério.
- **Critério de aceite**: toda tela/drawer de edição tem um caminho visível
  e previsível de fechar/cancelar, sem que o usuário fique preso.

### 7. Salvar sem **feedback visual** (toast) — ✅ resolvido 2026-09-05

> `store/toastStore.ts` + `components/Toast.tsx`, global (sobrevive a
> `router.back()`, montado uma vez em `_layout.tsx`). Estendido pro app
> inteiro: cadastro/edição de remédio, pausar/reativar, foto, horário,
> estoque, criar perfil — não só o pedido original. Confirmação em dois
> canais (visual + hático), com cuidado pra não duplicar o hático que a
> dose (Hoje) já tinha de propósito só na confirmação real do servidor.

- [x] **Problema observado**: ao clicar em salvar, não há comprovação
      visual do que aconteceu — nada confirma "salvo com sucesso".
      Importante demais porque o público são **usuários idosos que
      desconfiam da tecnologia**: sem confirmação, acham que quebrou ou
      que não salvou.
- **O que implementar**: toast/snackbar de confirmação "Remédio salvo ✓"
  (e para erro, mensagem clara). Considerar também feedback nos dois
  temas (claro/escuro), com tempo de leitura confortável (não sumir
  rápido demais p/ leitura de idoso).
- **Critério de aceite**: toda ação destrutiva/importante de salvar tem
  confirmação visual explícita; erros são comunicados com linguagem clara,
  sem "aconteceu nada".

### 8. Registrar dose em **horário diferente** do agendado + recálculo da próxima — ✅ resolvido 2026-09-08

> Retomado pelo Rilson em 2026-09-07, na mesma sessão do item 10 (modo
> fixo/intervalo).
>
> **Achado técnico ao planejar**: o backend **já aceita** `taken_at`
> customizado no registro de dose (`DoseLogController::store`, campo
> `nullable|date` já validado) — só a UI mobile nunca expõe isso, sempre
> manda `new Date().toISOString()` (agora), ver `app/(tabs)/index.tsx`.
> Diferente dos itens 5/10, porém, **o recálculo em si não existe** —
> `GenerateScheduleOccurrences` sempre usa a âncora fixa do horário, dia
> a dia, sem olhar pra quando a dose anterior foi realmente tomada. Essa
> parte é gap de verdade, não feature escondida.
>
> **Decisões confirmadas com o Rilson (2026-09-07)**:
> 1. Recalcular a próxima dose **só se aplica a remédio em modo "A cada
>    X horas"** — horário fixo não tem o que recalcular, só registra que
>    foi tomado atrasado/adiantado (ex.: tomou o das 8h às 10h → próximo
>    continua 14h, sem mudança).
> 2. Marcar "tomei" continua **1 toque = agora** por padrão, sem
>    mudança nenhuma no caso comum; uma ação secundária ("Foi em outro
>    horário") abre o seletor só quando precisa — não vira uma pergunta
>    obrigatória toda vez.
> 3. **Limiar de oferta de recálculo: 30 minutos** de diferença entre o
>    horário previsto e o `taken_at` real — abaixo disso, registra
>    normal sem perguntar nada (irrelevante pro dia).
> 4. **Escopo do recálculo: só as ocorrências restantes do dia atual**
>    (não mexe em dias futuros) — decisão de baixo risco, alinhada com a
>    própria arquitetura de `GenerateScheduleOccurrences`, que já gera
>    ocorrência de intervalo por dia isolado (ver comentário no arquivo).

- [ ] **Problema observado**: se eu tomei um remédio num horário diferente
      do programado, como cadastro isso? Ex.: tomaria às 08h, mas tomei às
      10h. Não há como registrar "tomei agora fora do horário" nem uma
      opção de **recalcular a próxima dose com base no novo horário**.
- **O que o usuário precisa**: (a) marcar "tomei" em qualquer momento
  (não só no horário exato), e (b) pra remédio em modo intervalo, decidir
  se as próximas doses do dia devem ser recalculadas a partir do novo
  horário real (ex.: a cada 8h a partir das 10h = próxima às 18h) ou se
  mantém o ciclo original.
- **Critério de aceite**: consigo registrar uma dose fora do horário
  previsto sem fricção extra no caso comum; em modo intervalo, com 30min+
  de diferença, o app oferece ajustar as próximas doses do dia ao novo
  horário real quando a
  diferença for relevante.

> **Implementado — backend**: `dose_schedules` ganhou
> `today_override_date`/`today_override_time` (migration nova) — um par
> (data, hora) em vez de só "hora" pra o override se autoexpirar
> sozinho à meia-noite (dia seguinte, a data salva não bate mais com
> "hoje" e `GenerateScheduleOccurrences` volta a usar a âncora
> permanente `time`, sem job de limpeza nenhum). Endpoint novo `POST
> /schedules/{id}/recalculate-today` (`DoseScheduleController::
> recalculateToday`) valida modo intervalo (422 se for fixo), grava o
> override e devolve as ocorrências de hoje já recalculadas (poupa um
> round-trip). 8 testes novos (6 feature + 2 unit em
> `GenerateScheduleOccurrencesTest`).
>
> **Implementado — mobile**: "Tomei" continua 1 toque; um botão
> secundário pequeno (ícone de relógio, ao lado, não escondido atrás de
> toque longo) abre um modal "Que horas você tomou X?" com um campo de
> texto HH:MM — mesmo padrão já usado no formulário de horário do
> remédio, **sem** introduzir um seletor nativo novo (menor risco,
> mais consistente com o resto do app). Depois de registrar, se o
> remédio for modo intervalo e a diferença for ≥30min, oferece
> "Ajustar" via `AlertDialog` com ação (item 14) — confirmando, chama
> `recalculateScheduleToday` e a tela Hoje já reflete os novos horários.
> 7 testes novos em `home.test.tsx`.
>
> ⚠️ **Limitação original (2026-09-08 de manhã)**: o recálculo corrigia
> o que a tela Hoje mostra, mas não resincronizava os lembretes locais.
>
> **Revisitado e melhorado no mesmo dia**, a pedido do Rilson: `expo-notifications`
> continua sem conceito nativo de "só hoje" no gatilho `DAILY`
> recorrente (cancelar o de hoje cancelaria o de amanhã também — isso
> não mudou, é limitação real da plataforma, não preguiça). Em vez de
> mexer no recorrente, `rescheduleTodayOccurrences` (`services/notifications.ts`,
> novo) ADICIONA lembretes avulsos (gatilho `DATE`, dispara uma vez só)
> exatamente nos `today_occurrences` que `recalculateScheduleToday` já
> devolve — sem round-trip extra. Chamado de `offerRecalculateToday`
> logo depois do recálculo confirmar, best-effort (falha ao agendar
> notificação não desfaz o recálculo nem mostra erro pra pessoa, já que
> a tela — fonte de verdade real — já está correta pelo `invalidateQueries`).
> **Trade-off ainda existente, agora menor e documentado com precisão**:
> o lembrete recorrente antigo continua existindo e pode disparar hoje
> no horário velho também (um aviso a mais, não a menos) — melhor que o
> estado anterior (ficar sem NENHUM aviso no horário novo). Cancela
> avulsos de uma recalculada anterior antes de agendar os novos, pra não
> acumular duplicata se a pessoa recalcular duas vezes no mesmo dia. 3
> testes novos em `notifications.test.ts` (agenda por ocorrência futura,
> ignora ocorrência já passada, cancela avulsos antigos sem tocar no
> recorrente normal), 1 asserção nova em `home.test.tsx`.
>
> 291/291 testes mobile, 250/250 backend, typecheck limpo (na época).
> Suíte completa mais recente ao final desta sessão: ver seções abaixo.

## Revisão de código + incidente do Sentry, antes do build de hoje (2026-09-08)

Depois de fechar os 7 itens de hoje, o Rilson pediu revisão completa
antes de gerar o APK. Dois achados sérios, corrigidos na hora — nenhum
dos dois ficou pra depois.

### 🛑 Sentry de produção recebendo erro de teste local

Achado ao vivo: testar o app localmente (Expo web, backend local)
disparou um alerta REAL no Sentry de produção (`meus-remedios-mobile`),
notificando gente de verdade — `Sentry.init` só olhava se existe DSN
configurado, nunca se é um build de desenvolvimento. Isso **já
acontecia sempre** que alguém rodava `expo start`/`expo start --web`
localmente pra debugar, não só neste teste específico.

- [x] **Corrigido**: `lib/sentryInit.ts` (função pura `shouldEnableSentry`,
  testável sem montar `_layout.tsx` inteiro) — `enabled` agora exige
  `!__DEV__` além do DSN. `__DEV__` é `true` só via Metro (`expo
  start`); falso em qualquer bundle de release real, inclusive o
  profile `preview` do EAS — builds reais continuam reportando normal,
  só o dia a dia de desenvolvimento local para de poluir o Sentry.
  4 testes novos (`sentryInit.test.ts`).
- **Ação pendente pro Rilson**: marcar como resolvido/ignorar o issue
  `AxiosError 401` (ambiente "production", 2026-09-08 ~04:09 UTC) no
  Sentry — é ruído do teste local de hoje, não um bug de usuário real.

### 🛑 `/code-review high` no repo certo — achados reais corrigidos

- [x] **Bug grave**: recalcular "hoje" depois de uma dose atrasada
  gerava uma dose "perdida" fantasma no MESMO horário que a pessoa
  acabou de registrar como tomada — a ocorrência recalculada batia em
  cima da própria âncora do recálculo, órfã do `DoseLog` real (que
  continua com o `scheduled_at` original). `GenerateScheduleOccurrences`
  agora pula a própria âncora quando vem de um override, listando só a
  partir do intervalo seguinte. Regressão coberta ponta a ponta
  (`DoseLogTodayTest`: cria a dose atrasada, recalcula, confirma que
  `doses/today` não gera nada às 10h nem duplica log).
- [x] **Robustez**: trocar de modo fixo/intervalo (item 10) num remédio
  com horário real cadastrado apaga via `Promise.all` — se uma chamada
  falhar no meio, o que já foi apagado no backend ficava fora de sincronia
  com a tela até recarregar. Agora resincroniza com `getMedication`
  fresco no `catch`, best-effort.
- [x] **Segurança/correção**: `reportHtml.ts` interpolava nome de
  remédio/perfil sem escapar — texto livre que a pessoa digita (um "&"
  ou "<" sem querer) quebrava a formatação do PDF. `escapeHtml()` novo,
  aplicado em todo texto de fora (não só o campo novo que a revisão
  apontou — os já existentes tinham o mesmo risco).
- [x] **Correção de borda**: registrar uma dose "de antes da meia-noite"
  depois dela virava 24h+ no futuro — o horário digitado era montado em
  cima de "hoje", não do dia do `scheduled_at`. Corrigido em
  `confirmCustomTime` (`app/(tabs)/index.tsx`).
- [x] **Eficiência**: `recalculateToday` chamava `$doseSchedule->fresh()`
  duas vezes à toa — uma consulta a menos por request agora.
- [x] **Limpeza (a pedido do Rilson, feita na hora)**: validação de
  quantidade de estoque e a checagem "nunca informado" estavam
  duplicadas entre `stock.tsx` e a tela do remédio (item 13) — extraídas
  pra `lib/stockQuantity.ts`, com teste próprio.
- [x] **Fuso horário do cuidador remoto — ✅ resolvido 2026-09-08** (a
  pedido do Rilson, revisitando o item abaixo). `recalculateScheduleToday`
  montava o horário no fuso do APARELHO de quem tocava o botão
  (`format(anchor, 'HH:mm')`, sem conversão), mas o backend ancorava
  "hoje" no fuso do PERFIL — sem lib nova de fuso (`date-fns-tz` não foi
  preciso): o app já tinha um `Date` de verdade (`anchor`, instante
  absoluto) e só precisava parar de formatar ele localmente antes de
  mandar. Agora manda `anchor.toISOString()` (instante absoluto, sem
  ambiguidade de fuso nenhuma); o backend (`DoseScheduleController::recalculateToday`)
  converte pro fuso do PERFIL com `Carbon::parse(...)->setTimezone($profile->timezone)`
  antes de gravar `today_override_time`. O texto mostrado na tela
  continua no fuso do APARELHO de propósito (quem está lendo a mensagem
  está olhando o próprio aparelho — mostrar a hora dele ali é o certo,
  só o dado que vai pro servidor precisava ser TZ-safe). 1 teste novo no
  backend (`DoseScheduleTest.php`: perfil em `America/Sao_Paulo`, âncora
  em UTC, confere que grava a hora certa convertida), teste mobile
  atualizado pro novo formato (ISO em vez de "H:i").

**304/304 testes mobile, 252/252 backend, typecheck limpo** — confirmado
2x seguidas pra descartar flakiness antes do build.

### 10. "A cada X horas" existe mas está escondido — reestruturar Horários pra modo-primeiro — ✅ resolvido 2026-09-07

> Achado a pedido do Rilson, revendo a tela de cadastro. **Não é feature
> faltando** — o intervalo (`scheduleMode: 'fixed' | 'interval'`, chips
> 4h/6h/8h/12h/24h) foi implementado em 14/08 e funciona
> (`renderFrequencyFields()` em `app/medication/[id].tsx:652`). O
> problema é onde ele mora: só aparece dentro do sub-formulário de **um
> horário individual**, que só abre depois de tocar "+ Adicionar" ou no
> lápis de um horário existente — terceiro nível de profundidade. A
> primeira tela que a pessoa vê (chips "Quantas vezes por dia?" 1x-4x +
> lista de horários) não dá nenhuma pista de que existe outro modo.
> Resultado real: o Rilson (que sabe que a feature existe, já decidiu
> ela em 14/08) foi checar achando que não tinha sido feita.
>
> **Direção do Rilson (2026-09-07)**: a escolha "horário fixo" vs. "a
> cada X horas" deveria vir **primeiro**, antes de qualquer outra coisa
> na seção Horários — não enterrada num formulário de terceiro nível.
>
> **Decisão de escopo confirmada com o Rilson**: um remédio inteiro usa
> **um modo só** (não mistura fixo e intervalo no mesmo remédio) — mais
> simples de entender do que o código antigo, que tecnicamente permitia
> misturar por ser uma escolha por horário individual.
>
> **Implementado**: `scheduleKind` ('fixed' | 'interval') substitui o
> antigo `scheduleMode` por-horário. Dois cards grandes (não chips
> pequenos) no topo da seção Horários — "Horário fixo" (ex.: 8h, 14h,
> 20h) e "A cada X horas" (ex.: de 8 em 8 horas) — decidem o modo do
> remédio inteiro, tanto no cadastro quanto na edição. O toggle antigo
> que morava dentro do formulário de um horário individual foi removido
> — `renderFrequencyFields()` agora só mostra os campos do modo já
> escolhido lá em cima. "+Adicionar" some em modo intervalo assim que já
> existe um horário (um intervalo já cobre o dia inteiro sozinho, um
> segundo não faz sentido).
>
> **Cadastro** (`isNew`): nada foi salvo ainda, trocar de modo é de
> graça — só reinicia o rascunho local com um padrão sensato do modo
> novo (`applyDraftScheduleKindChange`).
>
> **Remédio já existente**: com horário real cadastrado, trocar de modo
> é **destrutivo** (apaga os horários atuais no backend, cancela
> notificações, cria um horário-padrão no modo novo usando o horário
> antigo como âncora) — por isso passa por `ConfirmDialog` antes
> (`requestScheduleKindChange`/`confirmScheduleKindChange`). Sem horário
> nenhum cadastrado, não há nada a perder: troca direto, sem perguntar.
> Modo inicial de um remédio existente é inferido dos horários reais ao
> carregar (`interval_hours` setado em algum → abre em "intervalo").
>
> 8 testes novos/reescritos em `medication-schedule-edit.test.tsx`
> (troca sem confirmação sem horário, troca com confirmação/cancelar/
> confirmar com horário existente, rascunho padrão pronto ao trocar no
> cadastro). i18n pt/en/es (`scheduleKindQuestion`,
> `frequencyFixedExample`, `frequencyIntervalExample`,
> `scheduleKindChangeConfirmTitle/Message`, `scheduleKindChangedToast`).
> 254/254 testes, typecheck limpo.

- [ ] **Problema observado**: a tela de Horários abre direto em modo
      "horário fixo" (chips 1x-4x/dia) sem mencionar que existe um modo
      "a cada X horas". Quem precisa desse modo só descobre entrando no
      formulário de horário individual.
- **Critério de aceite**: a primeira decisão visível na seção Horários é
  "horário fixo" ou "a cada X horas" — não uma decisão enterrada dentro
  de outro fluxo. Layout final e alcance (por remédio inteiro vs. por
  horário individual) a decidir no planejamento.

### 9. Estoque: editar hoje só **reescreve** tudo — faltam "adicionar" e "definir" — ✅ resolvido 2026-09-05

> Dois botões lado a lado ("Adicionar"/"Definir"), campo único —
> semântica decidida pelo botão escolhido, não pelo texto digitado.
> De quebra: botão "Editar" some enquanto o form está aberto (não
> fazia sentido os dois ao mesmo tempo), mutação ganhou `onError`
> (faltava — falha ficava muda) e dia com estoque zerado nunca tocado
> mostra dica própria ("Estoque não informado") em vez de "0 unid" liso.

- [x] **Problema observado**: no Estoque, o botão "editar" só permite
      **reescrever** a quantidade (definir do zero). Mas a compra normal é
      **adicionar** ao que já se tem (comprei 30, entro +30 sobre o que já
      havia). O Rilson pede as **duas opções**.
- **O que implementar**: no card/estoque de um remédio, oferecer as duas
  ações: **"Adicionar"** (somar à quantidade atual — o caso de uso
  frequente de compra) e **"Definir"** (setar o valor exato — correção/
  contagem física). Evitar ambiguidade: dois botões claros, não um menú
  escondido.
- **Critério de aceite**: consigo tanto somar unidades ao estoque quanto
  definir um valor exato, de forma óbvia, e o feedback visual (item 7)
  confirma a operação.

### 11. Listas sem ordenação/filtro (Remédios e outras telas) — ✅ resolvido 2026-09-07

> **Achado ao planejar**: hoje nenhuma tela ordena nada — vem cru na
> ordem do backend (id/criação). `days_remaining` (dias até o estoque
> acabar) **já vem pronto** em cada medicamento (`Medication.php`,
> `$appends`) — "estoque acabando primeiro" é barato, só client-side.
> "Próxima dose" é mais caro: pra horário fixo dá pra calcular no
> cliente a partir dos `schedules`; pra intervalo, o horário real
> depende de quando a última dose foi tomada de verdade — hoje essa
> informação só existe na tela Hoje, não em cada medicamento.
>
> **Decisões confirmadas com o Rilson (2026-09-07)**:
> 1. **Escopo v1**: Alfabética + Estoque acabando primeiro (as duas
>    baratas). "Próxima dose" fica pra depois — precisa de mudança de
>    backend ou trazer dado que hoje só existe na tela Hoje.
> 2. **UI**: chips no topo da lista (mesmo padrão já usado no app pra
>    presets de dias/intervalo) — não menu/dropdown escondido.
> 3. **Tela: só Remédios por enquanto** — onde a queixa surgiu; Estoque
>    ganha os mesmos chips depois, se fizer falta de verdade (não
>    replicar preventivamente).
> 4. **Persistência (decidido sem perguntar, baixo risco)**: a
>    ordenação escolhida **persiste** entre sessões (AsyncStorage, só
>    local — mesmo padrão já usado em `profileStore`/font-scale). Reset
>    silencioso a cada abertura confundiria mais um público idoso do que
>    lembrar a última escolha ("por que mudou a ordem sozinho?").

- [ ] **Problema observado**: a lista de Remédios não tem como reordenar
      os itens. O Rilson quer poder ver por **ordem alfabética** ou
      **estoque mais perto de acabar** (v1 — "próxima dose" fica pra
      depois, ver achados acima).
- **Critério de aceite**: na tela de Remédios, chips no topo alternam
  entre "Alfabética" e "Estoque acabando primeiro"; a escolha continua a
  mesma ao fechar e reabrir o app.

> **Implementado**: `store/medicationsSortStore.ts` (zustand +
> `persist`/AsyncStorage, mesmo padrão de `profileStore`) guarda a
> escolha entre 'alphabetical' e 'stock-low'. Chips no topo da tela de
> Remédios (escondidos quando a lista está vazia — não faz sentido
> ordenar nada). "Estoque acabando" ordena por `days_remaining`
> crescente, com `null` (sem estoque rastreado) sempre no fim — ausência
> de dado não é a mesma coisa que urgência. 4 testes novos em
> `medications-sort.test.tsx` (primeiro teste dessa tela — não tinha
> nenhuma cobertura antes). 274/274 testes, typecheck limpo.

### 12. Editar horário salva na hora, sem passar pelo botão "Salvar alterações" — ✅ resolvido 2026-09-07

- [ ] **Problema observado**: no formulário de um remédio já existente,
      mudar nome/dosagem/instruções só persiste ao tocar em "Salvar
      alterações" — mas adicionar/editar/remover um **horário** já
      salva direto no backend (`saveScheduleForm`/`confirmRemoveSchedule`
      chamam a API na hora), independente desse botão. O Rilson notou o
      comportamento e questionou se é uma inconsistência ou um risco.
- **Contexto técnico**: é intencional desde a Fase 2 (2026-08-12) — cada
  horário é uma entidade própria no backend (`DoseSchedule`), editada
  fora do fluxo de "rascunho local" que só existe durante o *cadastro*
  (`draftSchedules`, ver item 10). O horário salvo na hora já mostra
  toast próprio (`scheduleSavedToast`/`scheduleRemovedToast`) confirmando
  que aconteceu — não é silencioso. O que pode faltar é deixar esse
  modelo mental **explícito** pra quem usa (duas "zonas" de salvamento
  diferentes na mesma tela), não necessariamente unificar tudo num só
  botão.
- **Decisão confirmada com o Rilson (2026-09-07)**: reforçar
  visualmente que a seção Horários salva sozinha, em vez de unificar
  tudo num "Salvar alterações" só — mantém o modelo atual (cada horário
  é entidade própria, persiste na hora), sem tocar na lógica de
  backend/notificação já testada.
- **Formato decidido (baixo risco, sem perguntar)**: texto fixo e
  permanente logo abaixo do título "Horários" (não um toast que passa —
  já tem toast, o problema é a falta de algo que fique visível o tempo
  todo), tipo "Cada horário salva assim que você confirma — não precisa
  do botão Salvar lá embaixo." Reaproveita o estilo já existente de
  dica de campo (`fieldHint`), sem componente novo.
- **Critério de aceite**: quem olha a seção Horários entende, sem
  precisar tocar em nada, que ela salva sozinha — diferente do resto do
  formulário, que espera o "Salvar alterações".

> **Implementado**: texto fixo (`medicationForm.scheduleAutosaveHint`,
> pt/en/es) logo abaixo do título "Horários", só na edição (`!isNew` —
> no cadastro os horários continuam rascunho até o botão final, sem
> mudança). Estilo `fieldHint` já existente, nenhum componente novo. 2
> testes novos.

### 13. Estoque só é editável pela aba Estoque, não editando o remédio — ✅ resolvido 2026-09-07

- [ ] **Problema observado**: depois de cadastrado, dá pra ajustar a
      quantidade em estoque pela aba **Estoque** (Adicionar/Definir, item
      9), mas **não** pela tela de editar o próprio remédio — ela só tem
      "Estoque inicial" durante o *cadastro* (`initialStock`, some depois
      de criado). O Rilson quer as duas opções disponíveis sempre.
- **O que mudaria a experiência**: a tela de editar remédio ganha a
  mesma dupla Adicionar/Definir que a aba Estoque já tem (reaproveitar
  `updateStock`, sem endpoint novo) — editar em qualquer um dos dois
  lugares reflete no outro.
- **Critério de aceite**: consigo mudar a quantidade em estoque tanto
  pela aba Estoque quanto editando o remédio diretamente, com o mesmo
  resultado e o mesmo feedback visual (item 7).

> **Implementado**: mesmo par Adicionar/Definir de
> `app/(tabs)/stock.tsx` reaproveitado na tela do remédio (`updateStock`,
> mesmo endpoint) — inclusive reagenda o alerta de estoque baixo
> (`scheduleRefillAlert`) do mesmo jeito, buscando o `days_remaining`
> fresco depois de salvar (o retorno de `updateStock` é só o
> `StockItem`, sem esse campo calculado). Dica "Estoque não informado"
> pro caso nunca tocado também replicada. 6 testes novos.

### 14. Erro do limite de 15 medicamentos: mensagem pouco convidativa — ✅ resolvido 2026-09-07

> **Decisão confirmada com o Rilson (2026-09-07)**: escopo **só a
> mensagem**, agora — não avançar pra cobrança Pro real nesta rodada.
> Cobrança de verdade (RevenueCat quase pronto no código, falta
> produto/preço real na loja) é iniciativa maior demais pra entrar de
> carona aqui; fica registrada separadamente em "💰 RevenueCat — estado
> real e o que falta" mais abaixo no arquivo, sem prazo batido ainda.
>
> **Formato decidido (baixo risco, sem perguntar)**: `AlertDialog`
> ganha uma variante genérica e reaproveitável com ação secundária
> opcional (`actionLabel`/`onAction`, ao lado do `okLabel` existente) —
> não um componente de upsell dedicado só pra este caso. Reaproveitável
> de imediato pro mesmo limite de perfis (`ProfileController.php:34`,
> mesma mensagem genérica hoje) quando/se fizer sentido dar o mesmo
> tratamento lá.

- [ ] **Problema observado**: ao tentar cadastrar o 16º medicamento, o
      app mostra um `AlertDialog` com título **"Erro"** e a mensagem crua
      que vem do backend ("Limite de 15 medicamentos por perfil no plano
      gratuito. Faça upgrade para o Pro."), só com botão "OK" — sem
      nenhuma ação pra realmente fazer o upgrade. Dois problemas
      distintos que o Rilson apontou:
      1. **Tom errado**: "Erro" soa como algo quebrado, não como um
         limite esperado do plano gratuito — deveria soar como um
         convite, não uma falha.
      2. **Sem CTA**: `AlertDialog` (`components/AlertDialog.tsx`) só
         tem um botão (`okLabel`/`onDismiss`) — não existe variante com
         ação secundária (ex.: "Ver planos Pro"). A pessoa lê a
         mensagem, mas pra agir precisa sair e achar a tela Pro sozinha.
- **Contexto de negócio**: esse erro específico é provavelmente o
  primeiro **momento de conversão real** que os usuários encontram
  organicamente — vale tratar com cuidado, mesmo sendo só a UI por
  enquanto (cobrança real fica pra outra rodada, ver decisão acima).
- **Critério de aceite**: ao bater no limite, o diálogo tem um título
  convidativo (não "Erro"), explica o limite do plano gratuito, e tem um
  botão que leva direto pra tela de planos Pro já existente.

> **Implementado**: `AlertDialog`/`useAlertDialog` ganharam
> `actionLabel`/`onAction` opcionais (2º botão, reaproveitável em
> qualquer alerta — nenhuma tela existente precisou mudar). No
> `saveMedication`, detecção do erro específico (status 403 + mensagem
> contendo "Limite de 15 medicamentos") mostra título convidativo
> ("Você atingiu o limite do plano gratuito") + botão "Ver planos Pro"
> que navega pra `/pro`; qualquer outro erro continua no alerta genérico
> de sempre. 2 testes novos. 270/270 testes, typecheck limpo.

### 15. Não existe botão de excluir medicamento em lugar nenhum da UI — ✅ resolvido 2026-09-07

> Achado ao investigar: `deleteMedication()` (`services/medications.ts`)
> e a rota `DELETE /medications/{medication}` (backend,
> `MedicationController::destroy`) **já existem e funcionam** — só não
> tem nenhum botão, em nenhuma tela, que chame isso. Nem na edição do
> remédio, nem na lista (sem swipe-to-delete). Mesma família de achado
> dos itens 5/10 desta sessão: capacidade pronta no backend, sem
> caminho nenhum até ela na UI.
>
> **Atenção real pro aviso de confirmação**: `destroy()` faz **hard
> delete em cascata** (`cascadeOnDelete()` em `dose_schedules`,
> `dose_logs` e `stock_items` — ver migrations) — apagar um remédio
> apaga **todo o histórico de doses e adesão dele pra sempre**, sem
> soft-delete, sem desfazer. O aviso de confirmação precisa deixar isso
> muito claro, não só "tem certeza?" genérico — é o tipo de ação que já
> tem padrão pronto no app (`ConfirmDialog` com `destructive`, mesmo
> usado pra remover horário).

- [x] **Problema observado**: não há como excluir um medicamento
      cadastrado por engano ou que não faz mais sentido manter (trocou
      de remédio, parou o tratamento de vez) — só dá pra "Pausar", que
      mantém o remédio na lista. Fica mais grave ainda com o limite do
      item 14: sem excluir, quem bate no teto de 15 não tem como abrir
      espaço sem virar Pro.
- **O que implementar**: botão de excluir na tela de editar remédio
  (`app/medication/[id].tsx`, mesma área do "Pausar"), atrás de
  `ConfirmDialog` destrutivo explicando que histórico e adesão também
  somem, sem volta.
- **Critério de aceite**: consigo excluir um medicamento existente, com
  aviso claro do que se perde antes de confirmar, e o app volta pra
  lista de Remédios sem ele.

> **Implementado**: botão "Excluir medicamento" no fim da tela de
> edição (depois de "Salvar alterações", de propósito menos chamativo —
> ação permanente), atrás de `ConfirmDialog` destrutivo com o nome do
> remédio e o aviso de que histórico/adesão somem pra sempre. Cancela a
> notificação local de cada horário antes de excluir (o backend não sabe
> nada delas). Só disponível pro dono do perfil, mesmo gate do "Salvar".
> 5 testes novos (some no cadastro, some pro cuidador, confirmação sem
> apagar antes, cancelar não exclui, confirmar exclui + cancela
> notificações). 268/268 testes, typecheck limpo.

### 16. Relatório PDF: nome de arquivo só números + PDF não avisa (nem respeita) os filtros da tela — ✅ resolvido 2026-09-08

> O Rilson testou o botão de gerar PDF pela primeira vez (`Histórico` →
> "Relatório") e notou dois problemas.
>
> **Reconsiderado em 2026-09-08**: o item 1 (nome de arquivo) tinha
> ficado pendente pro "próximo build" por causa do risco de módulo
> nativo sem poder testar em dispositivo real (mesma categoria do
> incidente de 06/09). No mesmo dia o Rilson decidiu gerar um APK novo
> de verdade — build real disponível pra testar antes de confiar,
> diferente da vez anterior (OTA sem native de verdade por trás). Isso
> muda o cálculo de risco: implementado nesta sessão, não mais adiado.
>
> **Implementado — item 1 (nome de arquivo)**: `npx expo install
> expo-file-system` (agora dependência direta de verdade, não só
> transitiva via `expo-print`). `lib/reportPdf.ts` usa a API nova
> (`File`/`Paths.cache`, não a legada `FileSystem.*`) pra copiar o PDF
> gerado por `Print.printToFileAsync` pra um novo arquivo com nome
> legível (`assidua-relatorio-<medicamento-ou-todos>-<data>.pdf`) antes
> de `Sharing.shareAsync`. `require` tardio + rename inteiro dentro de
> um try/catch próprio (mesmo padrão de `pickPhoto`): se falhar por
> qualquer motivo, compartilha o arquivo original (nome feio, mas
> funciona) em vez de travar o botão inteiro. 3 testes novos em
> `reportPdf.test.ts` (rename com medicamento filtrado, sem filtro
> "todos-os-medicamentos", fallback gracioso quando o rename falha).
>
> **Implementado — item 2 (respeitar + confirmar filtro)**:
> `GenerateConsultationSummary::handle` ganhou `?int $medicationId`
> opcional (filtra os `schedules` por medicamento antes de somar
> due/taken/missed); `DoseLogController::consultationSummary` lê
> `?medication_id` da query string. `history.tsx`: `handlePrintReport`
> passa o `medicationFilter` ativo pra `getConsultationSummary`, e um
> `ConfirmDialog` novo (`requestPrintReport`) nomeia o recorte antes de
> gerar ("Vai gerar o relatório de Paracetamol, últimos 30 dias." ou
> "...de todos os medicamentos..." sem filtro). O próprio PDF também
> mostra "Filtrado por: {{medicamento}}" quando aplicável
> (`reportHtml.ts`, campo `medicationName` novo em `ReportData`).
> Filtro de **status** decidido de propósito fora do recorte (doses
> perdidas sempre aparecem, mesmo com a tela filtrando só "tomados") —
> não existe seletor de período na tela (só status/medicamento), então
> "período" ficou de fora da decisão original, sempre fixo em 30 dias.
> 2 testes novos no backend (`ConsultationSummaryTest.php`), 2 em
> `reportHtml.test.ts`, 5 em `history.test.tsx`.
>
> **Achado extra ao revisar antes do build**: `npx expo-doctor` apontou
> duplicata de `react-native-screens` (4.25.2 direto vs. 4.27.0 aninhado
> via `expo-router`) e 10 pacotes com patch/minor desalinhado do SDK
> 56 — mesma categoria de manutenção já feita em 05/09. Corrigido com
> `npx expo install --fix` + `npm dedupe` (sem `--force`, sem tocar em
> major version). Hermes V1 (regressão de memória, exige SDK 57) segue
> como decisão consciente de não mexer agora — mudança grande demais
> pra fazer às pressas antes de um build.
>
> 284/284 testes mobile, 244/244 backend, typecheck limpo.

- [x] **1) Nome do arquivo no celular é só números**: `lib/reportPdf.ts`
      chama `Print.printToFileAsync({ html })` sem nenhum `fileName` — o
      `expo-print` nativo gera um nome genérico/numérico pro arquivo
      temporário, e é esse nome cru que aparece quando a pessoa
      compartilha/salva o PDF. Web já está OK (o HTML tem `<title>
      Relatório de Adesão — Assídua</title>`, o navegador usa isso como
      sugestão de nome ao "Salvar como PDF") — o problema é só no
      celular.
  - **Fix real**: `expo-file-system` (já presente **transitivamente**
    via `expo-print`, mas não é dependência direta ainda) pra copiar o
    arquivo gerado pra um novo caminho com nome legível (ex.:
    `relatorio-assidua-losartana-2026-09-07.pdf`) antes de chamar
    `Sharing.shareAsync`.
  - ⚠️ **Mesmo cuidado do incidente de 2026-09-06** (`expo-image-manipulator`
    derrubou o app em produção por ser módulo nativo carregado sem
    build novo): `npx expo install expo-file-system` primeiro (vira
    dependência direta de verdade), `require` tardio dentro de
    try/catch (mesmo padrão de `pickPhoto`), e o recurso só ativa de
    verdade depois do **próximo build nativo** — até lá, degradar bem
    (nome feio, mas gera o PDF normalmente) é melhor que arriscar
    quebrar o botão inteiro.
- [x] **2) PDF não avisa (e nem usa) os filtros visíveis na tela**:
      achado ao ler `history.tsx` — `handlePrintReport` chama
      `getConsultationSummary(activeProfile.id, 30)` **fixo em 30 dias**
      e sempre com **todos os medicamentos** (`medications.map(...)`
      sem filtrar), completamente **independente** dos chips de
      status (tomado/pulado/perdido) e do filtro por medicamento que a
      pessoa vê e mexe na tela. O relatório é hoje um "resumo pra
      consulta médica" fixo, não um export do que está filtrado — mas
      nada na tela avisa isso, então dá pra achar (como o Rilson achou)
      que os filtros valem pro PDF também.
- **Decisão confirmada com o Rilson (2026-09-07)** — os dois juntos, não
  um ou outro:
  1. O PDF passa a **respeitar de verdade** o filtro de medicamento e
     (se existir) o período selecionado na tela de Histórico — deixa de
     ser sempre "visão geral fixa de 30 dias, todos os remédios".
     `handlePrintReport` precisa passar `medicationFilter`/período pra
     `getConsultationSummary` (ou equivalente) em vez do `30` fixo e do
     `medications.map(...)` sem filtro.
  2. **Antes de gerar**, um `ConfirmDialog` avisa exatamente qual
     recorte vai entrar no PDF (ex.: "Gerar relatório de Losartana,
     últimos 14 dias?" ou "Gerar relatório de todos os medicamentos,
     últimos 30 dias?" quando nada estiver filtrado) — não só aplica o
     filtro em silêncio, confirma explicitamente antes de agir.
- **Decidido (2026-09-07)**: filtro de **status** (tomado/pulado/
  perdido) **não** entra no recorte do PDF — só medicamento e período.
  Um resumo pra consulta médica deve sempre mostrar as doses perdidas,
  mesmo que a tela no momento esteja filtrando só "tomados"; esconder
  isso do médico seria contraproducente.
- **Critério de aceite**: tocar em "Relatório" abre uma confirmação
  nomeando o recorte atual (medicamento + período); confirmando, o PDF
  gerado reflete exatamente esse recorte. Nome do arquivo (item 1 acima)
  é independente dessa decisão.

---

### 17. Reajuste de horário do Ibuprofeno some o item da tela "Hoje" + horários errados no Histórico — 🔴 reportado 2026-09-09 21:46, não investigado ainda

> Reportado ao vivo pelo Rilson: pediu reajuste do horário de um
> agendamento de Ibuprofeno e, depois da mudança, o item **simplesmente
> sumiu da tela "Hoje"** (não aparece mais como dose pendente/agendada
> nenhuma). Junto com isso, os **horários registrados no Histórico**
> também aparecem errados.

- **Não investigado ainda** — não sei se são um bug só (reajuste de
  horário quebrando o cálculo de "próxima dose" usado tanto no "Hoje"
  quanto no Histórico) ou dois bugs distintos.
- **Suspeita a checar primeiro**: mesma família do bug crítico já
  resolvido em 2026-09-09 (ocorrência que atravessa a meia-noite nunca
  gerada, ver seção acima) — qualquer lógica de recálculo de horário
  agendado é ponto sensível recorrente neste app.
- Rilson avisou que vai reportar mais pendências reais de uso além
  desta — registrar cada uma como item novo aqui conforme chegarem.

> **Resolvido 2026-09-09.** Achado real: o gatilho foi "Outro horário" no
> Ibuprofeno + confirmar "recalcular o resto do dia". A investigação
> partiu de 2 sintomas e terminou achando 4 bugs interligados — pedido
> do Rilson foi "todas as situações previstas", então documentando o
> levantamento completo, não só o fix pontual.
>
> **Bug 1 — dose sumia do "Hoje"**: `GenerateScheduleOccurrences` pula de
> propósito a própria âncora do recálculo (evita criar "perdida" fantasma
> em cima da dose recém-tomada — decisão correta, do item 8). Mas
> `DoseLogController::today()` montava a lista SÓ a partir das ocorrências
> calculadas — nada reincluía o log que ficou de fora. A dose continuava
> certinha no banco (por isso o Histórico nunca sumiu com ela), só a tela
> "Hoje" parava de listar. Corrigido: `today()` agora busca também
> qualquer log de hoje daquele schedule que não bateu em nenhuma
> ocorrência computada, e devolve ele também (sempre já resolvido, nunca
> reabre ação). Achei até um teste antigo que **validava o bug como
> comportamento correto** — corrigido junto.
>
> **Bug 2 — Histórico mostrava o horário agendado, não o horário real
> tomado**: `history.tsx` sempre exibia `scheduled_at`, nunca `taken_at`.
> Quem registra "tomei às 10h" pra uma dose das 8h via "Outro horário"
> via a tela continuar dizendo "08:00" — sempre foi assim, pra QUALQUER
> dose, não só as via recálculo. Corrigido: mostra `taken_at` quando
> existe (dose tomada), senão `scheduled_at` (pendente/pulada/perdida).
>
> **Bug 3 — o problema de verdade, achado ao investigar "tá bem
> armazenado no banco?" a pedido do Rilson: fuso horário rotulado errado
> em TODA leitura de `DoseLog`.** `scheduled_at`/`taken_at` são gravados
> como hora LOCAL do perfil, sem informação de fuso — mas o cast
> `'datetime'` do Eloquent lê esse valor cru e rotula com
> `config('app.timezone')` (UTC), errado. Confirmado com teste
> diagnóstico: `history()` devolvia uma dose das 08:00 (perfil em
> `America/Recife`, UTC-3) como `"...T08:00:00Z"` — 3h adiantado do
> instante absoluto real (`"...T11:00:00Z"`), que é o que `today()`
> devolve pra essa MESMA dose. Ou seja: os dois endpoints discordavam
> entre si sobre a hora da mesma dose, sempre, pra qualquer perfil fora
> de UTC — a maioria dos usuários reais (Brasil inteiro). Afetava
> `today()` (log órfão do Bug 1), `history()`, a resposta de `store()`
> (POST /dose-logs) e o **export oficial de dados (LGPD, portabilidade)**
> em JSON. Corrigido: dois métodos novos no model
> (`DoseLog::scheduledAtInTimezone()`/`takenAtInTimezone()`) que leem o
> valor cru (`getRawOriginal`) e anexam o fuso REAL do perfil antes de
> virar instante absoluto — usados em todo lugar que serializa um
> `DoseLog`, no lugar do atributo cru do Eloquent.
>
> **Bug 4 — causa raiz do Bug 3 pra `taken_at` especificamente, gravação
> errada desde a origem**: `scheduled_at` já convertia pro fuso do perfil
> antes de gravar (desde 2026-09-08). `taken_at` nunca convertia —
> `DoseLogController::store()` recebia o instante absoluto do app
> (`toISOString()`) e deixava o cast automático do Eloquent gravar a
> LEITURA EM UTC como se já fosse hora local do perfil. Pra qualquer
> perfil fora de UTC, **todo `taken_at` já registrado desde sempre está
> gravado errado no banco** — não é só bug de exibição, é dado gravado
> deslocado pelo offset do perfil. Corrigido o `store()` pra converter
> `taken_at` com a mesma lógica que `scheduled_at` já usa.
>
> **Bônus achado na mesma auditoria**: o corte de "últimos N dias" do
> Histórico comparava `scheduled_at` (hora local do perfil) contra
> `now()` puro (UTC do servidor) — deslocava a borda da janela pelo
> offset do perfil. Corrigido pra `Carbon::now($profile->timezone)`.
>
> **Verificado como SEM bug** (auditoria completa, não só os pontos que
> quebraram): `GenerateConsultationSummary` (dados do PDF de consulta —
> monta Carbon com fuso certo do zero, nunca lê o atributo cru),
> `CalculateAdherenceStreak`/`CalculateDailyAdherence`/`CalculateWeeklyAdherence`
> (comparam limites de data com Carbons já ancorados no fuso do perfil
> dos dois lados), export CSV (`DataExportController::downloadCsv` — usa
> `strtotime`/`date()` puro do PHP, que por coincidência interpreta e
> formata no mesmo fuso do servidor nos dois lados, resultado correto
> ainda que frágil), `reacted_at` (mesmo problema de rótulo existe, mas
> nunca é exibido como texto formatado em lugar nenhum, só usado como
> booleano de "já reagiu" — sem bug observável, registrado aqui só pra
> não ser esquecido se um dia alguém quiser mostrar a hora da reação).
>
> **Pendência real que sobra — dado já gravado em produção**: a correção
> do Bug 4 impede dano NOVO, mas todo `taken_at` gravado ANTES dela (pro
> perfil real do Rilson, que não é UTC) já está errado no banco de
> produção. Criado `php artisan assidua:fix-taken-at-timezone` (dry-run
> por padrão, `--execute` aplica de verdade) — reinterpreta cada
> `taken_at` existente como a leitura em UTC que ele sempre foi, e
> regrava na convenção certa. **Não rodado em produção ainda — decisão
> do Rilson, com backup do banco antes.**
>
> **Testado**: 9 testes novos (`DoseLogTodayTest` ×2, `DoseLogHistoryTest`
> ×1, `DoseLogStoreTest` ×1, `DataExportTest` ×1, `FixTakenAtTimezoneTest`
> ×4), todos com perfil `America/Recife` pra expor o bug de verdade (perfil
> UTC mascarava tudo isso, já que os dois fusos coincidem). 265/265 testes
> do backend, 328/328 do mobile (não afetado pelas mudanças de backend
> desta rodada).
>
> **Incidente na aplicação em produção (2026-09-09, sem correção
> silenciosa — mesmo padrão da Bancada Evangélica):** rodei
> `assidua:fix-taken-at-timezone --execute` em produção (backup do banco
> feito antes, dry-run conferido, 18 registros corrigidos corretamente).
> Ao verificar a trava contra segunda execução (item novo desta sessão),
> escrevi manualmente um marcador de "já rodou" em `storage/app/` — **caminho
> errado**: Laravel 13 usa `storage/app/private/` como raiz do disco
> `local`, não `storage/app/`. A trava nunca viu o marcador, `--execute`
> rodou uma SEGUNDA vez de verdade, deslocando os mesmos 18 registros por
> mais -3h (dado ficou errado na direção oposta). Criado
> `assidua:restore-taken-at-double-fix-incident` — restauração cirúrgica
> com os 18 valores corretos hardcoded (capturados do log da primeira
> execução, sem reinterpretar nada). Dry-run conferido batendo com o
> estado real antes de executar; **o próprio Rilson rodou o `--execute`**
> depois do meu pedido de confirmação (duas ações de escrita em produção
> foram bloqueadas pelo classificador de permissão do Claude Code nessa
> sessão — corretamente, dado o histórico). Confirmado depois: dry-run
> mostra os 18 registros já corretos e estáveis. Marcador de "já rodou"
> rearmado no caminho certo (`storage/app/private/`) e confirmado
> bloqueando uma terceira execução (`exit code: 1`).
>
> **Lição registrada**: nunca mais mexer manualmente no filesystem de um
> container de produção assumindo caminho de framework sem conferir a
> config real primeiro (`config('filesystems.disks.local.root')`) — o
> comando em si (via `Storage::put`/`Storage::exists`) sempre esteve
> certo; o erro foi numa ação manual de verificação por fora dele.

## 🔴 Scheduler do Laravel morto em produção há 2+ semanas — ✅ resolvido 2026-09-09

> A pedido do Rilson ("não sei se as notificações do Assídua estão
> chegando na hora certa"), conferi a config real do cron em produção.
>
> **Achado**: o crontab do host VPS tem `* * * * * docker exec
> remedios-api php artisan schedule:run >> /dev/null 2>&1` — mas o
> container se chama `assidua-api` desde a renomeação do projeto
> (2026-08-22/23, ver seção "Renomeação pra Assídua" no topo deste
> arquivo). Rodando o comando exato do cron manualmente: `Error response
> from daemon: No such container: remedios-api`. Roda a cada minuto,
> falha, e `>> /dev/null 2>&1` engole o erro — silêncio total, sem
> alerta nenhum disparando (nem Uptime Kuma, que não monitora isto).
>
> **Impacto real, desde a renomeação (mais de 2 semanas)**: as 3 tarefas
> agendadas do backend **nunca rodaram**:
> - `CheckMissedDoses` — aviso ao cuidador quando uma dose é perdida
> - `SendWeeklyAdherenceSummaries` — resumo semanal de adesão
> - `NotifyTreatmentEndingCommand` — aviso de fim de tratamento
>
> **Não afetado**: lembretes locais no próprio celular (agendados
> direto no aparelho via `expo-notifications`, não dependem deste cron)
> continuaram funcionando normalmente o tempo todo.
>
> **Corrigido** (aprovado pelo Rilson antes de mexer em produção):
> `crontab -l | sed 's/remedios-api/assidua-api/' | crontab -` no VPS,
> backup do crontab anterior salvo em `/tmp/crontab_backup_*.txt`.
> Confirmado rodando: `docker exec assidua-api php artisan schedule:run
> -v` → `No scheduled commands are ready to run` (antes: erro de
> container inexistente).
>
> **Auditoria de resquícios da renomeação (a pedido do Rilson,
> "será que há problemas de mudança de nome semelhantes?")**: CI/CD
> (`.github/workflows/*.yml`) e rede Docker já 100% em `assidua-*`, sem
> nenhuma outra referência viva a `remedios-api`/`remedios-web`. Achado
> um resquício à parte: container `remedios-web` (projeto antigo,
> `~/hetzner-infra/meus-remedios/`) parado há 2 semanas, ainda carregava
> label do Traefik pra `meusremedios.narniano.com`. **Resolvido**: o
> Rilson removeu o container (`docker rm remedios-web`); conferido que
> `meusremedios.narniano.com` **não tem nem registro DNS** (`dig` vazio)
> — ninguém chega lá de nenhum jeito, então não há redirect a criar,
> risco encerrado.
>
> **Pendência de monitoramento identificada, não implementada**: não
> existe hoje nenhum alerta (Uptime Kuma ou outro) que avisaria se este
> cron voltar a falhar silenciosamente — foi só descoberto porque o
> Rilson perguntou. Vale considerar registrar isso como item de
> infraestrutura futuro (ex.: heartbeat/push do Uptime Kuma no próprio
> `schedule:run`, mesmo padrão já usado pros crons do `hetzner-infra`).

## 🟡 Design/padding na tela de cadastro/edição — Horários — ✅ resolvido 2026-09-09

> A pedido do Rilson, com screenshot real da tela de edição de
> medicamento. Achados concretos, nada implementado ainda:
>
> 1. **Horário mostrado como "10:00:00" em vez de "10:00"** — `s.time`
>    (lista de horários já cadastrados) exibe o valor cru do backend
>    (`HH:MM:SS`) sem cortar os segundos. A própria tela já faz
>    `s.time.slice(0, 5)` em `startEditSchedule` — só a exibição na
>    lista não usa o mesmo corte.
> 2. **`scheduleKindRow` (cards "Horário fixo"/"A cada X horas") tem
>    `marginBottom: 4`** — muito menor que qualquer outro espaçamento da
>    tela (o resto varia entre 14 e 24). É o aperto visual visível no
>    print, entre os cards e a lista de horários logo abaixo.
> 3. **Os 3 gaps finais da tela (lista de horários → Pausar → Salvar →
>    Excluir) são 18px, 24px e 20px** — valores diferentes acumulados em
>    edições de dias diferentes, sem uma escala de espaçamento
>    consistente.
>
> **Implementado, com aprovação do Rilson**: `scheduleKindRow.marginBottom`
> 4→20; `pauseBtn.marginTop` 10→16 e `deleteMedicationBtn.marginTop`
> 20→24 (os 3 gaps finais da tela agora são todos 24px); `s.time`
> cortado pra `HH:MM` na lista de horários já cadastrados. Testado
> (75/75 nos testes de edição/ordenação de medicamento, 328/328 na
> suíte mobile completa), commit `a5c1ec1`.
>
> **2ª rodada (2026-09-10, novo print do Rilson)**: o fix acima mexeu no
> espaço *depois* dos cards de modo — o Rilson apontou corretamente que
> faltava espaço *antes* do próprio título "Horários". Achado real:
> `sectionTitle` nunca teve `marginTop` próprio, diferente de todo
> `label` do formulário (`marginTop: 14`) — ficava colado no textarea de
> Observações acima. Corrigido: `marginTop: 28` (o dobro do gap normal
> entre campos, marca "início de seção nova" na hierarquia visual), mais
> `marginBottom: 8`. Efeito colateral visto no mesmo print: botão
> "+Adicionar" tinha 40px de espaço acima (soma do `scheduleKindRow` +
> `scheduleAddRow`) contra só 12px abaixo — parecia pertencer aos cards
> de modo, não à lista de horários que ele adiciona.
> `scheduleAddRow.marginTop` 20→4, proximidade agora reflete a relação
> real (mais perto do que ele adiciona). Testado (75/75 + 328/328),
> commit `68c9dd7`. Publicado via `eas update` canal `preview` — update
> group `1d68db11-ecc6-471f-9834-75f1652b8535`.

## 🟢 "Tomei" grava horário agendado, não instante do toque — ✅ resolvido 2026-09-11

> Decisão de produto do Rilson, achada ao ver o Histórico de verdade
> depois do fix de exibição do dia anterior (que passou a mostrar
> `taken_at` em vez de `scheduled_at`): tocar "Tomei" às 00:01 numa dose
> das 00:00 aparecia como "tomado às 00:01" — ruído sem valor pra quem
> só tomou o remédio no horário normal e tocou o botão simples.
>
> **Corrigido**: `markDose` (toque simples) agora manda
> `dose.scheduled_at` como `taken_at`, não `new Date()`. "Outro horário"
> continua sendo o único caminho que passa um `takenAt` explícito —
> nada mudou nele. Revisão completa de todo botão/ação que toca em
> horário (Tomei, Outro horário, Ajustar as próximas doses, Pular,
> Desfazer, Editar horário, Histórico, PDF de consulta, notificação
> local, export CSV/JSON) confirmando que cada um continua fazendo
> sentido com a mudança — nenhum outro ponto quebrado.
>
> Testado (328/328, incluindo teste novo/atualizado em `home.test.tsx`
> provando `taken_at === scheduled_at` no toque simples), typecheck
> limpo. Commit `560e893`. Publicado via `eas update` canal `preview`
> — update group `efa87e3a-8b3c-4492-8bc3-943837462dd0` (a publicação
> precisou de 3 tentativas — as duas primeiras foram interrompidas por
> reinícios da sessão antes de terminar, confirmado via `eas
> update:list` que nada tinha ido ao ar até a 3ª).

---

## 🔴 "Reajustar todos" (pra sempre) duplicava a dose de hoje — ✅ resolvido 2026-09-12

> Achado real do Rilson, com print: "adianto um remédio, digo que tomei
> agora, digo pra atualizar o horário daqui pra frente" — Ibuprofeno
> (interval) aparecia DUAS vezes na Home no mesmo horário, uma "Tomado"
> e outra pendente com os botões de ação.
>
> **Causa raiz**: `confirmRecalculateForever` só chamava `updateSchedule`
> (muda o `time` permanente do agendamento) — nunca avisava "hoje" sobre
> essa mudança. O DoseLog recém-criado (com o `scheduled_at` do horário
> ANTIGO) virava órfão (mostrado certinho como "Tomado" pelo fix de
> 2026-09-09, via `taken_at`) — mas a ocorrência de HOJE, recalculada do
> zero a partir do NOVO horário-âncora (que geralmente coincide com o
> horário que a pessoa acabou de registrar), não tinha log nenhum
> batendo com ela, e aparecia como uma dose pendente nova. "Só hoje"
> nunca teve esse problema porque usa `recalculateScheduleToday`, que
> pula a própria âncora de propósito (evita exatamente esse tipo de
> duplicata, documentado desde 2026-09-08).
>
> **Corrigido**: `confirmRecalculateForever` agora roda os dois passos —
> `updateSchedule` (horário permanente, dias seguintes) E
> `recalculateScheduleToday` (mesmo mecanismo de "só hoje", pula a
> âncora de hoje) — só pro modo intervalo. "Pra sempre" passa a ser
> literalmente "só hoje" + editar o futuro, não só editar o futuro.
>
> **Pendência conhecida, não uma regressão desta correção**: horário
> fixo não tem endpoint de recálculo "só hoje" (backend rejeita com
> 422) — o mesmo bug de duplicata provavelmente ainda existe pra
> "pra sempre" em horário fixo (sem mecanismo de reconciliação de
> "hoje" nesse caso). Também seguem pendentes os itens da entrevista de
> horário sobre horário fixo (Q10: "recalcular" deslocar TODAS as
> próximas doses fixas do dia pelo mesmo atraso) — nunca chegaram a ser
> implementados, só o "pra sempre" simples existe hoje pra fixo.
>
> Testado: teste antigo que travava o bug como comportamento esperado
> ("não chama recalculateScheduleToday — são exclusivos") corrigido pra
> provar o oposto; teste de horário fixo continua confirmando que ele
> NÃO chama `recalculateScheduleToday` (backend rejeitaria).

---

## 🔴 "O que acontece com o registro de hoje quando o remédio/horário muda de estado" — ✅ resolvido 2026-09-13

> Achado real do Rilson, com print: pausou o Ibuprofeno depois de já ter
> tomado a dose de hoje, e ela sumiu inteira da tela Hoje — "o registro
> tem que estar lá, ele só não deve aparecer nos horários seguintes".
> Mesma família de bug do "Reajustar todos" acima (duas rodadas seguidas
> do mesmo padrão) — o Rilson pediu uma 2ª sessão de `grilling` pra
> mapear a regra GERAL antes de corrigir de novo caso a caso. 4
> decisões saíram dessa entrevista, implementadas juntas:
>
> **1) Pausar não escondia mais a dose de hoje já resolvida — causa
> raiz**: `is_paused` filtrava o medicamento INTEIRO fora de
> `today()`, `CalculateAdherenceStreak`, `CalculateDailyAdherence`,
> `CalculateWeeklyAdherence` — um booleano só, sem noção de "quando" a
> pausa aconteceu. Corrigido com `paused_at` (novo timestamp em
> `medications`, carimbado por `MedicationController::update` só numa
> transição de verdade de `is_paused`): `GenerateScheduleOccurrences`
> passou a decidir, ocorrência por ocorrência, "até `paused_at`
> (inclusive) é história real, depois dele nunca existiu" — centralizado
> lá pelo mesmo motivo de sempre (evitar a mesma conta divergindo em 5
> lugares). `paused_at` nulo com `is_paused=true` (dado sem o instante,
> ex. seed/legado) assume o mais seguro — sempre esteve pausado, mesmo
> comportamento de antes desta mudança. `CheckMissedDoses` (o cron)
> continua filtrando `is_paused` do jeito antigo, de propósito — é o
> único consumidor genuinamente pra FRENTE, não pode gerar "perdida"
> fantasma pra sempre depois da pausa.
>
> **2) Excluir horário apagava histórico pra sempre, achado investigando
> o item 1 (mais grave que o que foi reportado)**: `DoseScheduleController::destroy`
> fazia `->delete()`, que cascateava (`cascadeOnDelete` na migration) e
> apagava TODO `DoseLog` daquele horário, com só um aviso mild na tela
> ("cancelar as notificações"), sem mencionar que era irreversível.
> Decisão do Rilson (opção B): não apaga mais — `is_active = false`
> (campo que já existia, já respeitado em toda leitura: `index()`,
> `today()`, streak, adesão). Some da lista, para de gerar dose nova,
> preserva o passado. Diferente de "excluir medicamento" inteiro
> (`MedicationController::destroy`), que continua cascateando de
> propósito — essa já tem aviso explícito e destrutivo na tela, decisão
> anterior confirmada, não mudou.
>
> **3) Editar horário tinha a MESMA causa raiz do "Reajustar todos"**:
> mudar `time`/`interval_hours` permanente de um schedule de intervalo
> já existente, sem reconciliar "hoje", deixava o `DoseLog` de hoje
> órfão e duplicava com uma ocorrência nova. Corrigido reaproveitando
> exatamente `recalculateScheduleToday` depois de `updateSchedule` (só
> intervalo — fixo o backend rejeita, mesma limitação já registrada
> acima), best-effort: se a reconciliação falhar, o horário permanente
> já salvou certo, não trava nem assusta a pessoa com erro sobre detalhe
> secundário.
>
> **4) Perguntar antes de pausar, se tem dose vencida sem ação**: item
> explícito do Rilson — "é bom deixar pro usuário decidir". Ao tocar em
> Pausar, o app busca as doses de hoje; se alguma estiver vencida
> (`scheduled_at` no passado) e ainda `pending`, mostra um ConfirmDialog
> bloqueante ANTES de completar a pausa — "Marcar como perdida" ou
> "Ignorar" (= pular, mesma semântica de status já usada no resto do
> app), só então pausa de verdade. Falha na checagem (rede etc.) não
> trava quem só quer pausar — segue best-effort pro comportamento
> anterior. Retomar nunca pergunta (não existe "dose vencida por causa
> da retomada").
>
> **Testado**: backend 278/278 (PHPUnit, incluindo 5 testes que
> travavam o comportamento ANTIGO como esperado — corrigidos pra provar
> a regra nova — e 5 testes novos cobrindo dose-já-tomada-sobrevive-à-pausa,
> adesão-continua-contando, dose-ainda-não-vencida-continua-escondida,
> histórico-sobrevive-à-exclusão-de-horário); frontend 389/389 (Jest,
> incluindo 7 testes novos do fluxo perguntar-antes-de-pausar e da
> reconciliação de "hoje" ao editar horário de intervalo); `tsc --noEmit`
> limpo.
>
> **Pendência conhecida**: item 12 da 1ª entrevista de horário
> ("recalcular deve deixar claro que vai afetar todos os dias
> seguintes") ainda não tem um aviso textual explícito na UI pro fluxo
> de editar horário — só o próprio nome do campo ("horário salva
> sozinho"). Não bloqueante, candidato a próxima rodada de UX.

---

## 🔴 Bug real: notificação de remédio que não existe mais na lista de hoje — ✅ causa raiz achada e corrigido em código, ⏸️ NÃO publicado (aguardando aprovação do Rilson)

> Achado do Rilson (2026-09-11), com print da tela "Hoje" (4 doses reais:
> Ibuprofeno, Maleato de dexclorfeniramina+betametasona, Vitamina B) ao
> lado do print das notificações do Android mostrando "Hora de tomar
> Vick Vaporub", "Dorflex" e "Pantoprazol" às 08:42 — nenhum dos 3 está
> em nenhum remédio cadastrado hoje.
>
> **Causa raiz**: todo cancelamento de notificação local é OPORTUNISTA —
> só roda no caminho de UI que exclui/pausa/edita um horário
> (`medication/[id].tsx`). O gatilho `DAILY` do Expo/SO fica agendado
> pra sempre até alguém cancelar explicitamente; nada no app varria
> "o que está agendado no aparelho ainda corresponde a algo real?".
> **"Excluir medicamento" só passou a cancelar notificação a partir do
> commit `bc3a66f` (2026-09-08, 3 dias atrás)** — qualquer remédio
> apagado antes disso (bem provável serem os 3 do achado, todos testados
> num momento de desenvolvimento anterior) ficou com o lembrete `DAILY`
> órfão, tocando todo santo dia, sem nenhum jeito de se autocorrigir
> sozinho.
>
> **Corrigido**: `reconcileScheduledNotifications()` nova em
> `services/notifications.ts` — varre TUDO que está agendado no SO
> (`getAllScheduledNotificationsAsync`) contra o estado real (todos os
> perfis da conta, não só o ativo — um cuidador quer continuar avisado
> do remédio do paciente mesmo com outra aba aberta), cancela o que
> sobrou. Roda 1x por abertura do app (`app/_layout.tsx`, mesmo lugar
> que já resincroniza push token), best-effort (não trava login se
> falhar). Contraparte no-op em `notifications.web.ts` (web não tem
> notificação persistente pra virar órfã). 5 testes novos em
> `notifications.test.ts` (órfão cancelado, ativo preservado, pausado
> cancelado, todos os perfis considerados, `refill_*` não é tocado por
> engano) + `auth-guard.test.tsx` atualizado.
>
> **NÃO publicado** — só existe no working tree local, nada commitado/
> buildado/publicado. Instrução explícita do Rilson: "não coloque nada
> em produção até eu te mandar". Quando aprovado, cobre tanto o histórico
> órfão de quem já tem o app instalado quanto qualquer futuro caminho de
> mutação que a gente esqueça de cancelar.

---

## 🔴 Card da Home mostrava horário AGENDADO, não o REGISTRADO, pra dose tomada via "Outro horário" — ✅ causa raiz achada e corrigido em código, ⏸️ NÃO publicado (aguardando aprovação do Rilson)

> Achado do Rilson (2026-09-11): "Pedi para reajustar horário do
> Ibuprofeno que tomei às 9h. O horário certo aparece no próximo (17h),
> mas o horário errado ainda aparece no card do segundo horário (10h em
> vez de 9h)."
>
> **Causa raiz — mesmo bug do "Bug 2" já corrigido no Histórico em
> 2026-09-09** (item 17 acima), só que aquela rodada mexeu só em
> `history.tsx` — o card da tela "Hoje" (`app/(tabs)/index.tsx`) tinha
> exatamente a mesma falha e ficou de fora: o horário exibido em cada
> dose sempre lia `item.scheduled_at`, nunca `item.taken_at`, mesmo pra
> dose já tomada com um horário explicitamente diferente (via "Outro
> horário"). A dose recalculada seguinte usava o novo horário certo
> (vem de `today_occurrences`, caminho diferente) — só a dose que a
> pessoa acabou de registrar continuava mostrando o horário agendado
> antigo.
>
> **Corrigido**: mesma lógica condicional que já existe em
> `history.tsx` — `taken && item.taken_at ? format(taken_at) :
> format(scheduled_at)`. Teste de regressão novo em `home.test.tsx`
> provando o cenário exato (registra em horário diferente do agendado,
> confirma que o card passa a mostrar o horário novo, não o antigo).
> Suíte completa (336/336) e typecheck limpos.
>
> **NÃO publicado** — só no working tree local, mesma instrução de hoje
> ("não coloque nada em produção até eu te mandar"). Esta é uma
> correção de JS puro (sem módulo nativo novo) — pode ir via
> `eas update` (OTA) quando aprovado, não precisa esperar o build nativo
> que os outros dois itens de hoje exigem.

---

## 🟡 UX: campo de horário HH:MM trocado por atalhos + picker nativo — código pronto, ⏸️ NÃO publicado (aguardando aprovação do Rilson)

> Achado do Rilson (2026-09-11) revendo o modal "Foi em outro horário?"
> com olhar de usuário menos técnico: digitar `HH:MM` de cabeça é fácil
> de errar/confundir (nem todo mundo pensa em "14:30" — pensa "duas e
> meia da tarde"). Reverte parte da decisão de 08/09 (que tinha escolhido
> texto livre "por menos risco, mais consistente com o resto do app") —
> motivo novo, não tinha pesado na decisão original.
>
> **Decisão de UX** (perguntada e confirmada com o Rilson): atalhos
> relativos (Agora / Há 15 min / Há 30 min / Há 1 hora) pro caso comum,
> sem exigir leitura de hora nenhuma — cobrem o cenário sem depender de
> módulo nativo nenhum (funcionam mesmo num build antigo). "Escolher um
> horário específico" abre o picker nativo do SO
> (`@react-native-community/datetimepicker`, roda/relógio) só quando
> precisa de um horário exato.
>
> **Módulo nativo — precisa de build EAS novo** (confirmado com o
> Rilson): não entra por OTA/`expo-updates`, igual à pendência já
> existente do `react-native-svg`/`react-native-purchases` — pode entrar
> na MESMA leva de build, não precisa de um build extra só pra isso.
> `require` tardio + cache (não import estático no topo), mesmo padrão
> já usado em `pickPhoto`/`expo-image-picker`
> (`app/medication/[id].tsx`) — num build sem o módulo compilado ainda,
> "Escolher um horário específico" mostra aviso amigável
> ("Seletor de horário indisponível nesta versão") em vez de travar a
> tela inteira; os atalhos relativos continuam funcionando normalmente
> mesmo assim.
>
> A lógica de ancorar o horário escolhido no DIA do agendamento (não em
> "hoje" — achado antigo de 2026-09-08, dose antes da meia-noite) foi
> preservada só pro caminho do picker específico; os atalhos relativos
> usam `Date.now() - N minutos` direto (nem precisam da ancoragem, já
> são um instante real completo).
>
> Testado (`home.test.tsx` — atalhos, picker pré-preenchido com agora,
> confirmação iOS/web via botão "Registrar", confirmação Android direto
> no evento `'set'` do diálogo nativo — o Android já tem seu próprio
> OK/Cancelar, sem precisar de um segundo toque no app).
>
> **NÃO publicado** — código no working tree local, `@react-native-community/datetimepicker`
> instalado (`package.json`) e `app.json` já tem o config plugin
> (efeito só no próximo build). Nada commitado/buildado/publicado até o
> Rilson aprovar.

---

## 📦 Publicação de tudo desta sessão (2026-09-09)

Sequência completa de commits desta sessão de auditoria de fuso horário
(mais notificações e design), todos testados e no ar:

1. `03aab72` — fix principal (dose sumindo do Hoje, Histórico com hora
   errada, bug de fuso em todo lugar que serializa `DoseLog`)
2. `94c931a` — trava contra dupla execução do `fix-taken-at-timezone`
3. `26a619a` — restauração do incidente de dupla execução (ver acima)
4. `b03fb99` — documentação do incidente
5. `2b3c862` — `treatment_ends_at` usando data UTC em vez da local
6. `a5c1ec1` — padding/design de Horários + corte de segundos

**Deploy**: cada commit passou por CI + Deploy VPS verdes (checados um a
um via `gh run watch`) antes do próximo passo — nenhum deploy feito às
cegas. **EAS Update**: publicado no canal `preview` depois do último
commit — update group `e573fd87-b304-4960-ae73-14b5af4c128c`, Android +
iOS, runtime `1.0.0` (compatível com o build nativo `a0556aea`, nenhuma
mudança de código nativo nesta sessão). **Produção**: backup do banco
antes de qualquer escrita, correção do `taken_at` histórico aplicada (18
registros, com o incidente de dupla execução corrigido em seguida), cron
do scheduler corrigido no host.

## Revisão de UI/UX pós-build real (2026-09-08)

> Depois de instalar o APK de verdade (build `a0556aea`) num aparelho,
> o Rilson notou que a tela de Histórico estava com a "parede de chips"
> de filtro por medicamento poluída visualmente (screenshot real, 16+
> itens incluindo coisas de primeiros socorros como gaze/álcool) e
> pediu uma revisão geral de UI/UX do app com pelo menos 5 sugestões.
> Levantamento abaixo (skill `frontend-design` como referência de
> princípios gerais — não existe skill específica de auditoria de app
> mobile já pronta neste ambiente). Confirmado com o Rilson: implementar
> todos os itens, começando pelo 1, "contanto que fique claro para o
> usuário final".

### 1. Filtro de medicamento no Histórico virava parede de chips — ✅ resolvido 2026-09-08

> Com poucos remédios os chips cabiam numa linha; com 16+ (o cenário
> real do Rilson, incluindo itens de primeiros socorros cadastrados
> como medicamento) virava uma segunda parede de chips de larguras bem
> diferentes, difícil de escanear — a queixa original do screenshot.

- **Implementado**: trocado por um botão único (`medicationFilterButton`)
  mostrando a seleção atual (bolinha de cor + nome + chevron) que abre
  um modal (`Modal` + `TextInput` de busca + lista rolável com "Todos
  os remédios" no topo e cada medicamento com checkmark quando
  selecionado). Mesmo padrão visual de action sheet já usado em outras
  partes do app. `history.tsx`: estado `medicationPickerVisible` /
  `medicationSearch`, `filteredMedications` (busca case-insensitive por
  nome já mascarado, respeitando o modo privado). 13/13 testes em
  `history.test.tsx` reescritos pro novo fluxo (abrir seletor pelo
  `accessibilityLabel` do botão, escolher a opção dentro do modal).

### 2. Dois filtros empilhados pareciam um grupo só — ✅ resolvido 2026-09-08

> Status (Todos/Tomado/Pulado/Não tomado/Pendente) e medicamento
> ficavam em duas linhas de chips sem nenhuma separação visual — fácil
> de não perceber que são dois filtros independentes, combináveis.

- **Implementado**: rótulo (`filterGroupLabel`, "Status" / "Remédio")
  acima de cada grupo. Simples de propósito — não é o tipo de tela que
  pede um design mais elaborado, só precisava parar de parecer um
  grupo confuso só.

### 3. Botão "Foi em outro horário" só com ícone, sem legenda — ✅ resolvido 2026-09-08

> Na Home, o botão que abre o registro de dose em horário diferente
> (item 8 da sessão de hoje) tinha só o ícone `clock-edit-outline`
> ("relógio com lápis"), sem nenhum texto — não dava pra adivinhar o
> que fazia sem tocar (e o público do app é majoritariamente idoso).

- **Implementado**: texto curto ("Outro horário" / "Different time" /
  "Otro horario") ao lado do ícone, mesmo padrão do botão "Tomei"
  vizinho. `accessibilityLabel` completo (`customTimeLabel`) mantido
  inalterado — só o rótulo visível mudou, testes existentes de
  `home.test.tsx` que buscam por esse label continuam válidos.

### 4-7. Itens menores / de mais longo prazo

- **4. Bolinha de cor no filtro de medicamento**: mantida no botão
  novo do item 1 — ao contrário da parede de chips antiga (onde a cor
  repetia em cada chip sem acrescentar nada, já que o nome já
  identificava o remédio), no botão único a bolinha ajuda a reconhecer
  visualmente a seleção atual de relance, sem precisar ler o texto.
  Reconsiderado e mantido, não removido.
- [x] **5. Vocabulário de chip/pílula fragmentado pelo app — ✅ resolvido
  2026-09-08.** Investigação: `sortChip` (Remédios) e `presetChip`
  (formulário de remédio) já usavam preenchimento sólido (`brand`) pro
  estado ativo; só `filterChip` (Histórico) destoava, usando tingimento
  (`brandSubtle`) — o único chip PEQUENO do app nesse padrão (que na
  verdade é o certo pra CARTÕES/LINHAS maiores: `themeBtnActive`,
  `formatOptionActive`, `pickerRowActive` continuam com `brandSubtle`
  de propósito, não é pra unificar esses). Corrigido só o outlier:
  `filterChipActive` virou preenchimento sólido igual aos outros dois.
  Decidido não extrair um componente `Chip` compartilhado agora — o que
  afeta o usuário é a cor/comportamento consistente, não a arquitetura
  do código; um componente novo tocando 3 arquivos com testes
  existentes é risco desproporcional ao ganho real neste momento.
- [x] **6. Nome "Remédios" na aba, mas o app guarda itens de primeiros
  socorros também** (gaze, álcool) — **investigado, decisão do Rilson:
  manter "Remédios" como está, sem renomear (2026-09-08).** Confirmado
  no código antes da decisão: `Medication` não tem nenhum campo de
  categoria/tipo — é puramente um rótulo de UI, não uma limitação de
  schema; um rename seria tecnicamente viável, mas mecânico (a palavra
  "medicamento"/"remédio" aparece espalhada em dezenas de chaves de
  i18n em pt/en/es, várias testadas por texto exato). Fechado — não é
  pendência, é decisão tomada.
- [x] **7. Auditoria geral de copy de estado vazio/erro — ✅ resolvido
  2026-09-08.** Estados vazios já eram bons (ícone + título + texto com
  próximo passo, ex.: "Cadastre o primeiro remédio pra começar...") —
  nenhuma mudança necessária ali. Achado real na varredura: ~9 mensagens
  de erro seguiam o padrão genérico "Erro ao X." sem explicar o que
  fazer a seguir, destoando das boas (ex.: erro de foto já explicava
  causa provável + próximo passo). Todas reescritas com o mesmo padrão
  ("Não foi possível X agora. Tente de novo em instantes." ou, quando
  cabia validação, "...Verifique os dados e tente de novo.") em
  pt/en/es: login/cadastro com Google, criar conta, criar perfil,
  atualizar estoque, pausar/reativar/excluir/salvar medicamento, salvar
  horário. `home.errorRecalculate` ganhou uma garantia extra importante:
  deixa claro que a dose já registrada continua salva mesmo se o ajuste
  falhar — evita a pessoa achar que perdeu o registro por causa de um
  erro secundário. 1 teste atualizado (`stock.test.tsx`, texto exato).

### Segunda leva — achados extras a pedido do Rilson (2026-09-08) — ✅ resolvido

> Depois de instalar o build e usar a tela de Estoque, o Rilson trouxe
> uma queixa concreta (screenshot) e pediu 5-10 sugestões extras de
> UI/UX pensando no público idoso. Levantamento feito lendo o código de
> verdade (Perfil, Remédios, Estoque), não achados genéricos. Confirmado
> implementar os 4 novos (o 1º, o card de Estoque, já tinha sido
> corrigido antes deste levantamento) — **implementado e testado, mas
> aguardando autorização explícita pra commit/`eas update`.**

- [x] **1. Card de Estoque bagunçado ao editar** (queixa original com
      screenshot) — o card usava `alignItems: 'center'` na linha
      externa; ao abrir o formulário de edição (card cresce), a bolinha
      de cor ficava flutuando centralizada na altura toda, longe do
      nome. Corrigido: `flex-start` + `marginTop` de ajuste óptico nos
      elementos que dependiam do centering antigo. Os 3 botões
      (Cancelar/Adicionar/Definir) numa fileira só com pesos visuais
      diferentes viraram: "Adicionar"/"Definir" dividindo uma fileira
      com peso igual (`flex: 1` nos dois — são as ações que de fato
      mudam o estoque), "Cancelar" sozinho embaixo, discreto. `minHeight
      48` mantido em todos (WCAG AAA).
- [x] **2. "Sair" e "Excluir conta" visualmente idênticos** (Perfil) —
      mesmo botão vermelho (`logoutBtn`/`logoutText`, cor `c.error`),
      mesmo ícone de alerta, e a confirmação de ambos usava
      `destructive` (fundo vermelho). Sair é reversível e corriqueiro;
      excluir conta é permanente. Corrigido: logout ganhou estilo neutro
      (`logoutTextNeutral`, ícone `colors.textSecondary`) e a
      `ConfirmDialog` de logout perdeu o `destructive` (fica com o
      `confirmBtn` padrão, cor de marca). Excluir conta continua
      vermelho/destacado, sem mudança — é genuinamente perigoso.
- [x] **3. Botão de convidar cuidador só com ícone** (Perfil, lista de
      perfis) — mesma categoria do achado #3 da primeira leva ("Foi em
      outro horário"). Ganhou texto visível ao lado do ícone;
      `accessibilityLabel` completo mantido inalterado, teste existente
      usa `testID` (não quebrou). **Superado pela terceira leva abaixo**:
      o botão virou "Cuidadores" (não mais "Convidar"), abrindo a tela
      de gerenciamento em vez de convidar na hora.
- [x] **4. Seção "Acessibilidade" virando gaveta geral** (Perfil) — Alto
      Contraste (acessibilidade de verdade) dividia o mesmo bloco sem
      separação com Ajuda, Exportar dados, Sair e Excluir conta.
      Corrigido: três seções novas — "Suporte" (Ajuda), "Dados"
      (Exportar), "Conta" (Sair/Excluir conta) — cada uma com seu
      próprio `sectionTitle`, mesmo padrão visual das seções existentes
      (Perfis/Aparência/Idioma/Acessibilidade).
- [x] **5. CTA duplicado em Remédios vazio** — com a lista vazia, o
      estado vazio já mostra um botão grande "Adicionar medicamento" no
      centro, mas o FAB "+" flutuante continuava aparecendo por cima,
      redundante (a Home já resolve isso certo, escondendo o próprio FAB
      quando não há doses). Corrigido: FAB de Remédios agora só aparece
      com `medications.length > 0`, mesma regra da Home.

> Verificação: `npm test` (comando exato do CI) 2x estável, 44/44
> suítes, 304/304 testes. Typecheck limpo. Commitado e publicado junto
> com a terceira leva (ver abaixo) — commit `2b16950`, `eas update`
> canal `preview` (update group `e66d8d59`), CI e Deploy VPS verdes.

### Terceira leva — "cuidado compartilhado" de verdade (2026-09-08) — ✅ resolvido

> O Rilson perguntou direto: o uso normal do app é do usuário final
> (o próprio paciente ou quem configurou pra ele), e o cuidador
> convidado é só um papel a mais — isso já estava claro, com contexto
> de segurança, e com o usuário final podendo revogar o compartilhamento
> quando quiser? Resposta honesta depois de ler o código: o **modelo de
> permissões já era sólido** (`ProfilePolicy`/`MedicationPolicy`/
> `DoseSchedulePolicy`/`DoseLogPolicy` no backend, cada um documentando a
> decisão — cuidador vê remédios, marca/desfaz doses e repõe estoque, mas
> nunca edita/apaga cadastro nem convida/revoga outro cuidador), mas o
> **ciclo de confiança do lado do app estava incompleto**: `listCollaborators`/
> `revokeCollaborator` já existiam no serviço, chamando endpoints reais do
> Laravel que já funcionavam, mas nenhuma tela do app chamava essas
> funções — código morto do ponto de vista da UI. Quem aceitava um
> convite ficava com acesso permanente, sem o dono do perfil ter como
> ver quem é ou tirar esse acesso depois.

- [x] **1. Tela "Quem tem acesso"** (`app/collaborators.tsx`, nova) —
      lista cuidadores aceitos (nome/e-mail) e convites pendentes
      separadamente, com botão de revogar/cancelar em cada linha
      (`ConfirmDialog destructive`, nomeando a pessoa). Acessada pelo
      botão "Cuidadores" em cada perfil próprio na tela de Perfil
      (substituiu o antigo botão "Convidar" direto). Rota registrada em
      `_layout.tsx` como modal, mesmo padrão de `help`/`pro`.
- [x] **2. Convite ganha pausa e contexto** — convidar deixou de ser
      instantâneo (tocar já gerava o código e abria o compartilhamento).
      Agora vive dentro da tela nova: um botão "Convidar cuidador" abre
      uma confirmação explicando exatamente o que a pessoa vai poder
      fazer (ver remédios, marcar doses, repor estoque) e o que não vai
      (editar/excluir nada) — e lembra que dá pra revogar depois, ali
      mesmo. Só gera/compartilha o código depois de confirmado.
- [x] **3. Lembrete "Cuidando de {{nome}}" na Home** — antes o único
      sinal de que a pessoa via dados de outro perfil era um selo
      pequeno na tela de Perfil. Banner discreto e persistente no topo
      da Home (`caregiverBanner`), visível só em `isCaregiverView`,
      evita a confusão "é meu remédio ou da minha mãe?".
- [x] **4. Remédios (lista) não avisa estoque baixo** — só a aba Estoque
      tinha o alerta visual (ícone + cor + borda); a lista de Remédios,
      olhada no dia a dia, não mostrava nada. Mesmo tratamento
      (`cardAlert`/`alertRow`, mesmo limiar `LOW_STOCK_DAYS_THRESHOLD`)
      replicado lá.

> `patientProfilesHint` (tela de Perfil) atualizado pra mencionar o
> botão "Cuidadores" em vez do ícone de convite antigo. Testes: nova
> suíte `collaborators.test.tsx` (8 testes — vazio, listar aceito vs.
> pendente, revogar com confirmação nomeando a pessoa, cancelar convite
> pendente com confirmação diferente, convidar com pausa/contexto,
> cancelar sem gerar nada); `profile-collaborators.test.tsx` atualizado
> (o botão agora só navega, o fluxo de convidar/compartilhar de verdade
> mudou pra suíte nova). Verificação: `npm test` (comando exato do CI)
> 2x estável, 45/45 suítes, 312/312 testes. Typecheck limpo. Commitado
> (`2b16950`) e publicado via `eas update` canal `preview` (update
> group `e66d8d59`) — CI e Deploy VPS verdes, sem incidentes.

---

## Auditoria de segurança (2026-09-08) — ✅ corrigido

> Relatório gerado por outra sessão do Claude Code rodando em paralelo
> (`docs/security-audit/`, não rastreado no git — script Python +
> venv local, fora do escopo desta sessão). Rilson pediu pra eu
> verificar os achados no código real e corrigir. Todos os 3 achados
> foram confirmados lendo o código (nenhum especulativo) antes de
> corrigir.

- [x] **A1 (Alta) — IDOR em `POST /dose-logs`** — `dose_schedule_id`/
      `medication_id` só eram validados como "existe em algum lugar do
      banco" (`exists:tabela,id`), sem checar que pertencem ao
      `profile_id` já autorizado pelo Gate — os três IDs eram tratados
      como independentes. Um usuário autenticado podia enviar seu
      PRÓPRIO `profile_id` (passa no Gate) junto com `dose_schedule_id`/
      `medication_id` de OUTRO perfil: o `updateOrCreate` casava por
      `dose_schedule_id` + `scheduled_at`, então isso vazava nome/
      dosagem do medicamento alheio na resposta e podia sobrescrever o
      `DoseLog` (status/notas) de um perfil de terceiro, sem nunca
      passar pela Policy do perfil-alvo.
  - **Fix**: `DoseLogController::store` agora resolve o `DoseSchedule`
    escopado ao `$profile` já autorizado
    (`whereHas('medication', fn($q) => $q->where('profile_id', ...))`,
    404 se não pertencer) e confere que o `medication_id` enviado bate
    com o do schedule, antes de tocar em qualquer registro.
  - 2 testes novos em `DoseLogStoreTest.php`: `dose_schedule_id` de
    outro perfil rejeitado com 404 (e a resposta não vaza o nome do
    medicamento da vítima), `medication_id` que não bate com o schedule
    também rejeitado.
- [x] **A2 (Baixa) — CSV Formula Injection na exportação LGPD** —
      `DataExportController::downloadCsv` escrevia nome/dosagem/
      instruções/notas do medicamento (texto livre do usuário) direto
      em células CSV sem neutralizar valores começando com `=`, `+`,
      `-` ou `@` — Excel/Sheets pode interpretar como fórmula ao abrir
      o arquivo. Risco só de auto-injeção (todo campo exportado só pode
      ter sido escrito pelo próprio dono do perfil), mas vale corrigir
      como defesa em profundidade.
  - **Fix**: `csvSafe()` novo, prefixa apóstrofo (padrão OWASP) em
    qualquer célula de texto livre que comece com um desses caracteres,
    aplicado a perfil/nome/dosagem/unidade/instruções/notas do
    medicamento nos dois pontos onde `fputcsv` escreve essas colunas.
  - 1 teste novo em `DataExportTest.php`: medicamento com nome `=1+1` e
    notas `+CMD` saem prefixados com apóstrofo no CSV gerado.
- [x] **A3 (Informativa) — comparação do webhook secret não era
      constant-time** — `RevenueCatWebhookController::handle` comparava
      `$request->header('Authorization') !== $secret` (retorna assim
      que acha o primeiro byte diferente — janela teórica de timing
      side-channel). Nenhum segredo hardcoded encontrado (achado
      positivo da auditoria); é só a forma da comparação.
  - **Fix**: trocado por `hash_equals($secret, (string)
    $request->header('Authorization'))`, sempre tempo constante.
  - Testes existentes de `RevenueCatWebhookTest.php` (secret correto/
    incorreto/ausente) continuam cobrindo o comportamento, sem mudança
    de contrato.

> **Pontos fortes confirmados pela auditoria** (sem correção
> necessária): isolamento de tenant via Policies em todo Controller,
> paridade entre o gate `is_owner` do app e as Policies do backend,
> nenhum segredo hardcoded, fluxo de magic link + OAuth robusto,
> exportação LGPD via signed URL com expiração curta, mass assignment
> de `subscription_tier` sob controle.
>
> Verificação: `./vendor/bin/sail artisan test` 2x estável, 255/255
> testes backend. Commitado (`fe2c025`) e em produção via Deploy VPS
> (CI verde, smoke test passou). `docs/security-audit/` (relatório de
> outra sessão) permanece fora do git, intocado.

---

## 🛑 Bug crítico: ocorrência de intervalo que atravessa a meia-noite nunca era gerada — ✅ resolvido 2026-09-09

> Achado real do Rilson usando o app de verdade: Ibuprofeno "de 8 em 8
> horas" a partir das 10:00 só mostrava doses às 10:00 e 18:00 — sem
> nenhum horário de madrugada, mesmo a conta "10h + 8h + 8h = 02h"
> claramente indicando que deveria existir uma terceira dose. Perguntou
> "é bug?" com print em mãos.
>
> Investigação (banco de produção, só leitura, via SSH): confirmado que
> nenhum recálculo (`today_override_*`) estava aplicado — a configuração
> era mesmo `time=10:00`, `interval_hours=8`, sem nada especial. Relendo
> `GenerateScheduleOccurrences::intervalOccurrences` com atenção: o
> algoritmo sempre recomeçava a contagem na âncora a cada dia calendário
> e nunca olhava pra trás. Resultado: a ocorrência das 02:00 — que
> pertence ao MESMO ciclo de 24h daquele horário (10h, 18h, 02h, de
> volta pras 10h 24h depois) — nunca era gerada **em dia nenhum**: hoje
> corta o cálculo às 23:59 antes de chegar lá, e amanhã recomeça do
> zero na âncora (10h) sem herdar o que "sobrou" de ontem. Uma dose de
> verdade sumia da agenda pra sempre, silenciosamente, todo santo dia —
> tanto na tela Hoje quanto nos lembretes locais (push), que espelham a
> mesma lógica.
>
> **Fix**: `intervalOccurrences` agora anda pra trás a partir da âncora
> (uma volta de intervalo por vez, enquanto a ocorrência anterior ainda
> cair dentro do mesmo dia calendário) antes de andar pra frente — vira
> um relógio contínuo de 24h de verdade, não mais um contador que
> reseta toda meia-noite. **Só se aplica ao caminho normal** (sem
> recálculo "só hoje" aplicado) — o override de recálculo continua
> "sempre pra frente a partir de agora", sem olhar pra trás, por design
> (não regride o achado de revisão de código anterior sobre não orfanar
> a dose que disparou o recálculo). Mesmo conserto espelhado em
> `services/notifications.ts` (`scheduleScheduleNotifications`) —
> lembretes locais tinham exatamente o mesmo bug, então a pessoa também
> nunca era avisada pra tomar a dose de madrugada.
>
> **Escopo real do impacto**: só afeta horários de intervalo cuja
> âncora não é o menor horário do próprio ciclo (ex.: 10:00 de 8/8h,
> que "esconde" um 02:00 anterior; 08:00 de 8/8h também, que esconde um
> 00:00). Âncoras já "auto-alinhadas" (ex.: 07:00 de 8/8h → 07h/15h/23h,
> nenhuma antes das 07h) continuam idênticas — por isso a suíte de
> testes inteira (257 backend) passou sem alteração nenhuma além dos 2
> testes que validavam o comportamento antigo (ver abaixo).
>
> **Efeito colateral esperado, avisado ao Rilson antes de publicar**:
> adesão/sequência (streak) desse tipo de horário recalcula retroativo
> — dias passados passam a contar a ocorrência de madrugada como devida
> e não registrada. É a conta ficando CORRETA (a dose sempre existiu,
> só nunca aparecia), não um bug novo. Não dispara notificação nem cria
> `DoseLog` retroativo: `CheckMissedDoses` (cron) e `MarkDoseMissedAndNotifyCollaborators`
> só processam o dia de HOJE, nunca reprocessam histórico — confirmado
> lendo o código antes de publicar, pra descartar risco de nova onda de
> notificação sobre dias antigos.
>
> 2 testes antigos corrigidos em `GenerateScheduleOccurrencesTest.php`
> (validavam a contagem/posição do comportamento com bug — atualizados
> pra refletir o ciclo de 24h completo, mantendo a invariante real que
> importa: a ocorrência do dia SEGUINTE continua não vazando pra cá). 2
> testes novos, um por stack, nomeando o cenário real exato (10:00, 8h):
> `test_intervalo_de_8_horas_a_partir_das_10h_inclui_a_ocorrencia_das_2h`
> (backend) e o equivalente em `notifications.test.ts` (mobile).
>
> 257/257 testes backend, 327/327 testes mobile, 2x estável cada.
> Typecheck limpo.
>
> **Varredura por bugs parecidos** (pedido do Rilson, "isso é muito
> importante"): grep sistemático de `addHours/subHours/endOfDay/
> startOfDay/setTimeFromTimeString/dayOfWeek` em todo `Actions`/
> `Controllers`/`Console` do backend e equivalente no mobile. Nenhum
> outro bug independente encontrado — `CalculateAdherenceStreak`/
> `CalculateWeeklyAdherence`/`CalculateDailyAdherence`/`GenerateConsultationSummary`
> todos delegam pra `GenerateScheduleOccurrences` (já corrigida, herdam
> o fix automaticamente, por isso foi centralizada desde o início);
> `SendWeeklyAdherenceSummaries` já calcula "domingo às 20h" no fuso de
> CADA perfil (achado/conserto anterior, 2026-08-10); `notifications.web.ts`
> não tem esse risco (dispara 1 notificação imediata, não agenda).
>
> **Efeito visto na prática**: seguindo a conta pro Ibuprofeno real do
> Rilson (10:00, 8/8h, únicos 2 dias com log — 07/09 e 08/09, 2 doses
> cada, sem 02h), o streak dele (mostrado como 2 na tela) deve zerar na
> próxima abertura, já que nenhum dos 2 últimos dias tinha as 3 doses
> completas retroativamente. Confirmado com ele antes de publicar — é a
> conta ficando certa, ele está em fase de testes do app justamente pra
> pegar esse tipo de coisa.

### Ajuste visual: seção "Horários" com botão duplicado e espaçamento ruim — ✅ resolvido 2026-09-09

> Achado real do Rilson com screenshot, no mesmo dia: com nenhum horário
> cadastrado ainda, a tela mostrava o botão "+Adicionar" **separado e
> flutuando** acima da caixa de aviso "Sem horário..." — que já convida
> a adicionar um horário no próprio texto. Duas coisas pedindo a mesma
> ação, com vão ruim entre elas (o botão ficava alinhado à direita,
> sozinho numa fileira cheia de espaço vazio à esquerda).
>
> **Fix**: unificado — vazio mostra só a caixa de aviso, com o botão
> "+Adicionar" DENTRO dela (ícone, texto e botão centralizados, mesmo
> espaçamento uniforme via `gap`); com pelo menos um horário já
> cadastrado em modo fixo, "+Adicionar" volta a ser a fileira separada
> de antes (faz sentido ali — não tem caixa de aviso pra se juntar).
> Mesmo conserto espelhado no formulário de cadastro de remédio novo
> (`isNew`), reordenando os atalhos "quantas vezes por dia" pra ficarem
> antes da caixa vazia, não depois de um botão redundante.
>
> 327/327 testes mobile 2x estável, typecheck limpo (nenhum teste
> quebrou — o botão continua com o mesmo `accessibilityLabel`, só mudou
> de posição na árvore).

### Ajuste visual: card de dose da Home apertado com nome de remédio comprido — ✅ resolvido 2026-09-09

> Achado real do Rilson com screenshot, assim que o fix do bug de
> madrugada foi pro ar: com a terceira dose do dia aparecendo agora,
> notou o card inteiro apertado — nome de remédio comprido ("Maleato de
> dexclorfeniramina + betametasona") quebrando palavra no meio. Pedido
> explícito: sugerir antes de implementar.
>
> **Causa raiz**: o card inteiro (barra de cor, horário, nome/dosagem,
> botões Tomei/Outro horário/Pular) dividia UMA fileira só. O achado de
> UX de ontem (dar texto visível pros botões, não só ícone) deixou essa
> fileira mais larga, sobrando cada vez menos espaço pro nome — que é
> flex:1 e cede espaço primeiro.
>
> **3 opções levantadas e apresentadas ao Rilson antes de mexer**: (A)
> duas fileiras — nome em cima, botões embaixo — recomendada; (B)
> truncar o nome (rejeitada — esconderia a informação mais importante
> do card, ruim num app de remédio); (C) voltar "Outro horário" a ser
> só ícone (rejeitada — desfaria a correção de ontem). Confirmado (A).
>
> **Fix**: card virou 2 fileiras — nome/horário numa (`cardTopRow`,
> largura toda, sem cortar palavra), botões de ação na outra
> (`actionsRow`, embaixo, também com a largura toda). Aproveitado o
> espaço novo pra dar hierarquia visual real: "Tomei" ganhou `flex: 1`
> (vira o botão dominante e mais fácil de acertar, em vez de disputar
> tamanho igual com "Outro horário"/"Pular"). Mesma estrutura aplicada
> aos estados "Tomado"/"Pulado" (consistência visual, mesmo cabendo bem
> numa fileira só) — código mais simples de manter, um padrão só.
>
> 1 teste novo (`touch-targets.test.tsx`) nomeando as duas garantias que
> importam: nome de remédio comprido nunca ganha `numberOfLines` (nunca
> trunca), e "Tomei" tem `flex: 1` de verdade. 328/328 testes mobile 2x
> estável, typecheck limpo.

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

- [x] **Versão Web do Meus Remédios — item desatualizado (2026-08-23)**,
      checkbox nunca foi marcado apesar do trabalho estar praticamente
      pronto (W1/W2, WebTopNav, chips, onboarding wide, logo tema-aware
      — tudo feito na sessão de renomeação/Assídua). Ver seção própria
      pra detalhe fino ainda em aberto, se algum.

## 🛡️ Segurança e Tratamento de Erros — Backlog (2026-08-23)

- [x] **React Error Boundary Global**: Criar componente `<ErrorBoundary>` fallback visual em React Native e Web para capturar erros em tempo de renderização com botão de recuperação. → **Implementado e testado 2026-08-23** (`components/ErrorBoundary.tsx` + `_layout.tsx`)
- [x] **Mascaramento no App Switcher (Privacy Blur)**: Proteger o app no alternador de tarefas (background) ocultando a tela com overlay/blur ao minimizar para evitar vazamento de dados de saúde. → **Implementado e testado 2026-08-23** (`components/PrivacyBlur.tsx`)
- [x] **Resiliência e Status na Fila Offline**: Exibir feedback e tratar itens com falha permanente na fila offline com rastreamento em tempo real. → **Implementado e testado 2026-08-23** (`store/syncStore.ts` + `services/sync.ts`)
- [x] **Validação de Contratos com Zod**: Adicionar Schemas de validação Zod para respostas de endpoints e formulários de remédios/doses. → **Implementado e testado 2026-08-23** (`lib/schemas.ts`)
- [x] **Autenticação Local por Biometria / PIN**: Oferecer camada de segurança biométrica (FaceID / TouchID) para desbloqueio da lista de medicamentos. → **Implementado e testado 2026-08-23** (`services/biometrics.ts` + `store/privacyStore.ts`)
- [x] **Renovação Transparente de Token (Refresh Token)**: Implementar interceptor para renovação de sessão sem deslogar o usuário durante o uso. → **Implementado e testado 2026-08-23** (`services/api.ts`)
- [x] **Sentry na Web**: Integrar `@sentry/react` para captura de exceções em navegação desktop/mobile web. → **Implementado e testado 2026-08-23** (`_layout.tsx`)
- [x] **Exportação de Relatório em PDF**: Gerar relatórios em PDF para acompanhamento médico com `expo-print` e `expo-sharing`. → **Implementado e testado 2026-08-23** (`lib/reportPdf.ts` + `history.tsx`)
- [x] **Telemetria / Analytics Anônimo (sem PII)**: Registrador local de eventos anônimos de engajamento. → **Implementado e testado 2026-08-23** (`services/analytics.ts`)
- [x] **Atalhos de Teclado no Desktop (Web)**: Hook para capturar atalhos (`Esc`, `Cmd+N` / `Ctrl+N`) no browser. → **Implementado e testado 2026-08-23** (`hooks/useKeyboardShortcuts.ts`)
- [x] **Pacote de Usabilidade Sênior & Acessibilidade**: Gráfico de adesão redesenhado (rótulos de data, trilho visual 0-100%, legenda explicativa `🟢/🟡/🔴`), confirmação visual de dose (toast feedback ao marcar "Tomei") e touch targets expandidos. → **Implementado e testado 2026-08-23** (`AdherenceChart.tsx` + `index.tsx`)
- [x] **Correção no PDF de Consulta (Alinhamento de Fuso Horário)**: Alinhamento da busca de doses em UTC e fuso local no backend para garantir contagem 100% precisa das doses tomadas. → **Implementado e testado 2026-08-23** (`GenerateConsultationSummary.php` + `DoseLogController.php`)
- [x] **Assets de Alta Definição e Suavização na Web**: Logotipo vetorial em alta resolução 1024x1024 px no modo escuro e suavização de fonte antialiased no CSS global da Web. → **Implementado e testado 2026-08-23** (`logo-mark-white.png` + `_layout.tsx`)
- [x] **Envio de Foto de Medicamento na Web**: Suporte a conversão automática de imagens `blob:`/`data:` para objeto `File` no navegador. → **Implementado e testado 2026-08-23** (`services/medications.ts`)
- [x] **Otimização de Armazenamento e Conversão WebP**: Conversão automática de fotos de medicamentos enviadas para `.webp` compactado com 80% de qualidade no backend PHP/Laravel, reduzindo em ~80% o uso de disco na VPS. → **Implementado e testado 2026-08-23** (`MedicationController.php` + `MedicationPhotoTest.php`)
- [x] **Renovação Transparente de Token (`/auth/refresh`)**: Adição do endpoint POST `/auth/refresh` no Laravel Sanctum para renovação silenciosa de tokens e correção do override da fonte `MaterialCommunityIcons` na Web. → **Implementado e testado 2026-08-23** (`AuthController.php` + `api.php` + `_layout.tsx`)

- [ ] **Fluxo de L0 (Google Play)** — aguardando taxa de $25 para conta de desenvolvedor. Quando destravar: `eas build --profile production` → submeter → 14 dias de teste fechado (12 testadores).
- [x] **`EXPO_PUBLIC_API_URL` no ambiente `production` do EAS —
      corrigido 2026-08-23** (`eas env:create production`, confirmado
      via `eas env:list`). Antes só tinha a chave do RevenueCat, senão
      repetiria o mesmo bug do ambiente `preview`
      (login quebrado por apontar pro domínio errado/vazio).

> [!WARNING] Variáveis do EAS não são tocadas por `git`/find-replace —
> achado 2026-08-22 durante a renomeação. `eas.json` e `.env` do
> código foram corrigidos, mas `EXPO_PUBLIC_API_URL` do ambiente
> `preview` no **painel do EAS** (`eas env:list preview`) continuava
> `api-remedios.narniano.com` — só é usado por `eas update` (OTA), não
> por `eas build` (que lê o `env` do `eas.json`). Corrigido com
> `eas env:update preview --variable-name EXPO_PUBLIC_API_URL --value
> ...` + novo `eas update` pra recompilar o bundle com o valor certo.
> Mesma categoria dos achados no `.env` da VPS (`WEB_AUTH_ORIGINS`,
> `APP_URL`, `GOOGLE_REDIRECT_URI`, `APP_NAME`, `MAIL_FROM_ADDRESS`,
> `MAIL_FROM_NAME` — esse último achado só depois de receber o e-mail
> de verdade, o nome do remetente é campo separado do endereço) —
> **toda renomeação de projeto precisa varrer configuração fora do
> git**: `.env` de servidor E variáveis de ambiente do EAS/CI, não só
> o código.

#### Rascunho do formulário "Data Safety" (pré-preenchido 2026-08-22, sem depender da conta paga)

> Baseado nas migrations reais (`users`, `profiles`, `medications`,
> `dose_logs`, `push_tokens` etc.), não em suposição. Preencher isso
> quando a conta existir — economiza reler o schema na hora.

| Categoria (Google Play) | Coletado? | O quê | Compartilhado com terceiro? | Uso |
|---|---|---|---|---|
| Informações pessoais | Sim | Nome, e-mail | Não (Google só como provedor de login, não é "compartilhamento") | Conta/funcionalidade do app |
| Saúde e bem-estar → Info de saúde | Sim | Nome do remédio, dosagem, horários, histórico de adesão | Não | Funcionalidade principal do app |
| Fotos e vídeos | Sim (opcional) | Foto do remédio (`photo_path`, usuário escolhe adicionar) | Não | Funcionalidade do app |
| Atividade no app | Sim | Dose marcada como tomada/pulada | Não | Funcionalidade do app |
| Identificadores de dispositivo | Sim | Token de notificação push | Não | Lembretes/notificações |
| Informações financeiras | **Não, ainda** — reavaliar quando RevenueCat sair do vazio (ver seção abaixo) | — | — | — |

**Outras perguntas do formulário:**
- Dado criptografado em trânsito? **Sim** (HTTPS/TLS via Traefik + Let's Encrypt em toda a stack)
- Usuário pode pedir exclusão de dado? **Sim** — exclusão de conta dentro do próprio app (`AuthController::destroyAccount`), sem precisar suporte
- Compartilhamento com terceiros de verdade: **Sentry** (diagnóstico de erro, sem PII — `send_default_pii=false` no backend, servidor nos EUA, já disclosurado na política de privacidade)
- Auditoria de segurança independente: Não

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

## Estado na pausa (2026-08-23)

Sessão encerrada com tudo publicado — continuação direta da pausa de
2026-08-22 abaixo, já com a renomeação pra Assídua fechada:

- **Web**: commit `e8e1dd3` em `main`, deploy automático confirmado
  verde (CI + Deploy VPS + smoke test) em `assidua.narniano.com`.
- **Mobile**: OTA publicado no canal `preview` (update group
  `27fc79ab`), mesmo commit. 145/145 testes · TypeScript limpo.
- **O que entrou nesta sessão**: fim do alerta nativo feio (todas as
  telas agora usam `AlertDialog` estilizado via `hooks/useAlertDialog`),
  fix da seleção de perfil não persistindo entre abas, duas features de
  "calor humano" aprovadas e implementadas (reação do cuidador na dose,
  resumo pra consulta compartilhável), limpeza do container órfão
  `remedios-api`, `NAMING.md` e `ROADMAP.md` com o registro real do que
  foi feito x o que ainda falta.
- **Pendências abertas** (nada represado por esquecimento): L0
  (Google Play, US$25) segue sendo o único bloqueio de verdade; depois
  dele vêm os itens "médios" já aprovados e ainda não atacados —
  TalkBack/VoiceOver manual, edge cases de font-scale, analytics de
  aquisição real, PDF do resumo pra consulta, LGPD export mais
  completo.

---

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

### 🟡 Fragmentação de contas: Google vs magic link com mesmo e-mail (reportado 2026-08-22)

> **Parte 1 (código) confirmada corrigida e testada — 2026-08-22.**
> `AuthController::googleCallback` já resolve por `google_id` OU
> `email` antes de criar conta nova (ver código). Teste
> `test_login_google_de_email_ja_cadastrado_via_magic_link_vincula_sem_duplicar`
> existe e passou na CI do push de hoje (run verde, confirmado via
> `gh run list`, não só leitura de código).
>
> **Parte 2 (merge de dado real) verificada e fechada — 2026-08-22.**
> Backup rodado (`make backup`, ok), dry-run de
> `assidua:merge-duplicate-accounts` rodado e depois conferido direto
> na tabela (`User::all()`, sem agregação): **1 única conta** pro
> e-mail do Rilson (id 2, google_id preenchido, sem senha — só
> magic-link/Google, as duas batendo na mesma conta). Nenhuma
> duplicata pra mesclar hoje — o relato original era de antes do fix.
> Item fechado, `--execute` nunca precisou rodar.

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

- [x] **Logo real em vez de ícone genérico** — feito 2026-08-22: login,
      cadastro e WebTopNav agora usam `assets/icon.png` (coração+relógio
      colorido) em vez de `MaterialCommunityIcons 'pill'`. Favicon
      conferido — já era o ícone certo, sem texto embutido, não precisou
      mudar.
- [x] **Home web: menos logos repetidos** — feito 2026-08-22: mark
      pequeno + marca d'água grande do header agora somem em wide
      (`!isWide`) — a WebTopNav já é o único ponto de marca nesse modo,
      header interno vira só tipografia.
- [x] **Onboarding desktop quebrado** — feito 2026-08-22: conteúdo de
      cada passo (ícone/título/texto) e o botão de avançar ganharam
      `maxWidth: 480` centralizado em wide, dentro do wrapper de página
      que precisa continuar em `{ width }` cheio pro paging do
      `ScrollView` funcionar.
- [x] **Perfil: chips de Idioma quebrando em 2 linhas** — feito
      2026-08-22: causa era `width: '48%'` fixo (pensado pra grade 2x2
      do celular) nunca liberado em wide; `languageBtnWide` troca pra
      `flex: 1` como os outros seletores quando `isWide`.
- [x] **Alert de erro feio, não combina com o resto do design — feito
      2026-08-23** (achado do Rilson, 2026-08-22, testando envio de
      link/login). `AlertDialog` já existia e estava em uso só no
      `profile.tsx`; estendido (via novo hook `hooks/useAlertDialog.tsx`,
      mesmo padrão do `useState` + JSX que já existia lá) pros outros 7
      lugares que ainda usavam `showAlert`/`window.alert`/`Alert.alert`
      cru: `login.tsx`, `register.tsx`, `stock.tsx`, `history.tsx`,
      `index.tsx`, `pro.tsx`, `medication/[id].tsx`. O único
      `Alert.alert` nativo que sobrou de propósito é o action-sheet de
      foto (opções com botões, não é um alerta simples de uma mensagem
      só).
- [x] **Seleção de perfil não persiste entre telas — feito 2026-08-23**
      (achado 2026-08-22, durante automação de screenshot). Causa
      confirmada: `profileStore.setProfiles` resetava `activeProfile`
      pra `profiles[0]` toda vez que a lista de perfis era buscada de
      novo. Corrigido pra preservar a seleção atual quando ela ainda
      existe na lista nova.
- [ ] **Botão "Baixar o app" no site** — só DEPOIS da publicação na Play
      Store (L0): badge/link do Google Play no rodapé e/ou navbar web.
      Antes disso seria botão morto. Pedir pro Rilson lembrar ao fechar
      o L0 (2026-08-22).
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

## ⚖️ PENDENTE CRÍTICO — Marca e nome "Meus Remédios" (decidir ANTES do L0)

> Levantamento 2026-08-22, disparado pelo Rilson ao encontrar produtos
> homônimos. **Isto não é consultoria jurídica** — é análise técnica de
> produto + direito autoral básico BR (LPI/INPI). Decisão final de
> marca merece advogado de PI se for registrar de verdade.

### Fatos levantados

| Produto | Onde | Quem | Desde | Observação |
|---|---|---|---|---|
| **"Meus Remedios"** (lembrete de medicamentos) | App Store iOS (id6754898387) | **Elevii** (Talita Ramos dos Santos) | **06/11/2025** | Mesmo público, mesmas features (múltiplos horários, duração, adesão, alto contraste, fonte ajustável). Grátis. |
| "Meus Remédios" (`com.bmdev.meus_remedios`) | Google Play | bmdev | verificar | Mesmo nome display |
| "Meu Remédio" (admin) | admin-meuremedio.insix.com.br | insix | verificar | B2B, nome no singular |

**Nosso marco temporal**: scaffold do projeto 28/06/2026, primeiro deploy
web 22/08/2026 — **~8 meses DEPOIS** da Elevii na App Store, mesmo nicho,
feature set quase idêntico (inclusive acessibilidade p/ idosos).

### Avaliação de risco honesta

- **Ação judicial contra nós: BAIXO.** Concorrente pequeno, nome
  altamente descritivo/genérico ("meus remédios"), mercado cheio de
  apps equivalentes (Medisafe, MyTherapy, LembraMed...). Ninguém
  monopoliza isso facilmente.
- **Recusa do NOSSO registro no INPI por colisão: MÉDIO.** Se a Elevii
  (ou bmdev) tiver registro vivo nas classes 09/42/44, nosso pedido
  trava. Pesquisa prévia resolve a dúvida em 30min, grátis.
- **Custo comercial silencioso: MÉDIO-ALTO.** ASO briga pelo termo
  exato; se crescermos, o outro pode "acordar"; e a narrativa externa
  "app igual, nome igual, lançado DEPOIS" nos desgasta mesmo sem
  processo — independência real não prova sozinha.
- **Nuance desfavorável**: features + pitch parecidos demais elevam o
  custo de reputação de qualquer disputa futura.

### Opções (com custos reais)

1. **RENOMEAR antes do L0** — janela mais barata que existirá. Hoje o
   custo é: bundle id novo no Play Console/GCloud (OAuth redirect URIs
   de novo), reconfigurar app RevenueCat (amarrado ao bundle atual),
   i18n/logos/domínio. ~1–2 dias de trabalho. Ganho: nome
   distintivo/coined registra no INPI sem brigar, diferencia no ASO,
   zera esse capítulo jurídico.
2. **MANTER + registrar no INPI** — pesquisa prévia obrigatória
   (classes 09/42/44, busca por "MEUS REMEDIOS" E "MEU REMEDIO");
   sem colisão viva, protocolar (pessoa física/MEI ≈ R$142/classe gov,
   12–24 meses pra deferir, prioridade conta desde o protocolo) +
   documentar uso de boa-fé (git history 28/06/2026, domínio no ar).
   Risco residual: Elevii pode ter pedido protocolado não-publicado
   ainda (sigilo de 180 dias).
3. **MANTER sem registro** — viável só enquanto hobby; incompatível
   com plano de cobrança (L1/RevenueCat).

### Recomendação registrada

**(1) Pesquisar INPI hoje (grátis) → (2) decidir renomear × manter com
dado em mãos → (3) se manter, protocolar registro imediatamente após.**
Pendurado no gate do L0: **não submeter à Play sem essa decisão
tomada e documentada aqui**.

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

---

# Histórico de engenharia e produto (pré-pausa)

> Movido do `README.md` em 2026-08-22 — estava ocupando 70% do
> arquivo (1283 de 1846 linhas só na seção `## Roadmap`), o que não
> é o lugar certo pra um README (deveria ser enxuto: o que é, como
> rodar). Nada foi apagado, só realocado pro arquivo que já existe
> pra isso. Cobre o trabalho de engenharia e produto desde o MVP
> (2026-08-08) até a sessão de 2026-08-21, antes da pausa por marca
> registrada no topo deste arquivo.

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
- [x] **Acessibilidade de leitura — seletor de fonte no app** (registrado
      2026-08-10, **implementado 2026-08-14**, ver seção "Tamanho da
      fonte" abaixo; falta só o teste manual real com TalkBack/VoiceOver
      em aparelho) — público do app puxa forte pra idoso/baixa visão
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

### Frequência configurável, marca na UI e plano web (2026-08-21)

Sessão disparada por 3 pontos do Rilson: versão web (só planejar),
"quantas vezes/quantos dias tomar ainda não está bem configurável", e
o logotipo ausente das telas. Tudo implementado, testado e publicado.

- [x] **Múltiplos horários já no cadastro** — o buraco central: o form
      só aceitava UM horário ("Primeiro horário"); montar "2x ao dia"
      exigia criar, reabrir e editar. Agora a criação tem lista de
      rascunhos (`DraftSchedule` em `app/medication/[id].tsx`) com a
      MESMA UI da seção de horários de remédio existente — nada vira
      schedule de verdade até salvar o remédio (`saveMedication` faz o
      laço `createSchedule` + notificações). Regra nova: remédio exige
      ≥1 horário — remover todos e salvar dá aviso claro
      (`errorNoSchedule`) em vez de criar um remédio invisível no
      dashboard (comportamento antigo criava um horário padrão
      silenciosamente, sem dar escolha nenhuma).
- [x] **Atalho "Quantas vezes por dia?"** — chips 1x/2x/3x/4x por dia
      preenchem a lista com horários padrão clínicos (08:00 · 08+20 ·
      08+14+20 · 06+12+18+00), todos fixos/todos os dias, cada um
      editável depois. Chip fica destacado enquanto a lista corresponde
      exatamente ao atalho (`isPresetActive`) — feedback de que o toque
      fez efeito sem impedir ajuste fino.
- [x] **Presets de dias da semana** — chips Todos / Seg a Sex / Fim de
      semana acima dos círculos D S T Q Q S S, nos DOIS editores (o de
      rascunho e o de remédio existente compartilham
      `renderFrequencyFields`). Vocabulário real do usuário ("dias
      úteis") em vez de seleção círculo a círculo.
- [x] **Presets de intervalo** — chips 4h/6h/8h/12h/24h acima do campo
      livre "de quantas em quantas horas". Os intervalos mais
      prescritos com um toque; campo livre continua pros casos fora da
      curva.
- [x] **Duração do tratamento ganhou data concreta** — digitar N dias
      mostra "Fim previsto: {data}" (`toLocaleDateString` com o idioma
      ativo). Número solto ("10") não diz nada; data diz. Continua
      avisando quando acaba, nunca pausando sozinho (decisão de produto
      de 2026-08-14 mantida).
- [x] **Logotipo na UI — com achado importante**: o header da home JÁ
      tinha o logo desde 14/08 (commit `eaa6b14`, silhueta
      monocromática 30px ao lado da data) e mesmo assim o Rilson
      perguntou "cadê o logo?" — presença invisível é igual a ausência.
      Correção em duas frentes: home ganhou marca d'água grande
      (170px, opacity 0.12, recortada pelo `overflow: hidden` do
      header) atrás de data/título; Perfis (zero marca até hoje)
      ganhou silhueta translúcida no canto do card colorido do usuário
      + rodapé de assinatura no fim do scroll (logo tingido com
      `tintColor: textMuted`, adapta aos dois temas) com nome do app +
      versão via `expo-constants`. A pergunta "quem não aparece não é
      lembrado" vale pra marca também.
- [x] **Plano da versão web** — registrado no `ROADMAP.md` (seção
      "🌐 Versão Web"): recomendação de spike curto (1–2 dias) com Expo
      Router web medindo o custo real dos módulos nativos
      (notificações, RevenueCat, foto, sqlite offline) antes de decidir
      vs. SPA separada; fases W0 spike → W1 MVP do cuidador → W2
      paridade+PWA → W3 Web Push. Backend já serve qualquer cliente
      (API REST + Sanctum); falta só CORS pro domínio novo.
- i18n pt/en/es completo para tudo (+ chave `profile.version`; chave
  `firstSchedule` aposentada dos três locales junto). **10 testes
  novos** (`medication-schedule-edit.test.tsx`: múltiplos horários,
  atalhos, presets, bloqueio sem horário, data de fim) — suíte mobile:
  145/145. TypeScript limpo.

Achados reais do caminho (pra não repetir):

- Rótulos acessíveis dos botões de dia são os nomes ABREVIADOS de
  `i18n.days.*` ("Seg", "Sáb"), não os nomes completos — o teste que
  procurou "Sábado" falhou; o certo é "Sáb".
- Teste de fluxo de cadastro que passa pelo salvamento PRECISA preencher
  o nome antes — a validação "Preencha o nome do remédio." bloqueia
  antes de chegar em qualquer horário (2 testes corrigidos por isso).

Publicado: commit `15926bd` (main, pushed) + **`eas update` canal
`preview`, ambiente `preview`** — update group
`45cbf01b-a61f-4843-9554-556b6d42248f`, runtime 1.0.0, android+ios.

> [!WARNING] Lição do `eas update` desta vez (2026-08-21)
> Complementa o achado CRÍTICO de 2026-08-14 (variáveis EXPO_PUBLIC_
> vêm do EAS Environment Variables no servidor, não do `env` do perfil):
> em modo **não-interativo** o comando exige a flag explícita
> `--environment preview` (sem ela: "The `--environment` flag must be
> set when running in `--non-interactive` mode"). O comando completo
> seguro é:
> `eas update --channel preview --environment preview -m "..."`.
> Sem ambiente certo, o bundle sai SEM `EXPO_PUBLIC_API_URL` e o app
> quebra tentando `localhost` — o mesmo bug do Google login de 14/08.
> Verificação pós-publicação recomendada: abrir o app no celular,
> deixar baixar o update OTA (fecha e reabre) e conferir a lista de
> horários no cadastro + logo no header/Perfis.

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
      dado de saúde, passa por revisão mais rigorosa que app comum.
      **Mapeamento pronto abaixo** (auditoria 2026-08-22) — copiar ao
      preencher:

      | Pergunta do formulário | Resposta |
      |---|---|
      | O app coleta ou compartilha algum dado? | **Sim** |
      | Nome e e-mail (dados de conta) | Coletados · não compartilhados · opcional |
      | Info de saúde (medicamentos, doses, horários) | **Coletados** · não compartilhados · opcional (usuário digita) |
      | Foto do medicamento | Coletada · não compartilhada · opcional |
      | Dados de assinatura (status Pro) | Coletados via RevenueCat · não compartilhados com terceiros fora a loja |
      | Identificador de dispositivo (push token) | Coletado · não compartilhado · necessário p/ lembretes |
      | Senha | Nunca em texto puro (bcrypt); Google OAuth quando aplicável |
      | Os dados são criptografados em trânsito? | **Sim** (HTTPS/TLS obrigatório) |
      | Existe forma de o usuário pedir exclusão? | **Sim**, dentro do app (Perfis → Excluir conta) + exportação JSON (LGPD art. 18) |
      | URL da política de privacidade | https://api-remedios.narniano.com/privacidade |
      | Termos de uso | https://api-remedios.narniano.com/termos |

      ⚠️ Declarar info de saúde ativa a **revisão de saúde do Google**
      adicional: responder que o app é ferramenta de organização
      pessoal, SEM diagnóstico/tratamento/prescrição (disclaimer
      permanente no primeiro uso já previsto nos Termos, seção ⚠️).
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
- [x] **RevenueCat — conta criada, SDK integrado, webhook funcionando (2026-08-21)**
      — falta só produto real na loja (ver pendências abaixo, é a
      única coisa que depende de L0/conta Google Play). Detalhe completo
      logo abaixo.
- [ ] **Decisão de preço**: pesquisar concorrência direta antes de
      chutar número — Medisafe e MyTherapy são a referência do nicho.
      Não bloqueia o código (preço não fica hardcoded no app, é
      configurado no RevenueCat/loja) — só falta decidir o número
- [ ] **AdMob** — adiado pro futuro, RevenueCat é a prioridade de L1
      (ver Fase 4 acima)
- [ ] Exportar histórico em PDF (Pro) — já mapeado acima

#### RevenueCat — integração de código (2026-08-21)

Feito **antes** de existir a conta Google Play — nada aqui dependia
disso. O único bloqueio real que sobrou é sincronizar produto de
verdade com a loja, que sim depende de L0.

- [x] **Backend (Laravel)** — `RevenueCatWebhookController` novo,
      rota `POST /webhooks/revenuecat` fora do grupo `auth:sanctum`
      (quem chama é o RevenueCat, não um usuário logado). Autenticação
      própria: compara o header `Authorization` contra
      `REVENUECAT_WEBHOOK_SECRET` (`config/services.php` →
      `services.revenuecat.webhook_secret`) — **não é a secret key da
      API REST do RevenueCat**, é um valor à parte que se define ao
      criar o webhook no dashboard deles, colado dos dois lados.
      `app_user_id` do evento é o id numérico do usuário Laravel
      (nunca um id gerado pelo RevenueCat) — combinado no client via
      `Purchases.logIn(String(user.id))`. Eventos que concedem Pro:
      `INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE`/`UNCANCELLATION`/
      `NON_RENEWING_PURCHASE` (sem `expiration_at_ms` = Pro vitalício,
      já compatível com `User::isPro()`, que já tratava
      `subscription_expires_at` nulo como acesso permanente). Só
      `EXPIRATION` revoga — `CANCELLATION` não tira acesso na hora
      (usuário cancelou a renovação futura, mas o período já pago
      continua valendo). Testado: `RevenueCatWebhookTest.php`, 9 casos
      novos (autorização, cada tipo de evento, `app_user_id` sem
      usuário correspondente ou não-numérico não quebra). **206/206
      backend** no total.
- [x] **App (Expo)** — `react-native-purchases` instalado.
      `services/purchases.ts` novo: `initPurchases()` fica no-op sem
      `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`/`_IOS_KEY` configurada
      (mesmo padrão do Sentry em `_layout.tsx` — roda sem erro, sem
      oferecer Pro nenhum, até a chave existir de verdade).
      `authStore.setUser` virou o ponto único de sincronia do
      `Purchases.logIn`/`logOut` com o login/logout do app — não
      precisou tocar nas 4 telas que já chamavam `setUser`
      (`auth-callback.tsx`, `register.tsx`, `login.tsx`,
      `profile.tsx`). `pro.tsx` busca a oferta real
      (`getCurrentOffering()`) e mostra botão de assinar com o preço
      de verdade quando existe produto cadastrado; sem produto (a
      realidade hoje, pré-L0), continua mostrando o aviso "em breve"
      de antes — nada quebrou pra quem já via essa tela. Compra
      concluída re-busca `/auth/me` pra refletir o novo tier — quem
      decide "é Pro?" continua sendo só o backend. Cancelamento pelo
      próprio usuário (`error.userCancelled`) não mostra alerta de
      erro; erro de verdade sim. Botão de restaurar compra incluído.
      Testado: `pro.test.tsx` reescrito, 8 casos (usuário grátis sem
      oferta, usuário Pro nem busca oferta, SDK configurado sem
      pacote ainda mostra "em breve", oferta real mostra botão com
      preço, compra bem-sucedida atualiza o usuário, cancelamento
      silencioso, erro real mostra alerta, restaurar sem assinatura
      mostra alerta). Mock de `react-native-purchases` novo em
      `jest.setup.ts` (módulo nativo, não existe no ambiente de
      teste — mesmo padrão já usado pra NetInfo/expo-sqlite).
      **135/135 mobile** no total, `tsc --noEmit` limpo.
- [x] Chave pública do RevenueCat (`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`)
      salva em `app/.env` (gitignorado) + Bitwarden. Ainda não
      confirmado se é a chave do Test Store (prefixo `test_`, permite
      simular compra sem produto real na Play Store) ou já a de
      Google Play — o próprio prefixo sugere Test Store, o que seria
      ótimo pra testar o fluxo inteiro (client → RevenueCat → webhook
      → Laravel) antes mesmo de L0 terminar.
- [ ] **Pendência real, depende de L0**: produto de assinatura
      cadastrado na Play Console + sincronizado no RevenueCat. Sem
      isso, `getCurrentOffering()` continua retornando sem pacote e a
      tela mostra "em breve", mesmo com todo o resto pronto.
- [ ] Módulo nativo novo (`react-native-purchases`) — a próxima build
      precisa ser `eas build` de verdade, não dá pra entrar via
      `eas update`/OTA (só manda JS/assets, não código nativo novo).

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

#### Duas ideias novas de produto (aprovadas pelo Rilson, 2026-08-22 — não é código ainda, é conceito registrado)

> Pergunta que gerou isto: "se você fosse usuário, o que faria desse
> app um dos seus favoritos?". A resposta comum foi: o diferencial de
> cuidador↔paciente hoje é só vigilância (checkmark de tomou/não
> tomou) — falta virar **vínculo**, não só monitoramento.

- [x] **Reação rápida do cuidador — implementado 2026-08-22.**
      `dose_logs.reacted_by_user_id`/`reacted_at`, endpoint
      `POST /dose-logs/{id}/react` (`ReactToDoseLog`), notifica o dono
      do perfil ("Alguém pensou em você"), não notifica quem reage à
      própria dose. Testado (`DoseLogReactionTest`). **UI implementada
      2026-08-22**: coração tocável em Hoje pro cuidador (`isCaregiverView`,
      `activeProfile.is_owner === false`), coração informativo (não
      tocável) pro dono quando alguém já reagiu. `reacted_at`/
      `reacted_by_name` agora vêm na resposta de `doses/today`.
- [x] **Resumo semanal como afirmação — implementado 2026-08-22.**
      A infra já existia (`SendWeeklyAdherenceSummary`, rodava só pro
      dono); estendida pra também notificar colaboradores aceitos com
      mensagem diferente ("Essa semana, {nome} tomou X de Y doses —
      você está fazendo diferença"), não o mesmo relatório percentual
      que o dono recebe. Testado.
- [x] **Marcos de significado, não números arbitrários — implementado
      2026-08-23.** O marco de streak (7/30/60) já existia; trocado o
      "🎉 Parabéns! X dias seguidos" genérico por frase própria por
      marco ("Uma semana completa" / "Um mês completo" / "Dois meses
      seguidos" + texto que celebra hábito formado, não placar). Sem
      pontos/ranking, como decidido.
- [x] **"Resumo pra consulta" — implementado 2026-08-23** (versão texto
      compartilhável, não PDF ainda). `GenerateConsultationSummary`
      (30/60/90 dias, % de adesão + lista de doses perdidas com
      nome+data/hora; pulado de propósito não conta como perdida),
      endpoint com o mesmo paywall de profundidade do `weekly-adherence`,
      botão "Compartilhar resumo pra consulta" no Histórico via Share
      nativo. PDF de verdade (formatação, layout pra imprimir) fica
      como evolução futura, não bloqueia o valor real (o texto já é
      levável pra consulta como está).
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
- [x] Termos de uso — item desatualizado (2026-08-22): página já
      existe (`api/resources/views/terms.blade.php`, 121 linhas, rota
      `/termos` real), não é só a política de privacidade
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

---

---

---

## Recursos Estratégicos de Experiência e Privacidade (Aprovados 2026-08-23)

> Recursos estratégicos para elevar o uso prático do paciente, relatórios médicos e soberania de dados.

- [x] **Relatório de Adesão ao Tratamento para Consulta Médica (PDF em 1 clique)** (2026-08-23):
  - Botão no Histórico de doses para gerar relatório formatado dos últimos 30 dias.
  - Layout limpo em HTML (`lib/reportHtml.ts`) para visualização/impressão PDF com taxa de adesão %, doses tomadas vs. agendadas, tabela de ocorrências não tomadas e grade de medicamentos ativos.
- [x] **Modo Privacidade (Mascarar Nomes no Dashboard)** (2026-08-23):
  - Alternador rápido no topo do dashboard (ícone de olho 👁️) para ocultar ou mascarar os nomes dos remédios (`••••••••`), com Zustand store persistente localmente (`privacyStore.ts`) e aplicação global em todas as telas (Hoje, Remédios, Histórico e Estoque).
- [x] **Notificações Web Push Nativas (`assidua.narniano.com`)** (2026-08-23):
  - Integração com a API nativa de notificações do navegador (`services/notifications.web.ts`) permitindo solicitar permissões e emitir alertas de medicação/estoque diretamente no sistema operacional (desktop/notebook).
- [x] **Ocultar Ações Restritas para Cuidadores (Perfil Compartilhado)** (2026-08-23):
  - Ocultados os botões de criação (`+` FAB) e alteração estrutural de cadastro para cuidadores (`activeProfile.is_owner === false`), exibindo um selo discreto de "Modo Cuidador".
- [x] **Banner Indicador de Conexão Offline** (2026-08-23):
  - Componente global `OfflineBanner.tsx` montado no layout raiz do app, exibindo um alerta informativo via `@react-native-community/netinfo` sempre que o dispositivo estiver sem internet.
- [x] **Soberania dos Dados do Paciente (Exportação Total JSON/CSV)** (2026-08-23):
  - Suporte à geração e download do histórico completo em JSON e CSV (tabela compatível com Excel/Google Sheets com BOM UTF-8) no backend Laravel e modal de seleção na tela de Perfil.
