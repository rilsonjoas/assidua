import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { spacing, rounded, type } from '../constants/tokens';

// Trava a geometria no token.
//
// Motivo: o app tinha 20 valores de `borderRadius` distintos e 15 de
// `fontSize`, todos hardcoded, nenhum vindo de token. A cor sempre esteve
// centralizada (`theme.ts` + auditoria de 2026-08-14), então o app
// "parecia correto" e mesmo assim não parecia um só produto — duas telas
// do mesmo app feitas por gente diferente. O teste é o que impede a pilha
// de voltar.
//
// Ele varre app/ e components/ e falha se sobrar geometria hardcoded.
// Exceções explícitas e nomeadas abaixo: nada de "pular esse arquivo",
// porque exceção sem dono vira norma em três semanas.

const RAIZ = join(__dirname, '..');

// Arquivos que geram HTML/CSS como TEXTO, não estilos React Native.
//
// `lib/reportHtml.ts` monta o resumo em PDF que o paciente leva ao
// médico. As medidas existem, mas dentro de template literal — `padding:
// 10px` é CSS de navegador, não estilo de tela. Trocar por `spacing.sm`
// ali quebra o documento silenciosamente: vira `padding: 8px` num
// arquivo que ninguém revisa visualmente. Já aconteceu uma vez nesta
// migração (2026-09-28) e o teste pegou.
//
// A exceção é do CONTEÚDO, não do nome do arquivo. Se o gerador passar a
// consumir `spacing`, a lista encolhe. Se outro arquivo começar a emitir
// HTML, entra aqui.
const CSS_EM_TEXTO = ['lib/reportHtml.ts'];

// Onde a geometria é *definida*, não consumida. `constants/tokens.ts`
// guarda os números por definição — cobrar token dele seria cobrar que o
// token não exista. Os dois arquivos de definição ficam fora da varredura.
const DEFINICOES = ['constants/tokens.ts', 'constants/theme.ts'];

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.expo' || entry === '__tests__') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) arquivos(full, acc);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

const GEOMETRIA = [
  { re: /borderRadius:\s*(\d+)/, nome: 'borderRadius' },
  { re: /borderTopLeftRadius:\s*(\d+)/, nome: 'borderTopLeftRadius' },
  { re: /borderTopRightRadius:\s*(\d+)/, nome: 'borderTopRightRadius' },
  { re: /borderBottomLeftRadius:\s*(\d+)/, nome: 'borderBottomLeftRadius' },
  { re: /borderBottomRightRadius:\s*(\d+)/, nome: 'borderBottomRightRadius' },
  { re: /fontSize:\s*(\d+)/, nome: 'fontSize' },
  { re: /padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*(\d+)/, nome: 'padding' },
  { re: /margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*(\d+)/, nome: 'margin' },
  { re: /gap:\s*(\d+)/, nome: 'gap' },
];

describe('Geometria vem de token', () => {
  it('a escala tem os tokens que a migracao usa', () => {
    expect(Object.values(rounded)).toContain(9999);
    expect(Math.min(...Object.values(type))).toBeGreaterThanOrEqual(12);
    expect(Math.min(...Object.values(spacing))).toBeGreaterThanOrEqual(0);
  });

  it('a excessao de CSS-em-texto ainda existe no disco', () => {
    // Arquivo listado e depois removido = teste virando letra morta.
    for (const f of CSS_EM_TEXTO) {
      expect(() => statSync(join(RAIZ, f))).not.toThrow();
    }
  });

  it('nenhum radius/fonte/espaço hardcoded sobrou em app/ e components/', () => {
    const offenders: string[] = [];
    for (const file of arquivos(RAIZ)) {
      const rel = relative(RAIZ, file);
      if (CSS_EM_TEXTO.includes(rel) || DEFINICOES.includes(rel)) continue;
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        for (const { re, nome } of GEOMETRIA) {
          const m = line.match(re);
          if (m) {
            offenders.push(`${rel}:${i + 1} -> ${nome}: ${m[1]}  ${line.trim().slice(0, 60)}`);
          }
        }
      });
    }
    // Este teste é a rede da migracao. Enquanto falhar, ainda ha numero
    // magico; quando zerar, a geometria e do design system.
    expect(offenders).toEqual([]);
  });
});
