# Correções de interface — 2026-09-28

Complemento técnico do bloco "Sessão de 2026-09-28" do `ROADMAP.md`, que
registra as **decisões**. Este arquivo registra o **como** e o **porquê
técnico**, para quem for mexer nesse código depois.

Baseline da sessão: mobile **48 suítes / 455 testes** → **51 suítes / 500
testes**, typecheck limpo. A API não foi tocada nesta sessão (só lida).

---

## 1. O achado que mudou a direção do trabalho

A tentativa inicial era "passar o design do Stitch para o app". Virou outra
coisa, porque a comparação entre o PRD gerado e o código real mostrou que as
duas coisas mediam coisas diferentes.

O PRD descreve a Home em 4 bullets. A Home real:

| Métrica | Valor |
| :--- | ---: |
| Linhas | 1.737 |
| Imports | 30 |
| Condicionais | 92 |
| Telas no total | 9.660 linhas, 20 componentes |

Um `DESIGN.md` descreve **tokens** — cor, tamanho, raio, espaçamento. Ele não
descreve **produto**: qual estado aparece quando a dose atrasa, o que o app
pergunta quando não sabe, o que nunca pode ser mostrado. Quem não tem essa
informação preenche o vazio, e preenche com o que é plausível.

Foi assim que apareceram QR code para consulta médica, login social e alertas
de áudio/háptica — nenhum existe no app. E foi assim que "AssCarbon", um erro
de digitação meu, chegou até um documento de produto.

**Conclusão que virou regra:** nenhuma ferramenta que não veja o código pode
definir o produto. Design system ela define, e define bem.

---

## 2. Geometria: onde estava a incoerência de verdade

### O diagnóstico

`theme.ts` tinha 21 tokens de cor, todos com teste de contraste. Espaçamento e
raio: **nenhum**. A contagem real do código:

| | Antes | Depois |
| :--- | :--- | :--- |
| Tokens de cor | 21 | 21 |
| Tokens de espaçamento | **0** | 11 |
| Tokens de raio | **0** | 6 |
| `borderRadius` distintos | 20 | 6 |
| `fontSize` distintos | 15 | 11 |
| Números mágicos de geometria | **872** | **0** |

Valores de raio que existiam: 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 19, 20,
22, 28, 32, 36, 48, 56. Cada um decidido sozinho, num arquivo, sem saber dos
outros.

É por isso que duas telas do mesmo app pareciam feitas por pessoas diferentes.
**Não era falta de paleta — era falta de geometria.**

### O que mudou de verdade

**231 dos ~1.400 pontos migrados mudaram de tamanho.** A tabela completa está
em `docs/tokens-derivacao.md`. O resumo:

- Maioria: 2px (`padding` 14→12, `gap` 6→4, `borderRadius` 10→12)
- `fontSize` 10 e 11 → 13: **8 pontos**, ilegíveis, corrigidos
- `fontSize` 12 → 12: mantido, exceção documentada (§5)
- `borderRadius` 32/36/48/56 → `full`: eram círculos perfeitos (`width ===
  height` nos quatro casos), a decisão certa

O único valor de espaçamento que saiu da escala de propósito foi o
`paddingTop: 56` do cabeçalho da Home (→ 40). Era um safe-area manual e
**precisa ser conferido no aparelho** — é o único ponto da migração que muda
a primeira dobra.

### Dois erros próprios, registrados porque são o tipo que se repete

**Erro 1 — achatamento de título.** A primeira escala de fonte tinha
`critical: 17` como teto, e o mapeador enviou 18, 19, 20, 22, 24, 26 e 28
todos para 17. O título de login encolhia de 28px para 17px e a hierarquia
inteira da tela sumia. **Só apareceu porque medimos o diff em pixel**,
não porque o compilador reclamou. A escala ganhou `display` (28), `metric`
(26), `homeHeader` (24), `heading` (22) e `section` (20) — todos **título**,
nenhum dado clínico. Hierarquia por função: `critical` (17) é o dado da dose e
fica **abaixo** de todos os títulos, e é o que importa.

**Erro 2 — token dentro de string.** `lib/reportHtml.ts` monta o resumo em PDF
que o paciente leva ao médico. O script escreveu `spacing.none` **dentro de
uma string de CSS**, o que produz um documento com CSS inválido. Revertido com
`git checkout`. O teste de geometria agora tem `CSS_EM_TEXTO` com
justificativa escrita — a exceção é do **conteúdo**, não do nome do arquivo.

---

## 3. Correções de leitura por tela

Auditoria contra o checklist de `qualidade-de-interface`. As três abas
divergiam em 9 dos mesmos padrões — abaixo vai o que era **erro**, não
diferença de gosto.

### Histórico — a linha renderizava em coluna

`history.tsx`: `row` estava com `flexDirection: 'column'`, e `rowTop` e
`rowA11y2` **existiam, estavam documentados e não eram aplicados** — as únicas
ocorrências de cada um eram a definição e o comentário. Introduzido em
`3dff0b6` ("dose de resgate ponta a ponta").

