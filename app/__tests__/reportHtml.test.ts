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
});
