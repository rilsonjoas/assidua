import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { type, fontSizeMigration } from '../constants/tokens';

// Piso tipográfico.
//
// O app tinha `fontSize: 10` (7 usos) e `11` (3 usos) — ilegíveis para o
// público de baixa visão que é a razão de o app existir. Este teste existe
// porque ninguém pega isso olhando o hex: um `10` num badge passa
// despercebido até alguém com cataraca abrir a tela.
//
// Escopo, por decisão de 2026-09-28:
//   - fiscaliza ABAIXO DE 12 (`10`, `11`) — os ilegíveis de verdade;
//   - NÃO fiscaliza `12`, que é exceção documentada em `type.microTight`
//     (1px do piso, mas Capacitor em badge; subir os 27 usos seria diff
//     largo com ganho visual zero);
//   - NÃO varre `__tests__/`, porque teste usa `10` como fixture legada
//     de propósito, e cobrar o teste é cobrar a si próprio.
//
// É um teste de fonte, não de estilo: varre os .tsx e falha se aparecer
// valor proibido. É propositalmente blunt — não importa se está num
// `StyleSheet`, inline, ou "só desta vez". Se for preciso, o caminho é
// subir o piso aqui e no DESIGN.md, não abrir exceção silenciosa.

const ILEGIVEL_ABAIXO = 12; // barra o que é ilegível; 12 é a exceção autorizada
const RAIZ = join(__dirname, '..');

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.expo' || entry === '__tests__') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('Escala tipográfica', () => {
  it('o piso e a excecao estao onde a documentacao diz', () => {
    expect(type.micro).toBe(13); // o piso
    expect(type.microTight).toBe(12); // a exceção documentada
  });

  it('a escala e crescente e sem valores repetidos', () => {
    const values = Object.values(type);
    const crescente = [...values].sort((a, b) => a - b);
    // Ordenada de cima pra baixo (critical -> microTight), então a
    // comparação é com o inverso: nada pode repetir, que é como sinônimo
    // de token nasce.
    expect(values).toEqual([...crescente].reverse());
    expect(new Set(values).size).toBe(values.length);
  });

  it('nenhum .tsx do app usa fontSize ilegivel (abaixo de 12)', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(RAIZ)) {
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        const m = line.match(/fontSize:\s*(\d+)/);
        if (m && Number(m[1]) < ILEGIVEL_ABAIXO) {
          offenders.push(`${relative(RAIZ, file)}:${i + 1} → fontSize: ${m[1]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  // Se alguém subir um valor na escala e esquecer de mapear, a migração
  // seguinte cai no `undefined` e o estilo quebra em silêncio. Melhor
  // falhar aqui.
  it('todo valor da migracao de fontSize esta na escala', () => {
    const escala = new Set<number>(Object.values(type));
    for (const para of Object.values(fontSizeMigration)) {
      expect(escala.has(para)).toBe(true);
    }
  });
});
