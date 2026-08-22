# Naming — decisão de marca pré-L0

> Criado 2026-08-22 quando o projeto entrou em pausa por colisão de
> nome ("Meus Remedios" já existia na App Store desde 11/2025 — ver
> ROADMAP, seção ⚖️).

## Nome final: **ASSÍDUA** (decidido 2026-08-22)

- Grafia oficial: **Assídua** (com acento, é a grafia correta em
  português). O acento só existe na forma escrita estilizada
  (logo, nome no app) — domínio, handles, bundle id e tudo que
  precisa ser digitado usam a forma sem acento (`assidua`), que é
  como todo domínio/handle funciona sempre, não uma solução de
  contorno específica daqui.
- Raiz: "assíduo/assídua" — é literalmente o termo de adesão ao
  tratamento, carrega fidelidade/constância. Combina com a
  filosofia do Rilson sem precisar copiar marca com A Biblioteca
  (coerência de **valores**, não de identidade visual — ver conversa
  2026-08-22).
- Verificado (2026-08-22, triagem web + checagem fonética): sem
  colisão de app no mesmo nicho, sem trocadilho vulgar em PT/EN/ES.

### Identificadores aplicados

| Item | Valor |
|---|---|
| Nome exibido | Assídua |
| slug/scheme (Expo) | `assidua` |
| bundle id | `com.assidua.app` |
| domínio web | `assidua.narniano.com` |
| domínio API | `api-assidua.narniano.com` |
| serviços Docker | `assidua-api`, `assidua-web` |
| e-mail | `assidua@narniano.com` |
| comando Artisan | `assidua:merge-duplicate-accounts` |
| repo GitHub | github.com/rilsonjoas/assidua |

## Por que não Cuidia (escolha anterior, revertida no mesmo dia)

Cuidia foi a primeira escolha, chegou a ser aplicada no código e
revertida horas depois — registrado aqui pra não repetir o erro.
Motivo: falado rápido em português, "Cuidia" abre a leitura "cu em
dia"/"cuidjia" (o "cui-" colapsando em "cu" + o "di" palatalizado
do PT-BR). Não é a leitura óbvia, mas é exatamente o tipo de
trocadilho que a internet brasileira acha sozinha e vira piada — pra
um app de cuidado com idoso, isso pesa mais que a média. Achado do
próprio Rilson, não da triagem técnica — a lição: checklist de
colisão de marca (rodado certo) não cobre "soa mal em voz alta",
são checagens diferentes. As duas passaram a ser feitas juntas daqui
pra frente.

## Por que não os outros sobreviventes

- **HoraMed** — só funciona em PT, não lê bem em EN.
- **Laudes** — associação religiosa forte demais pro público geral
  (mesmo sendo termo obscuro o suficiente pra não soar como
  doutrina, o risco foi considerado alto demais).
- **Cuidia** — ver seção acima.
- **Matina / Tércia** — não descartados por defeito, ficam registrados
  como plano B caso "Assídua" esbarre em algo no checklist oficial
  abaixo.

## Critérios usados (o nome precisa passar em tudo)

1. Distintivo — coined/arbitrário > descritivo (registro no INPI não
   é objetivo, mas nome fácil de registrar é nome fácil de diferenciar)
2. Internacional: lê-se bem em pt-BR, EN e ES, **sem trocadilho ruim**
   (inclui leitura fonética torta, não só tradução)
3. Semântica remota mas presente: medicação/hora/tratamento/cuidado
4. Curto (≤3 sílabas), claro ao ouvido (teste da avó)
5. Domínio `.com`/`.app` plausível + handles sociais livres
6. Zero apps grandes homônimos nas stores (BR, US, PT) **no mesmo nicho**
   — colisão em setor diferente é tolerável, já que não há registro
   INPI em jogo (decisão do Rilson, 2026-08-22, por custo)

## Checklist oficial ainda pendente pra "Assídua"

> A triagem web (abaixo) substitui parte disso, mas não é a busca
> oficial nas lojas BR nem teste de voz com outra pessoa.

