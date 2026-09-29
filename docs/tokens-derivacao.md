# Derivação dos tokens de geometria

Gerado em 2026-09-28, durante a primeira migração de
`app/constants/tokens.ts`. Responde a uma pergunta que o diff sozinho não
responde: **o que mudou de tamanho em pixel, e o que não mudou.**

## A regra

Cada número mágico foi mapeado para o token mais próximo da escala. A

grande maioria é renomeação pura — `padding: 16` vira `padding: spacing.lg`

e vale exatamente 16px. O que segue é o que **não** é renomeação pura.

## Mudanças reais de pixel

| Propriedade | Antes | Depois | Pontos |
| :--- | ---: | ---: | ---: |
| `gap` | 10 | 8 | 26 |
| `borderRadius` | 10 | 12 | 23 |
| `gap` | 6 | 4 | 20 |
| `paddingVertical` | 14 | 12 | 13 |
| `borderRadius` | 14 | 16 | 10 |
| `marginTop` | 14 | 12 | 9 |
| `padding` | 14 | 12 | 9 |
| `paddingVertical` | 6 | 4 | 9 |
| `paddingVertical` | 10 | 8 | 8 |
| `marginBottom` | 10 | 8 | 6 |
| `fontSize` | 10 | 13 | 5 |
| `gap` | 14 | 12 | 5 |
| `marginBottom` | 6 | 4 | 5 |
| `marginTop` | 28 | 24 | 5 |
| `borderRadius` | 18 | 20 | 4 |
| `fontSize` | 18 | 20 | 4 |
| `marginBottom` | 14 | 12 | 4 |
| `marginRight` | 14 | 12 | 4 |
| `marginTop` | 6 | 4 | 4 |
| `paddingHorizontal` | 6 | 4 | 4 |
| `paddingHorizontal` | 14 | 12 | 4 |
| `borderRadius` | 5 | 8 | 3 |
| `fontSize` | 11 | 13 | 3 |
| `gap` | 3 | 2 | 3 |
| `marginTop` | 10 | 8 | 3 |
| `borderRadius` | 4 | 8 | 2 |
| `borderRadius` | 6 | 8 | 2 |
| `borderRadius` | 7 | 8 | 2 |
| `gap` | 5 | 4 | 2 |
| `paddingHorizontal` | 10 | 8 | 2 |
| `paddingHorizontal` | 22 | 20 | 2 |
| `paddingRight` | 14 | 12 | 2 |
| `paddingTop` | 10 | 8 | 2 |
| `paddingVertical` | 5 | 4 | 2 |
| `borderRadius` | 56 | 9999 | 1 |
| `borderRadius` | 22 | 28 | 1 |
| `borderRadius` | 32 | 28 | 1 |
| `borderRadius` | 15 | 16 | 1 |
| `borderRadius` | 48 | 9999 | 1 |
| `borderRadius` | 19 | 20 | 1 |
| `borderRadius` | 36 | 28 | 1 |
| `fontSize` | 19 | 20 | 1 |
| `marginBottom` | 28 | 24 | 1 |
| `marginLeft` | 14 | 12 | 1 |
| `marginRight` | 6 | 4 | 1 |
| `marginTop` | 18 | 16 | 1 |
| `marginTop` | 3 | 2 | 1 |
| `padding` | 18 | 16 | 1 |
| `padding` | 10 | 8 | 1 |
| `padding` | 1 | 0 | 1 |
| `paddingLeft` | 14 | 12 | 1 |
| `paddingVertical` | 18 | 16 | 1 |
| `paddingVertical` | 3 | 2 | 1 |
| `paddingVertical` | 7 | 8 | 1 |

**Total: 231 pontos** mudaram de tamanho. O restante dos

~1.400 pontos migrados é renomeação pura.

## O que foi revisado à mão

Duas categorias não podiam ser tratadas pela normalização, e foram

corrigidas caso a caso:

- **`fontSize` 18–28 era título**, não corpo. Login, cadastro,

  cabeçalho da Home, estado vazio, resumo do Histórico, bloqueio

  biométrico, PrivacyBlur. A primeira versão da escalatipográfica parava

  em 17 e achatou todos para `critical` — destruía a hierarquia e

  encolhia o título de login de 28 para 17. A escala ganhou

  `display` (28), `metric` (26), `heading` (22), `section` (20) e

  `homeHeader` (24) por causa disso.

- **`borderRadius` 32/36/48/56 eram círculos perfeitos** — `width ===

  height` nos quatro casos (ícone de onboarding 112, avatar 64, foto do

  remédio 96, ícone do Pro 72). Foram para `full`, que é a decisão

  certa, não um efeito colateral da escala.

## O que NÃO foi tocado

- `lib/reportHtml.ts` — gera o PDF do médico como **texto HTML/CSS**.

  `padding: 10px` ali é CSS de navegador. Converter quebrava o

  documento silenciosamente; aconteceu uma vez e o teste pegou.

- `constants/theme.ts` e este `constants/tokens.ts` — é onde a

  geometria é *definida*. Cobrar token deles seria cobrar que não

  existam.