Efeito: hora, nome, dose, nota e badge empilhavam verticalmente, um cartão por
dose. Para quem precisa varrer o histórico, a lista inteira deixava de ser
linhas e virava coluna.

Correção: a linha tem **duas faixas** — `rowTop` (hora, barra de cor, nome,
dose, badge) e a nota/ação abaixo, exatamente como o comentário já dizia. A
dose de resgate ganhou `rowPrn`, porque não tem nota nem status e sempre foi
uma faixa única.

Nenhum teste pegaria isso: `flexDirection` não é asserção de nenhum deles.

### Histórico e Estoque — falha de rede virava afirmação falsa

`AdherenceCalendar` e `AdherenceChart` liam só `data` da query:

- Calendário: `data = []` preenchia o mês inteiro com `due: 0`, pintado de
  cinza. Idoso vê **"você não tomou nada em nenhum dia do mês"** — e é falso,
  é só falha de rede.
- Gráfico: `if (data.length === 0) return null` — sumia sem explicação.

Dois defeitos opostos na mesma tela, nenhum certo. A distinção que importa e
não existia no código: **"sem dado" (o app sabe e não há) ≠ "não consegui
perguntar" (o app não sabe)**. Agora os dois têm loading e erro, com "Tentar
de novo", e o grid não renderiza no erro.

### Remédios e Estoque — respostas opostas sobre o mesmo dado

| | Remédios | Estoque |
| :--- | :--- | :--- |
| Estoque nunca informado | **"0 unid em estoque"** | "não informado — toque em Editar" |

`isStockNeverSet` existe em `lib/stockQuantity.ts` **desde 2026-09-05** e
estava aplicado só na metade certa. "0 em estoque" para um idoso significa
"estou sem remédio" — ele vai à farmácia ou desiste de tomar o que tem em
casa.

Agora as duas usam, e há teste de contrato **nos dois sentidos**: nunca
informado ≠ zerado de verdade. O contraponto importa — sem ele, os dois casos
virariam a mesma string e o app perderia a distinção que a auditoria de
2026-09-05 criou.

Remédios usa `stock.neverSetShort` ("Estoque não informado") em vez da string
longa, porque a longa diz "toque em Editar" e lá não há botão.

### Alvos de toque

| Onde | Antes | Agora |
| :--- | :--- | :--- |
| Salvar nota (ícone) | 22×22 | 44×44 |
| Cancelar nota (ícone) | 22×22 | 44×44 |
| Campo de quantidade do estoque | ~28 | 48 |

O `TextInput` da nota já tinha `minHeight: 44` desde 2026-09-05 — os dois
botões ao lado dele é que estavam espremidos. Salvar e cancelar nota é
justamente o caminho de quem **não usa teclado**, então era o pior lugar para
alvo pequeno.

O `hitSlop: 8` do botão "Anotar" foi **removido**: ele ampliava a área de
toque sem dizer nada visualmente, e agora existe um alvo real de 44px.

### "Definir" x "Adicionar" — ações opostas, mesmo peso

`stock.tsx`: os dois botões com `flex: 1`, mesma altura, mesma borda. Um
**soma** (`addQty`), o outro **substitui** (`setQtyAbsolute`). Entender
"Definir 30" como "tenho 30" e tocar no botão errado apaga o estoque real, sem
confirmação e sem desfazer.

A igualdade de peso era decisão deliberada (higiene visual). **Decisão do
Rilson em 2026-09-28:** manter o peso igual e **explicar a diferença na tela**
— "soma ao total" / "substitui o total", logo acima dos botões, e dentro do
`accessibilityLabel`.

Hierarquizar foi considerado e rejeitado: esconderia justamente o botão
perigoso. O teste de toque foi atualizado para exigir que a dica esteja no
rótulo de acessibilidade, não só desenhada.

### i18n

- `okLabel="OK"` estava **hardcoded em inglês** no `useAlertDialog.tsx`,
  fora do i18n, aparecendo em pt e es. Agora "Entendi" / "Got it" /
  "Entendido". (Eu tinha dito antes que o `unit` do estoque não era
  editável; a API aceita desde sempre, em `StockController.php:30`.)
- As três mensagens de erro de carga repetiam **literalmente o título** que já
  está acima e jogavam fora o "Nada foi apagado" — a única frase que
  tranquiliza quem caiu no estado de erro. Todas voltaram a dizer só isso.

---

## 4. A rede de testes

Quatro arquivos novos. Sem eles, em três semanas a pilha volta — e o que
volta é sempre o que é difícil de ver.

| Arquivo | O que trava |
| :--- | :--- |
| `design-tokens.test.tsx` | Número mágico de geometria em `app/` e `components/` |
| `typography.test.tsx` | `fontSize` abaixo de 12 (10 e 11) |
| `design-doc.test.ts` | `DESIGN.md` divergindo do código |
| `color-contrast.test.tsx` (ampliado) | `error` nos dois temas; `onSuccess` sobre `success` |