- [ ] App Store + Play Store BR: busca exata "Assídua"/"Assidua"
- [ ] Domínio `assidua.com` / `assidua.app` disponível
- [ ] Handles sociais (@assidua) disponíveis
- [ ] Falar em voz alta pra alguém (PT) — confirmação humana do que
      já foi checado aqui

## Execução já feita (2026-08-22)

- [x] Nome escolhido, identificadores definidos (tabela acima)
- [x] Find-replace mecânico em `meus-remedios` (app.json, eas.json,
      i18n, telas, testes, e-mails, `.env.*`, comando Artisan) —
      cuidado tomado pra não confundir a **marca** ("Meus Remédios"/
      "Cuidia") com o **vocabulário genérico do domínio** ("remédio"
      = medicação, que continua sendo assunto do app)
- [x] `hetzner-infra`: pasta renomeada (`git mv`), docker-compose,
      README, Makefile, RECUPERACAO.md, ARCHITECTURE.md atualizados
- [x] Repositório GitHub renomeado → github.com/rilsonjoas/assidua
- [x] VPS: `/opt/meus-remedios` → `/opt/cuidia` → `/opt/assidua`
      (precisou `sudo`)
- [ ] Nada commitado ainda em nenhum dos 2 repositórios — revisar
      `git diff` antes

### Não tocado de propósito (recursos vivos, não é texto)

Nome do banco Postgres (`meus_remedios_db`), usuário (`remedios_app`),
volume Docker (`remedios-storage`) — renomear isso de verdade exige
`ALTER DATABASE`/`ALTER ROLE` + migrar o volume, não um find-replace.
Documentação (`RECUPERACAO.md`, `ARCHITECTURE.md`) continua citando
esses nomes reais de propósito, pra não mentir sobre o estado da VPS.

### Deixado de lado por ser log histórico, não estado atual

`MIGRATION.md` e os exemplos em `PADRAO-DE-ENGENHARIA.md` continuam
dizendo "meus-remedios" — são registro datado de quando aconteceu,
não precisam ser reescritos. Avisar se quiser mesmo assim.

### Logo — nenhuma ação necessária

O ícone (coração + relógio) não tem texto embutido em nenhuma versão
(app icon, watermark da Home). Serve pro Assídua como está.

## Painéis externos — ordem de dependência real

1. [x] **DNS** — registros A criados no cPanel (2026-08-22):
   `assidua.narniano.com` e `api-assidua.narniano.com` →
   `167.233.254.53`. Traefik + Let's Encrypt (HTTP-01) fazem o resto
   sozinhos assim que o deploy subir os containers com os labels novos
   — não precisa de passo manual de certificado.
2. **GCloud OAuth** — ainda pendente. Client/redirect URI pro domínio
   novo. Login Google já está ao vivo hoje, então fazer antes/junto do
   próximo deploy, não depois.

### Deploy — é automático, não é `make deploy` na mão

`deploy.yml` dispara sozinho no push pra `main` do repo do app: builda
a web, publica em `/opt/assidua/web`, entra na VPS via SSH, dá
`git pull` no app **e** no `hetzner-infra` (branch `master`, não
`main` — achado real já documentado no próprio workflow), recria os
containers, roda smoke test contra os domínios novos. Únicos passos
manuais antes de empurrar:
1. VPS: `sudo mv /opt/cuidia /opt/assidua` (senão o `cd` do workflow
   falha — de propósito, "falhar alto sempre")
2. Desktop: commit + push do `hetzner-infra` pro `master` primeiro
   (o deploy do app puxa ele automaticamente lá dentro)
3. Desktop: commit + push do app pro `main` — dispara tudo
3. **Play Console** — segue bloqueado pelos US$ 25, sem relação com
   o nome. Usar `com.assidua.app` quando destravar.
4. **RevenueCat** — só importa quando existir listagem na Play Store.
   Sem urgência.
