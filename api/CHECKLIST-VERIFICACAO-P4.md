# Checklist de verificação manual — P4 (dose de resgate)

Rode **num aparelho de verdade**, com build de desenvolvimento, **antes**
de mandar P4 para produção. Os testes automatizados provam a lógica; eles
não provam o aparelho, a fila real e a ordem dos eventos.

> Por que este passo existe: a suíte roda em SQLite e o app roda em
> SQLite também (expo-sqlite) — mas a **fila offline do aparelho** só é
> exercitada de verdade com o banco local real, com o app em background e
> com a rede caindo de verdade. Nenhum teste de CI faz isso.

## Antes de começar

- [ ] Build de dev no aparelho (ver `CLAUDE.md` — EAS Build, **não** Expo Go)
- [ ] Perfil de teste com 2 medicamentos: um **com horário** e um
      **de resgate** (marcar "só quando precisar" no cadastro)

> ### ⚠️ Onde este teste acontece: no backend de PRODUÇÃO
>
> Verificado em 2026-09-27: **não existe staging.** O canal `preview`
> do EAS aponta para `api-assidua.narniano.com`, que é o **backend real**
> (o `api-remedios.narniano.com` citado no `CLAUDE.md` não resolve mais
> no DNS — hostname velho).
>
> Duas consequências, e as duas importam:
>
> 1. **A migration do P4 tem que estar no servidor ANTES do app.** Sem as
>    colunas `is_prn` e `client_key`, o app manda campos que o backend
>    não conhece. Ordem: backend primeiro, app depois.
> 2. **Este teste escreve no banco de produção.** Use um perfil
>    descartável, com nome obviamente de teste. Nada aqui deve tocar em
>    dados de paciente real — e se o banco tiver dado real, apagar o
>    perfil de teste depois.
- [ ] Reinicie o app após cadastrar o resgate, para a
      tela Hoje recarregar

## 1. O registro simples (com internet)

- [ ] Abrir o remédio de resgate → botão **"Registrar dose"** aparece
- [ ] Tocar em "Registrar dose" no modal → toast de confirmação
- [ ] Abrir o **Histórico** → a dose aparece **naquele dia**, com a hora
      real, marcada como dose de resgate
- [ ] Tocar de novo no mesmo botão → **cria uma segunda dose** (é
      esperado: são duas tomadas diferentes)
- [ ] A dose de resgate aparece na **Home**? Ela **não deve** aparecer
      como "dose prevista" — ela não tem horário

## 2. O caminho offline (o que mais importa)

- [ ] Ativar **modo avião**
- [ ] Registrar uma dose de resgate → deve aparecer toast **"aguardando
      internet"** (não "salvou" genérico)
- [ ] Abrir o **Histórico** → a dose **tem que aparecer** com o rótulo
      "aguardando internet" e um ícone de upload
      *(se não aparecer, o registro sumiu: é o bug que o teste de
      `pendingPrn` cobre, mas confirme no aparelho)*
- [ ] Registrar **mais uma** dose de resgate ainda offline → as duas
      linhas no Histórico
- [ ] Desligar o modo avião, **esperar o app drenar a fila**
- [ ] Abrir o Histórico → as doses continuam lá, agora **sem** o rótulo
      "aguardando internet", e **sem duplicar**
- [ ] Registrar a MESMA dose de novo agora online → não pode criar
      duplicata (a `client_key` protege disso)

## 3. O relatório (o mais crítico para o médico)

- [ ] Na tela de Histórico → **Exportar relatório / PDF**
- [ ] Abrir o PDF: a dose de resgate aparece?
- [ ] A coluna "Previsto" mostra **"Fora de horário previsto"**?
- [ ] Aparece **"Invalid Date"** em qualquer lugar? *(não deve)*
- [ ] O resumo mostra o cartão **"Doses de Resgate"**?

## 4. A transição (o furo que corrigi)

- [ ] Pegar o medicamento **com horário** e marcar "só quando precisa"
- [ ] **Reiniciar o app**
- [ ] Abrir a **Home** → aquele medicamento **não gera mais dose**
      *(se ainda gerar dose com horário, o furo voltou)*
- [ ] O histórico antigo dele **continua lá** (não pode ter sumido)
- [ ] Voltar para "com horário" → os horários **reaparecem** e a dose
      volta a ser gerada

## 5. Cuidador

- [ ] Entrar com a conta de cuidador → o resgate é visível?
- [ ] O cuidador consegue registrar dose de resgate do paciente?
      *(decisão de produto: cuidador PODE — ver ROADMAP)*

## Se algo falhar

- [ ] Anotar **o passo exato** e o que apareceu na tela
- [ ] Se for offline, conferir se a fila drena: o sintoma "não some
      depois de sincronizar" é o mais grave (dados duplicados)
- [ ] **Não** fazer push com P4 enquanto qualquer item acima estiver
      falhando

## Critério de aprovação

Tudo marcado. Se qualquer item falhar, o P4 **não vai para produção**.
Os itens 2, 3 e 4 são os que a suíte automatizada **não** cobre — são
justamente os que justificam este passo.
