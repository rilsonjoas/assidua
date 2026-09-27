import { describe, it, expect } from '@jest/globals';
import { generateConsultationReportHtml } from '../lib/reportHtml';

/**
 * Campos que `ReportData` tornou OBRIGATÓRIOS em P1/§9.2. Repetidos em
 * cada fixture antes por estarem opcionais — e é exatamente por isso que
 * o `handlePrintReport` esqueceu de repassá-los e o app seguiu
 * emitindo o relatório antigo sem o compilador reclamar.
 */
const base = {
  doses: [] as { medication_name: string; scheduled_at: string; taken_at: string | null; state: 'recorded' | 'skipped' | 'unrecorded' | 'marked_missed' }[],
  periodStart: '2026-08-01',
  periodEnd: '2026-08-30',
  allTaken: null as boolean | null,
  // P4/D13: obrigatório em `ReportData`, então a fixture base declara
  // zero. Os testes de resgate sobrescrevem com 1.
  rescue: 0,
};


describe('generateConsultationReportHtml', () => {
  it('gera o HTML do relatório com os dados corretos do paciente', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 85,
      taken: 17,
      due: 20,
      missed: [
        {
          medication_name: 'Losartana',
          scheduled_at: '2026-08-20T08:00:00Z',
          taken_at: null,
          state: 'marked_missed',
          reason: 'marcada como perdida',
        },
      ],
      medications: [
        { name: 'Losartana', dosage: '50', unit: 'mg', schedules: [{ time: '08:00' }] },
      ],
    });

    expect(html).toContain('Maria Silva');
    // P1/§9.2: com `periodStart`/`periodEnd` presentes, o relatório passa
    // a mostrar o PERÍODO REAL ("01/08/2026 a 30/08/2026") em vez do
    // genérico "Últimos 30 dias". A asserção antiga cobria o texto
    // genérico e foi o queavsou: ela continuaria passando mesmo com o
    // relatório sem data nenhuma.
    expect(html).toContain('01/08/2026 a 30/08/2026');
    expect(html).not.toContain('Últimos 30 dias');
    expect(html).toContain('85%');
    expect(html).toContain('Losartana');
    expect(html).toContain('50 mg');
    expect(html).toContain('08:00');
  });

  it('exibe mensagem amigável quando todas as doses foram tomadas', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'João',
      periodDays: 30,
      percentage: 100,
      taken: 10,
      due: 10,
      missed: [],
      allTaken: true,
      medications: [],
    });

    expect(html).toContain('Todas as doses agendadas foram registradas no período');
  });

  // P1 (2026-09-25, ROADMAP §9.5) — regressão do pior bug do relatório.
  // Antes, `missed: []` bastava pra imprimir "todas foram tomadas",
  // inclusive com `due === 0` — ou seja, o documento afirmava que tudo
  // foi tomado quando NADA estava previsto. Num relatório médico isso é
  // a classe de erro mais grave possível.
  it('NAO afirma que tudo foi tomado quando não havia dose prevista', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'João',
      periodDays: 30,
      percentage: null,
      taken: 0,
      due: 0,
      missed: [],
      allTaken: null,
      medications: [],
    });

    expect(html).not.toContain('Todas as doses agendadas foram registradas');
    expect(html).toContain('Sem doses previstas no período');
    // E a taxa não vira "0%" — "0%" é uma afirmação; "—" é ausência.
    // (Não dá para usar `not.toContain('0%')` genérico: o <style> tem
    // `width: 100%`. O assert é na célula do valor.)
    expect(html).toContain('<div class="summary-val" style="color: #64748b">\u2014</div>');
  });

  // P1/§8.3 — "sem registro" e "marcada como perdida" são fatos
  // diferentes e o documento precisa dizer qual é qual. A coluna
  // "Situação" estava hardcoded como "Não tomada".
  it('separa "sem registro" de "marcada como perdida" no documento', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'João',
      periodDays: 30,
      percentage: 50,
      taken: 1,
      due: 2,
      missed: [
        {
          medication_name: 'Losartana', scheduled_at: '2026-08-20T08:00:00Z',
          taken_at: null, state: 'marked_missed', reason: 'marcada como perdida',
        },
        {
          medication_name: 'Paracetamol', scheduled_at: '2026-08-21T08:00:00Z',
          taken_at: null, state: 'unrecorded', reason: 'sem registro',
        },
      ],
      allTaken: null,
      medications: [],
    });

    expect(html).toContain('marcada como perdida');
    expect(html).toContain('sem registro');
    expect(html).not.toContain('>Não tomada<');
  });

  // P1/§9.2 — o que o médico nunca recebeu: o horário real ao lado do
  // previsto. A tabela nova existe pra isso.
  it('mostra horario previsto E real das doses registradas', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'João',
      periodDays: 30,
      percentage: 100,
      taken: 1,
      due: 1,
      missed: [],
      allTaken: true,
      medications: [],
      doses: [{
        medication_name: 'Losartana',
        scheduled_at: '2026-08-20T08:00:00Z',
        taken_at: '2026-08-20T11:20:00Z',
        state: 'recorded',
      }],
    });

    expect(html).toContain('Doses Registradas (horário previsto e real)');
    expect(html).toContain('Previsto');
    expect(html).toContain('Registrado');
  });

  // "PDF respeita o filtro da tela" (2026-09-08, item 16) — o próprio
  // documento deixa explícito o recorte usado, não aplica em silêncio.
  it('mostra "Filtrado por" quando um medicamento específico foi selecionado', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [],
      allTaken: true,
      medications: [{ name: 'Losartana', dosage: '50', unit: 'mg' }],
      medicationName: 'Losartana',
    });

    expect(html).toContain('Filtrado por');
    expect(html).toContain('Losartana');
  });

  // Achado real de revisão de código (2026-09-08): nome de remédio é
  // texto livre digitado pela própria pessoa — um "&"/"<" sem querer
  // (ex.: "Vitamina C & D") já bastava pra quebrar a formatação do
  // HTML gerado.
  it('escapa caracteres HTML no nome do medicamento filtrado e na tabela', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria & Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [{
        medication_name: 'Vitamina C & D', scheduled_at: '2026-08-20T08:00:00Z',
        taken_at: null, state: 'unrecorded', reason: 'sem registro',
      }],
      medications: [{ name: 'Vitamina C & D', dosage: '<1000>', unit: 'mg' }],
      medicationName: 'Vitamina C & D',
    });

    expect(html).not.toContain('Vitamina C & D');
    expect(html).toContain('Vitamina C &amp; D');
    expect(html).toContain('Maria &amp; Silva');
    expect(html).not.toContain('<1000>');
    expect(html).toContain('&lt;1000&gt;');
  });

  it('sem medicamento filtrado, não mostra a linha "Filtrado por"', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [],
      allTaken: true,
      medications: [],
    });

    expect(html).not.toContain('Filtrado por');
  });

  it('P3: a nota que o paciente escreveu aparece no relatorio do medico', () => {
    // A nota é o canal mais direto entre paciente e médico — e o backend
    // já mandava `note` no payload, que o template jogava fora. O
    // médico recebia previsto e real, mas não "tomei depois do almoço".
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      doses: [
        {
          medication_name: 'Losartana',
          scheduled_at: '2026-08-20T08:00:00Z',
          taken_at: '2026-08-20T09:15:00Z',
          state: 'recorded',
          note: 'Tomei depois do almoço, senti um pouco de tontura.',
        },
      ],
      allTaken: false,
      missed: [],
      medications: [],
    });

    expect(html).toContain('Tomei depois do almoço');
  });

  it('P3: a nota escapa HTML (nota é texto do usuario)', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 1,
      due: 1,
      doses: [
        {
          medication_name: 'Losartana',
          scheduled_at: '2026-08-20T08:00:00Z',
          taken_at: '2026-08-20T08:00:00Z',
          state: 'recorded',
          note: '<script>alert(1)</script>',
        },
      ],
      allTaken: true,
      missed: [],
      medications: [],
    });

    // Nota é escrita pela pessoa: entra no PDF, nunca como tag.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  // =============================================================
  // P4 (§10.4) — a dose de resgate no relatório.
  //
  // O teste que motivou estes: a dose de resgate chega com
  // `scheduled_at: null`. A tabela chamava `new Date(d.scheduled_at)`
  // direto, e com `null` isso é `Invalid Date` — impresso no PDF que o
  // MÉDICO recebe. Não quebrava a build, não quebrava tipo nenhum antes
  // do P4 (o campo era `string`), e o app continuaria "funcionando".
  // É falha que só se vê no papel.
  // =============================================================

  it('P4: a dose de resgate mostra "fora de horario previsto", nunca Invalid Date', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 100,
      taken: 1,
      due: 0,
      rescue: 1,
      doses: [
        {
          medication_name: 'Dipirona',
          scheduled_at: null,
          taken_at: '2026-08-20T15:30:00Z',
          state: 'recorded',
          is_rescue: true,
          client_key: 'aaaa-1111',
        },
      ],
      allTaken: null,
      missed: [],
      medications: [],
    });

    expect(html).not.toContain('Invalid Date');
    expect(html).toContain('Dipirona');
    expect(html).toContain('Fora de horário previsto');
    // O horário REAL é o dado clínico que importa aqui.
    expect(html).toContain('20/08/2026');

    // E o número que explica "Tomadas 1 / Previstas 0" no papel.
    expect(html).toContain('Doses de Resgate');
    // `due === 0` dispara o texto de "adesão não se aplica" — que é a
    // leitura correta para quem só tem resgate.
    expect(html).toContain('a adesão não se aplica');
  });

  it('P4: o cartao de resgate some quando nao houve dose de resgate', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 100,
      taken: 1,
      due: 1,
      rescue: 0,
      doses: [],
      allTaken: true,
      missed: [],
      medications: [],
    });

    // Sem o `rescue` no payload (relatório salvo antes do P4), a linha
    // não pode aparecer com "undefined" nem sobrar esvazia.
    expect(html).not.toContain('Doses de Resgate');
    expect(html).not.toContain('undefined');
  });

  it('P4: dose de resgate nao gera destaque de atraso (nao ha previsto contra o qual medir)', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 100,
      taken: 1,
      due: 0,
      rescue: 1,
      doses: [
        {
          medication_name: 'Dipirona',
          scheduled_at: null,
          taken_at: '2026-08-20T15:30:00Z',
          state: 'recorded',
          is_rescue: true,
        },
      ],
      allTaken: null,
      missed: [],
      medications: [],
    });

    // `font-weight: 600` na coluna do registrado é o destaque de atraso.
    // Sem previsto, não existe atraso — e o app não rotula (decisão X3).
    const linha = html.slice(html.indexOf('Dipirona'));
    const colunas = linha.split('</td>').slice(0, 3).join('</td>');
    expect(colunas).not.toContain('font-weight: 600');
  });

  it('P4: percentual acima de 100 nao vira "Infinity" nem texto quebrado', () => {
    const html = generateConsultationReportHtml({
      ...base,
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 100,
      taken: 2,
      due: 1,
      rescue: 1,
      doses: [],
      allTaken: true,
      missed: [],
      medications: [],
    });

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
})
