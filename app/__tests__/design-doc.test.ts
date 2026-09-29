import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { lightColors } from '../constants/theme';
import { spacing, rounded, type } from '../constants/tokens';

// O DESIGN.md é documentação — mas documentação que mente é pior do que
// nenhuma. Este teste compara os tokens do frontmatter com o código e
// falha se divergirem.
//
// Existe porque o arquivo é editado à mão (é lido pelo Google Stitch e
// precisa de prosa), enquanto o código é editado por token. São dois
// lugares, e sem esta rede o primeiro a mudar chega a ser o errado. Já
// aconteceu: o documento descrevia um `error` de 3.76:1 que o código já
// tinha corrigido, e um token `on-success` que existia no código e não no
// documento.
//
// Regra: se este teste falha, **o código está certo**. Corrija o documento.

const RAIZ = join(__dirname, '..', '..');
const doc = readFileSync(join(RAIZ, 'DESIGN.md'), 'utf8');
const front = doc.match(/^---\n([\s\S]*?)\n---\n/);

describe('DESIGN.md reflete o código', () => {
  it('tem frontmatter YAML', () => {
    expect(front).not.toBeNull();
  });

  // --- cores ---
  const coresDoc: [string, string][] = [
    ['primary', 'brand'],
    ['on-primary', 'onBrand'],
    ['on-success', 'onSuccess'],
    ['background', 'background'],
    ['surface', 'surface'],
    ['surface-alt', 'surfaceSecondary'],
    ['border', 'border'],
    ['text', 'text'],
    ['text-secondary', 'textSecondary'],
    ['text-muted', 'textMuted'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['delayed', 'delayed'],
    ['error', 'error'],
  ];

  it.each(coresDoc)('a cor %s bate com lightColors.%s', (nomeDoc, chaveTema) => {
    const m = doc.match(new RegExp(`^\\s{2}${nomeDoc}:\\s*"?(#[0-9a-fA-F]{6})"?`, 'm'));
    expect(m).not.toBeNull();
    expect(m![1].toLowerCase()).toBe(
      (lightColors as unknown as Record<string, string>)[chaveTema].toLowerCase()
    );
  });

  it('o nome do produto esta certo em todo o documento', () => {
    // "AssCarbon" entrou no DESIGN.md em 2026-09-28 por erro de
    // digitação, o Stitch leu o arquivo e devolveu o nome errado no PRD.
    // Um teste trivial, para um erro que chegou até o cliente.
    expect(doc).not.toMatch(/AssCarbon/i);
    expect(doc).toMatch(/Assidua/);
  });

  // --- geometria ---
  it.each(Object.entries(rounded))('raio %s bate com tokens.rounded', (nome, valor) => {
    expect(doc).toMatch(new RegExp(`^\\s{2}${nome}:\\s*${valor}\\s*$`, 'm'));
  });

  it.each(Object.entries(spacing))('espaco %s bate com tokens.spacing', (nome, valor) => {
    expect(doc).toMatch(new RegExp(`^\\s{2}${nome}:\\s*${valor}\\s*$`, 'm'));
  });

  // A lista de tamanhos do documento tem que ser a escala do código, na
  // mesma ordem decrescente. Comparar a lista inteira em vez de token a
  // token é o que funciona: o YAML usa kebab-case (`home-header`) porque é
  // o formato que o Stitch lê, e o código usa camelCase (`homeHeader`).
  // Os nomes divergem por design; os VALORES não podem.
  //
  // Isso também pega o erro que a versão anterior deste teste deixava
  // passar: um token com o tamanho certo no nome errado passava igual.
  it('a escala de fontes do DESIGN.md e exatamente a de tokens.type', () => {
    const noDoc = [...doc.matchAll(/^\s{4}fontSize:\s*(\d+)px/gm)]
      .map((m) => Number(m[1]))
      .sort((a, b) => b - a);
    const noCodigo = [...Object.values(type)].sort((a, b) => b - a);
    expect(noDoc).toEqual(noCodigo);
  });

  it('todo token de fonte do codigo tem bloco no documento', () => {
    const blocosDoc = [...doc.matchAll(/^\s{2}([a-z-]+):\n(?:\s{4}.*\n)+/gm)].map((m) =>
      m[1].replace(/-/g, '').toLowerCase()
    );
    for (const nome of Object.keys(type)) {
      expect(blocosDoc).toContain(nome.toLowerCase());
    }
  });
});