`color-contrast.test.tsx` ganhou três casos que **não existiam**: `error` no
claro e no escuro, e `onSuccess` sobre `success` — o Toast, que é cor de
**fundo** e a suíte só testava cor de texto.

`design-doc.test.ts` compara o frontmatter do `DESIGN.md` com o código. Se
divergir, **o código está certo** e o documento é o errado. Já pegou um token
`on-success` que existia no código e não no documento.

---

## 5. Decisões que ficaram como exceção, e por quê

**`fontSize: 12` — 27 pontos mantidos.** A regra de 13px é do ROADMAP e do
`DESIGN.md`. O 12 fica 1px abaixo. Ficou porque trocar 27 chamadas por 1px é
diff largo com ganho visual zero. O teste fiscaliza **abaixo de 12**, ou
seja, o que é ilegível de verdade, e a exceção está escrita em
`type.microTight`.

**`textMuted` abaixo de 4.5:1.** Documentado desde a auditoria de 2026-08-14:
é o tom mais claro dos três níveis, para legenda e ícone, nunca para corpo de
texto pequeno. O teste cobra 3:1.

**`CSS_EM_TEXTO` no teste de geometria.** Exceção nomeada, com a razão
escrita (§2, erro 2). A exceção é do conteúdo, não do nome do arquivo.

---

## 6. ⏳ Pendência: a unidade errada já gravada em produção

A correção do app é o campo próprio em chips na aba Estoque. Ela resolve o
que a pessoa vê e o que ela grava a partir de agora. **Não resolve o que já
está no banco.**

`MedicationController.php:66` grava a unidade da dose em `create()`, então
toda linha de estoque criada até hoje pode ter `unit = 'mg'`, `'ml'`, etc.
A `StockController.php:30` aceita `'unit'` no update — o app é que nunca
mandava, e agora manda.

Escrevi e **removi** uma migration para isso, por dois motivos:

1. Não tenho PHP nem acesso ao banco de produção aqui — não rodei, não
   validei, e uma migration que apaga dado com base numa lista de palpite
   ("unidades de dose prováveis") não vai para o repo sem verificação.
2. O problema dela é de desenho: trocar `mg` por `comprimidos` é **inventar
   dado**. Só dá para desfazer a cópia com segurança quando a unidade do
   estoque é a mesma da dose — aí é certo que veio daquele `create()`.

### Diagnóstico antes de decidir

Rodar em produção (ou num dump), para saber a escala do problema:

```sql
-- 1. Quantas linhas têm a unidade igual à da dose (candidatas à correção)
SELECT COUNT(*) AS copiadas_da_dose
FROM stock_items si
JOIN medications m ON m.id = si.medication_id
WHERE si.unit = m.unit;

-- 2. Quais unidades existem de fato no estoque hoje
SELECT unit, COUNT(*) AS n
FROM stock_items
GROUP BY unit
ORDER BY n DESC;

-- 3. Quais são as unidades de dose, para comparar com (2)
SELECT unit, COUNT(*) AS n
FROM medications
GROUP BY unit
ORDER BY n DESC;

-- 4. As duas telas já discordam sobre o mesmo item? (o bug do "0 unid")
SELECT si.medication_id, si.current_quantity, si.unit, si.last_updated_at
FROM stock_items si
WHERE si.current_quantity = 0 AND si.last_updated_at IS NULL;
```

A consulta (1) dá o número exato de registros afetados. Se for baixo —
provavelmente é, o app é de uso pessoal — a correção é manual pela tela de
Estoque, que já permite, e não vale uma migration. Se for alto, a consulta
(2) diz quais unidades existem e a migration pode ser escrita com dado, não
com palpite.

**Enquanto isso não for feito, o app funciona:** a pessoa corrige a unidade
na aba Estoque e o valor fica certo. O que permanece errado é o histórico
já gravado — nenhuma tela mostra a unidade do estoque em nenhum outro lugar,
então o efeito se limita aos cards de Remédios e Estoque, que passam a exibir a
unidade que a pessoa corrigiu.

---

## 7. O que não foi verificado

Isto é o que a suíte não cobre e precisa de olho humano:

1. **A reestruturação do Histórico é mudança de layout visível.** Duas faixas
   em vez de uma coluna. Precisa ser vista.
2. **O `paddingTop` do cabeçalho da Home** (56 → 40) muda a primeira dobra.
3. **O Toast no tema escuro** — único ponto cujo contraste mudou entre os dois
   temas.
4. **"Estoque não informado" e "doses"** aparecem em três telas.
5. **As 231 mudanças de geometria** são pequenas no diff e visíveis no
   aparelho.

Nada foi commitado. `CLAUDE.md` e `ROADMAP.md` estavam com edições de estado
de deploy do Rilson e não foram tocados no código.
