export interface ReportData {
  profileName: string;
  periodDays: number;
  percentage: number | null;
  taken: number;
  due: number;
  missed: { medication_name: string; scheduled_at: string }[];
  medications: { name: string; dosage?: string | null; unit?: string | null; schedules?: { time: string }[] }[];
}

export function generateConsultationReportHtml(data: ReportData): string {
  const { profileName, periodDays, percentage, taken, due, missed, medications } = data;

  const missedRows = missed.length > 0
    ? missed.map((m) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${m.medication_name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(m.scheduled_at).toLocaleString('pt-BR')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #e11d48; font-weight: 600;">Não tomada</td>
      </tr>
    `).join('')
    : `<tr><td colspan="3" style="padding: 15px; text-align: center; color: #16a34a; font-weight: 600;">Todas as doses agendadas foram tomadas no período.</td></tr>`;

  const medRows = medications.length > 0
    ? medications.map((m) => {
      const times = m.schedules?.map((s) => s.time).join(', ') || 'Nenhum horário';
      const dosage = m.dosage ? `${m.dosage} ${m.unit || ''}` : '-';
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${m.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${dosage}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${times}</td>
        </tr>
      `;
    }).join('')
    : `<tr><td colspan="3" style="padding: 10px;">Nenhum medicamento cadastrado.</td></tr>`;

  const adherenceColor = percentage !== null && percentage >= 80 ? '#16a34a' : '#d97706';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de Adesão — Assídua</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 25px; }
    .title { font-size: 24px; font-weight: bold; color: #4338ca; margin: 0; }
    .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
    .summary-grid { display: flex; gap: 15px; margin-bottom: 30px; }
    .summary-card { flex: 1; background: #f8fafc; border-radius: 12px; padding: 15px; border: 1px solid #e2e8f0; text-align: center; }
    .summary-val { font-size: 28px; font-weight: bold; color: #4338ca; }
    .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-top: 4px; }
    .section-title { font-size: 16px; font-weight: bold; color: #334155; margin-top: 25px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th { text-align: left; background: #f1f5f9; padding: 10px; color: #475569; font-weight: 600; }
    .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Assídua</h1>
      <div class="subtitle">Relatório de Adesão ao Tratamento Médico</div>
    </div>
    <div style="text-align: right;">
      <div style="font-weight: 600; font-size: 16px;">${profileName}</div>
      <div style="font-size: 12px; color: #64748b;">Últimos ${periodDays} dias</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-val" style="color: ${adherenceColor}">${percentage ?? 0}%</div>
      <div class="summary-label">Taxa de Adesão</div>
    </div>
    <div class="summary-card">
      <div class="summary-val">${taken}</div>
      <div class="summary-label">Doses Tomadas</div>
    </div>
    <div class="summary-card">
      <div class="summary-val">${due}</div>
      <div class="summary-label">Doses Previstas</div>
    </div>
  </div>

  <div class="section-title">Medicamentos e Horários</div>
  <table>
    <thead>
      <tr>
        <th>Medicamento</th>
        <th>Dosagem</th>
        <th>Horários</th>
      </tr>
    </thead>
    <tbody>
      ${medRows}
    </tbody>
  </table>

  <div class="section-title">Doses Não Tomadas / Ocorrências no Período</div>
  <table>
    <thead>
      <tr>
        <th>Medicamento</th>
        <th>Data e Horário Previsto</th>
        <th>Situação</th>
      </tr>
    </thead>
    <tbody>
      ${missedRows}
    </tbody>
  </table>

  <div class="footer">
    Relatório gerado pelo aplicativo Assídua.
  </div>
</body>
</html>`;
}
