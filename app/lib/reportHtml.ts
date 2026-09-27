// Os tipos do payload moram em `services/doses.ts` e são importados
// aqui, não redefinidos. Havia cópia literal em dois arquivos e elas já
// divergiram no primeiro dia — exatamente o tipo de derivação que a §10.2
// do ROADMAP existe pra eliminar (uma fonte da verdade por fato).
import type {
  ConsultationSummaryDose,
  DoseReportState,
} from '../services/doses';

/** Uma ocorrência listada como não tomada: `reason` vem pronto do backend. */
export type ReportMissedDose = ConsultationSummaryDose & { reason: string };

/** Uma ocorrência do período, com os dois horários. */
/**
 * Formata um instante do relatório sem estourar quando ele é `null`.
 *
 * P4 (§10.4): a dose de resgate não tem horário previsto, e
 * `new Date(null)` produz `Invalid Date` — que é literalmente o que
 * apareceria impresso no PDF do médico. A função é `string` e nunca
 * lança; quem chamar precisa decidir o texto do "não tem".
 */
function formatInstantOr(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString('pt-BR');
}

export type ReportDose = ConsultationSummaryDose;

export interface ReportData {
  profileName: string;
  periodDays: number;
  percentage: number | null;
  taken: number;
  due: number;
  /**
   * P4/D13: das `taken`, quantas foram dose de resgate. O campo EXISTE
   * para o resumo não mentir: com ele, "tomadas 2, previstas 1" tem
   * explicação; sem ele, o médico lê como erro de cálculo.
   *
   * OBRIGATÓRIO pelo mesmo motivo de `doses` e `allTaken` (P1/§9.2): se
   * fosse opcional, o `handlePrintReport` passaria sem ele em silêncio,
   * a lib aceitaria, e o app geraria relatório sem a linha — que é
   * exatamente o modo de falha que a nota abaixo do campo `doses`
   * descreve. O template ainda usa `?? 0` para tolerar relatório
   * salvo antes do P4.
   */
  rescue: number;
  // P1 (2026-09-25, ROADMAP §8.1/§9.2): o relatório passou a distinguir
  // os casos. `state` é FACTUAL, não julgamento — decisão X3 do Rilson:
  // o documento mostra os DOIS horários e deixa o leitor concluir, nada
  // aqui rotula "atrasado".
  //   recorded      → tem `taken_at`
  //   skipped       → pulou de propósito, não é falha
  //   unrecorded    → não há registro (a tolerância de 24h não passou)
  //   marked_missed → o app marcou como perdida depois da tolerância
  missed: ReportMissedDose[];
  /**
   * Todas as ocorrências do período, não só as perdidas.
   * OBRIGATÓRIO de propósito (P1/§9.2): enquanto era opcional, o
   * `handlePrintReport` da tela Histórico simplesmente não passava o
   * campo, o compilador não reclamou, e o relatório melhorado do fim
   * de semana nunca chegou no app. Os testes da lib passavam, porque
   * chamavam `generateConsultationReportHtml` direto.
   */
  doses: ReportDose[];
  /** As datas do período — antes o PDF só dizia "últimos N dias". */
  periodStart: string | null;
  periodEnd: string | null;
  /**
   * `true` só quando houve dose prevista e nenhuma ficou de fora.
   * `null` = não há o que afirmar (`due === 0`) — e o template diz
   * "sem doses previstas" em vez de "todas tomadas" (ROADMAP §9.5).
   */
  allTaken?: boolean | null;
  medications: { name: string; dosage?: string | null; unit?: string | null; schedules?: { time: string }[] }[];
  // "PDF respeita o filtro da tela" (2026-09-08, item 16) — achado real
  // do Rilson: o relatório sempre saía fixo (todos os remédios),
  // ignorando o filtro por medicamento visível no Histórico. Quando
  // preenchido, o próprio documento deixa explícito o recorte usado —
  // não é pra aplicar o filtro em silêncio.
  medicationName?: string | null;
}

// Achado real de revisão de código (2026-09-08): nome de remédio é
// texto livre que a própria pessoa digita no cadastro — um "&" ou "<"
// sem querer (ex.: "Vitamina C & D") já bastava pra quebrar a
// formatação do HTML gerado. Escapa todo texto de fora antes de
// interpolar, não só o campo novo (`medicationName`) que a revisão
// apontou — os outros (`m.name`, `m.medication_name`, `profileName`)
// tinham exatamente o mesmo risco, só ninguém tinha reparado ainda.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `YYYY-MM-DD` -> `DD/MM/AAAA`, sem passar por Date (evita o
 * deslocamento de fuso que a dataISO gera à meia-noite). */
