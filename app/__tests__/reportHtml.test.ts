import { describe, it, expect } from '@jest/globals';
import { generateConsultationReportHtml } from '../lib/reportHtml';

describe('generateConsultationReportHtml', () => {
  it('gera o HTML do relatório com os dados corretos do paciente', () => {
    const html = generateConsultationReportHtml({
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 85,
      taken: 17,
      due: 20,
      missed: [
        { medication_name: 'Losartana', scheduled_at: '2026-08-20T08:00:00Z' },
      ],
      medications: [
        { name: 'Losartana', dosage: '50', unit: 'mg', schedules: [{ time: '08:00' }] },
      ],
    });

    expect(html).toContain('Maria Silva');
    expect(html).toContain('Últimos 30 dias');
    expect(html).toContain('85%');
    expect(html).toContain('Losartana');
    expect(html).toContain('50 mg');
    expect(html).toContain('08:00');
  });

  it('exibe mensagem amigável quando todas as doses foram tomadas', () => {
    const html = generateConsultationReportHtml({
      profileName: 'João',
      periodDays: 30,
      percentage: 100,
      taken: 10,
      due: 10,
      missed: [],
      medications: [],
    });

    expect(html).toContain('Todas as doses agendadas foram tomadas no período');
  });

  // "PDF respeita o filtro da tela" (2026-09-08, item 16) — o próprio
  // documento deixa explícito o recorte usado, não aplica em silêncio.
  it('mostra "Filtrado por" quando um medicamento específico foi selecionado', () => {
    const html = generateConsultationReportHtml({
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [],
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
      profileName: 'Maria & Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [{ medication_name: 'Vitamina C & D', scheduled_at: '2026-08-20T08:00:00Z' }],
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
      profileName: 'Maria Silva',
      periodDays: 30,
      percentage: 90,
      taken: 9,
      due: 10,
      missed: [],
      medications: [],
    });

    expect(html).not.toContain('Filtrado por');
  });
});