5. **Umami** — site novo quando for conveniente.
6. **Sentry — não precisa.** DSN não depende do nome público do app;
   trocar o rótulo em Settings → General é só cosmético, opcional.

## Triagem de colisão — histórico completo (2026-08-22, Claude)

> Busca web geral, não é INPI nem busca oficial nas lojas BR — achar
> um app ativo no mesmo nicho elimina com confiança; não achar nada
> é sinal favorável, não é aprovação.

### Eliminados — colisão confirmada no mesmo nicho

| Nome | Achado |
|---|---|
| **Ritmia** | App ativo + marca ™ (Heart Sentinel, monitoramento cardíaco) |
| **Dosely** | Múltiplos apps ativos, mesmo nicho exato |
| **Dosemate** | App ativo — "Never Miss a Dose", mesmo nicho exato |
| **Medora** | App ativo — "Health & Pill Tracker", mesmo nicho exato |
| **Zelo** | "Plataforma Zelo Saúde" já existe — cuidador+familiar, financiado pela FIOCRUZ, quase o mesmo produto |
| **Remedia** | Rede de farmácias na Áustria |
| **Novira** | "Novira Therapeutics" — farmacêutica |
| **Cuidia** | Ver seção "Por que não Cuidia" acima (trocadilho, não colisão de marca) |

### Setor diferente — tecnicamente livre

Sanavia (biotech oncologia), Alvora (robótica B2B), Amavia (app
automotivo), Fidare (consultorias — atenção a `Fidari.care`, nome
próximo), Âncora (seguros/coaching de saúde), HoraMed (limpo, mas
fraco em EN).

### Ideia das horas litúrgicas (veio não explorada, mantida como plano B)

As horas canônicas (Matinas, Laudes, Prima, **Tércia**, Sexta, Noa,
Vésperas, Completas) são um sistema histórico de horários fixos do
dia — mesma lógica de um lembrete de medicação. Nenhuma healthtech
BR minerou esse campo. **Matina** e **Tércia** sobrevivem como plano
B; **Laudes** descartado (religioso demais), **Vésper(a)** descartado
(Vesper Lynd/007), **Noa** descartado (soa "nona" = vovó em it/es).

## Checklist de renomeação (referência, já aplicado acima)

### Código / infra
1. `app.json`: name/slug/bundle id — feito
2. i18n pt/en/es — feito (en/es nunca tiveram o nome hardcoded)
3. Assets: logo — não precisa, ver seção acima
4. Wordmarks nas telas (WebTopNav, login, AlertDialogs) — feito
5. `api/.env`, `MagicLinkMail` — feito
6. README/ROADMAP do repo — feito

### Serviços externos — ver "Painéis externos" acima

### Documentos/marketing
7. Vault (Projetos/, Monetização, Marketing), Portfólio, LinkedIn —
   pendente, baixa prioridade (não bloqueia o projeto)
8. Contas de divulgação futuras já nascem com "Assídua"
9. **Ficha da loja (ASO) — necessária, não é polimento.** Nome coined
   perde a autoexplicação que "Meus Remédios" tinha de graça; quem
   busca "lembrete de remédio" só acha o Assídua se subtítulo/keywords
   carregarem esses termos. Copy pronta (2026-08-22):
   - Subtitle iOS (30c): "Lembrete de remédios e cuidado"
   - Keywords iOS (100c): `medicamento,dose,horario,idoso,cuidador,tratamento,adesao,familia,saude,dosagem,alarme`
   - Short description Play (80c): "Lembrete de remédios para idosos, com acompanhamento do cuidador à distância"
   - Descrição completa: rascunho na conversa 2026-08-22 — 4
     parágrafos (o que é, como funciona, diferencial do cuidador
     remoto, pra quem é), levar pro texto final do painel na hora do
     L0

## Status

- [x] Nome decidido e aplicado no código — 2026-08-22
- [ ] Checklist oficial (stores/domínio/handles) — pendente
- [ ] Painéis externos (ordem acima) — pendente
- [ ] Retoma projeto pelo gate no topo do ROADMAP