function formatDateBr(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function generateConsultationReportHtml(data: ReportData): string {
  const {
    profileName, periodDays, percentage, taken, due, missed, medications,
    medicationName, doses, periodStart, periodEnd, allTaken,
  } = data;
  // P4/D13: o backend sempre envia, mas um relatório salvo de antes (ou
  // um chamador antigo que não sabe do campo) não tem. `?? 0` evita que
  // `rescue > 0` com `undefined` faça o cartão sumir de um jeito e a nota
  // aparecer de outro.
  const rescue = data.rescue ?? 0;

  // P1/§8.3 — a coluna "Situação" estava HARDCODED como "Não tomada",
  // que é a informação errada: "sem registro" (ninguém falou nada) e
  // "marcada como perdida" (o app registrou um veredito depois de 24h)
  // são fatos diferentes e o médico precisa distinguir. O `reason` vem
  // pronto do backend em linguagem clara.
  const missedRows = missed.length > 0
    ? missed.map((m) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(m.medication_name)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${formatInstantOr(m.scheduled_at, '—')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #e11d48; font-weight: 600;">${escapeHtml(m.reason ?? 'não registrada')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${escapeHtml(m.note ?? '')}</td>
      </tr>
    `).join('')
    : allTaken
      ? `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #16a34a; font-weight: 600;">Todas as doses agendadas foram registradas no período.</td></tr>`
      : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b;">Sem doses previstas no período.</td></tr>`;

  const medRows = medications.length > 0
    ? medications.map((m) => {
      const times = escapeHtml(m.schedules?.map((s) => s.time).join(', ') || 'Nenhum horário');
      const dosage = escapeHtml(m.dosage ? `${m.dosage} ${m.unit || ''}` : '-');
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${escapeHtml(m.name)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${dosage}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${times}</td>
        </tr>
      `;
    }).join('')
    : `<tr><td colspan="3" style="padding: 10px;">Nenhum medicamento cadastrado.</td></tr>`;

  // P1/§9.2 — a tabela que faltava. Sem ela o médico recebia só
  // "tomadas: 87" e nunca via a que horas. Agora cada dose registrada
  // mostra previsto E real, e a diferença fica visível sem o app
  // rotular nada (decisão X3).
  const recordedDoses = (doses ?? []).filter((d) => d.state === 'recorded');
  const takenRows = recordedDoses.length > 0
    ? recordedDoses.map((d) => {
        // P4 (§10.4) — o TERCEIRO caso: a dose de resgate. Ela não tem
        // horário previsto, então a coluna "Previsto" diz o que
        // aconteceu de verdade — "fora de horário previsto" — em vez de
        // imprimir "Invalid Date" ou um horário inventado. E a
        // diferença entre os dois instantes é `null` de propósito: não
        // existe previsto contra o qual medir, e highlight de "atraso"
        // aqui seria o app rotulando algo que ele não sabe.
        const eResgate = d.scheduled_at === null;
        const prev = eResgate ? 'Fora de horário previsto' : formatInstantOr(d.scheduled_at, '—');
        const real = formatInstantOr(d.taken_at, '—');
        const diffMin = d.taken_at && d.scheduled_at
          ? Math.round((new Date(d.taken_at).getTime() - new Date(d.scheduled_at).getTime()) / 60000)
          : null;
        const destaque = diffMin !== null && Math.abs(diffMin) >= 30;
        // P3 (2026-09-25) — a nota que a pessoa escreveu é **fato
        // clínico**. O backend já devolvia `note` no payload das doses e o
        // template **jogava fora**: o médico recebia previsto e real, mas
        // não o que o paciente escreveu ("me senti mal", "tomei
        // depois do almoço"). Era a nota mais invisível do produto — o
        // canal mais direto entre paciente e médico, sumindo no caminho.
        const nota = d.note
          ? `<div style="margin-top: 4px; font-size: 12px; color: #475569; font-style: italic;">${escapeHtml(d.note)}</div>`
          : '';
        return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(d.medication_name)}${nota}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${prev}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; ${destaque ? 'font-weight: 600;' : ''}">${real}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${escapeHtml(d.note ?? '')}</td>
      </tr>
    `;
      }).join('')
    : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b;">Nenhuma dose registrada no período.</td></tr>`;

  const adherenceColor = percentage === null ? '#64748b' : percentage >= 80 ? '#16a34a' : '#d97706';

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
      <div style="font-weight: 600; font-size: 16px;">${escapeHtml(profileName)}</div>
      <div style="font-size: 12px; color: #64748b;">${
        periodStart && periodEnd
          ? `${formatDateBr(periodStart)} a ${formatDateBr(periodEnd)}`
          : `Últimos ${periodDays} dias`
      }</div>
    </div>
  </div>

  ${medicationName ? `<div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; color: #4338ca;">Filtrado por: <strong>${escapeHtml(medicationName)}</strong></div>` : ''}

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-val" style="color: ${adherenceColor}">${
        percentage === null || percentage === undefined ? '—' : `${percentage}%`
      }</div>
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
    ${
      rescue > 0
        ? `<div class="summary-card">
            <div class="summary-val" style="color: #6366f1;">${rescue}</div>
            <div class="summary-label">Doses de Resgate</div>
          </div>`
        : ''
    }
  </div>
  ${
    rescue > 0
      ? `<div style="font-size: 12px; color: #64748b; margin: -8px 0 20px 0;">${
          due === 0
            ? 'No período não havia dose prevista: a adesão não se aplica, e as doses de resgate acima são os únicos registros.'
            : `As ${rescue} dose(s) de resgate entraram em "Doses Tomadas", mas não em "Doses Previstas" — não havia horário previsto para elas.`
        }</div>`
      : ''
  }

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

  <div class="section-title">Doses Registradas (horário previsto e real)</div>
  <table>
    <thead>
      <tr>
        <th>Medicamento</th>
        <th>Previsto</th>
        <th>Registrado</th>
        <th>Observação</th>
      </tr>
    </thead>
    <tbody>
      ${takenRows}
    </tbody>
  </table>

  <div class="section-title">Doses Sem Registro / Marcadas como Perdidas</div>
  <table>
    <thead>
      <tr>
        <th>Medicamento</th>
        <th>Data e Horário Previsto</th>
        <th>Situação</th>
        <th>Observação</th>
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
