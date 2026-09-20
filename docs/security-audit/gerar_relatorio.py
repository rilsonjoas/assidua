#!/usr/bin/env python3
"""
Gerador do Relatório de Auditoria de Segurança — Assídua (api Laravel + app Expo).

Rodar com o venv local (não instala nada globalmente):
    ./.venv/bin/python gerar_relatorio.py

Regenerar depois de nova auditoria: só editar FINDINGS/STRENGTHS/RECOMMENDATIONS
abaixo e rodar de novo — sobrescreve o PDF no mesmo caminho.
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, Image, PageBreak, HRFlowable, KeepTogether, NextPageTemplate
)
from reportlab.pdfgen import canvas as pdfcanvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")

# ---------------------------------------------------------------- paleta ----
SEV_COLORS = {
    "Crítica": "#B91C1C",
    "Alta": "#EA580C",
    "Média": "#D97706",
    "Baixa": "#2563EB",
    "Informativa": "#64748B",
}
STRONG_COLOR = "#059669"
INK = "#1E2430"
MUTED = "#5B6472"
LINE = "#DDE3EA"
BG_SOFT = "#F4F6F8"

# ---------------------------------------------------------------- dados -----
PROJECT = "Assídua"
SCOPE = (
    "Monorepo assidua (api/ Laravel 13 + Sanctum + Policies, app/ Expo/"
    "React Native). Escopo: rotas autenticadas em routes/api.php, "
    "Controllers, Policies, Models, exportação LGPD, webhook RevenueCat, "
    "fluxo de autenticação (magic link + Google OAuth) e superfície de "
    "renderização do app mobile."
)
METHOD_NOTE = (
    "Mecanismo de isolamento de tenant detectado: Policies do Laravel "
    "(Gate::authorize) contra Profile::isAccessibleBy() — dono OU "
    "colaborador/cuidador aceito — equivalente funcional ao RLS do "
    "Supabase citado na metodologia padrão. “Permissão no navegador” "
    "mapeada para o gate is_owner do app RN comparado linha a linha com "
    "os métodos update()/delete() de cada Policy. XSS mapeado para a "
    "superfície real do RN (sem WebView/HTML) mais a exportação CSV, "
    "onde o equivalente de “input sem tratamento” é CSV Formula "
    "Injection."
)

FINDINGS = [
    {
        "id": "A1",
        "severity": "Alta",
        "category": "IDOR",
        "file": "api/app/Http/Controllers/DoseLogController.php",
        "lines": "143–180",
        "title": "IDOR em POST /dose-logs — dose_schedule_id/medication_id não são validados contra o profile autorizado",
        "desc": (
            "O endpoint recebe profile_id, dose_schedule_id e medication_id no "
            "body. Gate::authorize('create', [DoseLog::class, $profile]) checa "
            "só que o profile_id pertence (ou é compartilhado com) o usuário — "
            "mas dose_schedule_id e medication_id são validados apenas com "
            "'exists:tabela,id' (existem em QUALQUER lugar do banco, não no "
            "profile autorizado). Como o updateOrCreate casa por "
            "dose_schedule_id + scheduled_at, e os IDs são autoincremento "
            "sequencial (database/migrations/2026_06_28_000005_create_dose_logs_table.php:12), "
            "um usuário autenticado qualquer pode enviar um dose_schedule_id de "
            "OUTRO perfil junto com o próprio profile_id (que passa no Gate) "
            "e: (1) ler nome/dosagem do medicamento alheio na resposta; "
            "(2) sobrescrever um DoseLog existente de outro perfil — status, "
            "notes, e o próprio profile_id do registro."
        ),
        "code": (
            "$data = $request->validate([\n"
            "    'dose_schedule_id' => 'required|exists:dose_schedules,id',\n"
            "    'medication_id' => 'required|exists:medications,id',\n"
            "    'profile_id' => 'required|exists:profiles,id',\n"
            "    ...\n"
            "]);\n"
            "$profile = Profile::findOrFail($data['profile_id']);\n"
            "Gate::authorize('create', [DoseLog::class, $profile]); // só valida profile_id\n"
            "$log = DoseLog::updateOrCreate(\n"
            "    ['dose_schedule_id' => $data['dose_schedule_id'], 'scheduled_at' => ...],\n"
            "    array_merge($data, [...]) // profile_id, medication_id do body, não checados\n"
            ");"
        ),
        "impact": (
            "Vazamento de nome/dosagem de medicamento de outro paciente e "
            "corrupção de registros de adesão (status/notas) de terceiros — "
            "dado que pode chegar a um resumo de consulta médica "
            "(GenerateConsultationSummary) sem nunca ter passado pela Policy "
            "do perfil-alvo."
        ),
        "fix": (
            "Resolver dose_schedule_id e medication_id a partir do próprio "
            "$profile autorizado (ex.: $profile->medications()->findOrFail(...) "
            "e whereHas('medication', fn($q) => $q->where('profile_id', "
            "$profile->id))), em vez de aceitar os três IDs soltos e "
            "independentes do body."
        ),
    },
    {
        "id": "A2",
        "severity": "Baixa",
        "category": "Inputs sem tratamento (equiv. XSS)",
        "file": "api/app/Http/Controllers/DataExportController.php",
        "lines": "~98–149",
        "title": "Exportação CSV (LGPD) sem neutralização de CSV Formula Injection",
        "desc": (
            "downloadCsv() escreve nome/dosagem/instruções/notas do "
            "medicamento direto em células CSV sem prefixar valores que "
            "começam com =, +, -, ou @. Se um desses campos contiver uma "
            "fórmula, o Excel/Sheets pode executá-la ao abrir o arquivo. "
            "XSS tradicional não se aplica (app RN sem WebView/HTML), este "
            "é o equivalente real na stack. Severidade rebaixada porque "
            "todo campo exportado só pode ter sido escrito pelo próprio "
            "dono do perfil (MedicationController exige Policy 'update', "
            "owner-only) — não há atacante cruzando fronteira de usuário "
            "aqui, é auto-injeção na própria exportação."
        ),
        "code": (
            "fputcsv($handle, [\n"
            "    $profile->name, $medication->name, $medication->dosage ?? '',\n"
            "    $medication->unit ?? '', $medication->instructions ?? '',\n"
            "    $medication->notes ?? '', ...\n"
            "], ';'); // sem sanitização contra =/+/-/@ no início da célula"
        ),
        "impact": (
            "Execução de fórmula no Excel/Sheets do próprio usuário ao abrir "
            "seu export. Sem cruzamento de tenant — impacto limitado a "
            "auto-exploração."
        ),
        "fix": (
            "Prefixar apóstrofo (') em qualquer célula cujo valor comece com "
            "=, +, -, @, tab ou CR antes do fputcsv — padrão OWASP para CSV "
            "Injection."
        ),
    },
    {
        "id": "A3",
        "severity": "Informativa",
        "category": "Chaves expostas / segredos",
        "file": "api/app/Http/Controllers/RevenueCatWebhookController.php",
        "lines": "47",
        "title": "Comparação do webhook secret não é constant-time",
        "desc": (
            "$request->header('Authorization') !== $secret usa comparação "
            "padrão de string do PHP, que retorna assim que encontra o "
            "primeiro byte diferente — abre uma janela teórica de timing "
            "side-channel contra o valor do secret. Nenhum hardcode "
            "encontrado no projeto (achado positivo, ver seção de pontos "
            "fortes); este item é só sobre a FORMA da comparação, não sobre "
            "o segredo estar exposto."
        ),
        "code": (
            "if (! $secret || $request->header('Authorization') !== $secret) {\n"
            "    return response()->json(['error' => 'unauthorized'], 401);\n"
            "}"
        ),
        "impact": (
            "Baixo risco prático (webhook de um único fornecedor, volume "
            "baixo de tentativas), mas é boa prática padrão trocar para "
            "comparação constant-time em qualquer comparação de segredo."
        ),
        "fix": "Trocar !== por hash_equals($secret, (string) $request->header('Authorization')).",
    },
]

STRENGTHS = [
    ("Isolamento de tenant (Policies)",
     "Todo Controller (Profile, Medication, DoseSchedule, DoseLog, Stock) chama "
     "Gate::authorize() ANTES de tocar o model, contra Profile::isAccessibleBy() "
     "(dono OU colaborador aceito) — verificado rota por rota em routes/api.php."),
    ("Paridade UI (frontend) × Policy (backend)",
     "O gate is_owner que o app RN usa pra esconder editar/apagar bate 1:1 com "
     "ProfilePolicy::update/delete e MedicationPolicy::update/delete (owner-only) "
     "— nenhuma ação exclusiva de dono depende só da UI escondida."),
    ("Sem segredo hardcoded",
     "Toda credencial (Google, Resend, AWS, RevenueCat, Sentry) vem de env(), "
     "sem valor-default inseguro; webhook do RevenueCat falha fechado (401) "
     "quando o secret está vazio."),
    ("Fluxo de auth robusto",
     "Magic link usa token de 64 bytes hasheado (sha256) no banco, expira em "
     "15 min, invalida o anterior a cada novo pedido. OAuth Google valida "
     "state contra allowlist de origem + path /auth-callback, nunca devolve "
     "token em JSON aberto sem destino validado."),
    ("Exportação LGPD via signed URL",
     "GET /me/export usa assinatura do Laravel com expiração de 10 min e o "
     "id do usuário embutido na assinatura — trocar o id na query invalida "
     "a URL antes de chegar no controller."),
    ("Mass assignment sob controle",
     "subscription_tier é fillable no model User, mas o único write path é "
     "RevenueCatWebhookController com array literal explícito — nenhuma rota "
     "deixa o próprio usuário setar o campo via request bruto."),
]

RECOMMENDATIONS = [
    ("P1", "Corrigir o IDOR de POST /dose-logs (A1)",
     "Resolver dose_schedule_id/medication_id a partir do profile já "
     "autorizado, não como IDs soltos do body. É o único achado com "
     "impacto real de confidencialidade/integridade entre usuários."),
    ("P2", "Sanitizar exportação CSV contra Formula Injection (A2)",
     "Prefixar apóstrofo em células que começam com =, +, -, @ antes de "
     "escrever no CSV. Baixo esforço, fecha o gap mesmo sem atacante "
     "cross-tenant hoje."),
    ("P3", "Trocar comparação do webhook secret para hash_equals() (A3)",
     "Troca de uma linha, remove a janela teórica de timing attack."),
]

ISSUES = [
    {
        "title": "[Segurança] IDOR em POST /dose-logs permite ler e sobrescrever registros de outro perfil",
        "labels": "security, severidade:alta",
        "body": (
            "**Problema**\n\n"
            "`DoseLogController::store()` (`api/app/Http/Controllers/DoseLogController.php:143-180`, "
            "rota `POST /dose-logs`) recebe `profile_id`, `dose_schedule_id` e "
            "`medication_id` no body. `Gate::authorize('create', [DoseLog::class, $profile])` "
            "valida só o `profile_id`. `dose_schedule_id`/`medication_id` são "
            "validados apenas com `exists:tabela,id` — existem em QUALQUER "
            "lugar do banco, não necessariamente no profile autorizado.\n\n"
            "Como os IDs são autoincremento sequencial "
            "(`database/migrations/2026_06_28_000005_create_dose_logs_table.php:12`) "
            "e o `updateOrCreate` casa por `dose_schedule_id` + `scheduled_at`, "
            "um usuário autenticado qualquer pode enviar seu próprio "
            "`profile_id` (passa no Gate) junto com um `dose_schedule_id` de "
            "OUTRO perfil.\n\n"
            "**Por que é explorável**\n\n"
            "Nenhuma verificação liga `dose_schedule_id`/`medication_id` ao "
            "`profile_id` autorizado — as três IDs são tratadas como "
            "independentes.\n\n"
            "**Evidência**\n\n"
            "```php\n"
            "$data = $request->validate([\n"
            "    'dose_schedule_id' => 'required|exists:dose_schedules,id',\n"
            "    'medication_id' => 'required|exists:medications,id',\n"
            "    'profile_id' => 'required|exists:profiles,id',\n"
            "]);\n"
            "$profile = Profile::findOrFail($data['profile_id']);\n"
            "Gate::authorize('create', [DoseLog::class, $profile]);\n"
            "$log = DoseLog::updateOrCreate(\n"
            "    ['dose_schedule_id' => $data['dose_schedule_id'], 'scheduled_at' => ...],\n"
            "    array_merge($data, [...])\n"
            ");\n"
            "```\n\n"
            "**Impacto**\n\n"
            "- Leitura de nome/dosagem de medicamento de outro perfil na resposta.\n"
            "- Sobrescrita de status/notas de um `DoseLog` de outro perfil, incluindo "
            "reatribuição do `profile_id` do registro.\n"
            "- Dado pode chegar a `GenerateConsultationSummary` (resumo pra consulta médica).\n\n"
            "**Sugestão de correção**\n\n"
            "Resolver `dose_schedule_id`/`medication_id` a partir do `$profile` já "
            "autorizado (ex.: `$profile->medications()->findOrFail($data['medication_id'])` "
            "e uma busca de schedule escopada por `whereHas('medication', fn($q) => "
            "$q->where('profile_id', $profile->id))`), em vez de aceitar os três IDs "
            "soltos do body.\n\n"
            "**Critérios de aceite**\n\n"
            "- [ ] `dose_schedule_id` enviado no body é rejeitado (404/422) se não pertencer "
            "ao `profile_id` autorizado.\n"
            "- [ ] `medication_id` enviado no body é rejeitado se não pertencer ao mesmo profile.\n"
            "- [ ] Teste automatizado cobrindo: usuário A autenticado tenta criar/sobrescrever "
            "um DoseLog usando `dose_schedule_id` do perfil do usuário B → 403/404, sem "
            "vazar dado do medicamento de B na resposta.\n"
            "- [ ] Regressão: fluxo normal (dono ou colaborador aceito registrando dose do "
            "próprio perfil) continua funcionando sem mudança de contrato pro app.\n"
        ),
    },
    {
        "title": "[Segurança] Hardening: CSV Formula Injection na exportação LGPD e comparação não constant-time do webhook secret",
        "labels": "security, severidade:baixa",
        "body": (
            "Dois achados de baixo risco agrupados por serem hardening pontual, "
            "sem impacto cross-tenant hoje.\n\n"
            "**1. CSV Formula Injection — `api/app/Http/Controllers/DataExportController.php` (~linhas 98-149)**\n\n"
            "`downloadCsv()` escreve nome/dosagem/instruções/notas do medicamento "
            "direto em células CSV sem neutralizar valores que começam com "
            "`=`, `+`, `-` ou `@`. Se um desses campos contiver uma fórmula, "
            "Excel/Sheets pode executá-la ao abrir o export. Impacto limitado: "
            "todo campo exportado só pode ter sido escrito pelo próprio dono "
            "do perfil (`MedicationController` exige Policy `update`, owner-only), "
            "então é auto-injeção — mas vale corrigir como defesa em profundidade.\n\n"
            "*Correção sugerida*: prefixar apóstrofo (`'`) em qualquer célula cujo "
            "valor comece com `=`, `+`, `-`, `@`, tab ou CR antes do `fputcsv`.\n\n"
            "**2. Comparação não constant-time — `api/app/Http/Controllers/RevenueCatWebhookController.php:47`**\n\n"
            "```php\n"
            "if (! $secret || $request->header('Authorization') !== $secret) {\n"
            "```\n\n"
            "`!==` retorna assim que encontra o primeiro byte diferente — janela "
            "teórica de timing side-channel contra o valor do secret. Nenhum "
            "segredo hardcoded foi encontrado no projeto; é só a forma da "
            "comparação.\n\n"
            "*Correção sugerida*: `hash_equals($secret, (string) $request->header('Authorization'))`.\n\n"
            "**Critérios de aceite**\n\n"
            "- [ ] Export CSV: valor de teste começando com `=` some do arquivo como "
            "fórmula ativa (aparece como texto literal, com apóstrofo ou aspas).\n"
            "- [ ] `RevenueCatWebhookController::handle` usa `hash_equals()`.\n"
            "- [ ] Teste automatizado do webhook continua passando com secret correto/incorreto.\n"
        ),
    },
]

# ---------------------------------------------------------- gráficos --------

def make_donut(path):
    order = ["Crítica", "Alta", "Média", "Baixa", "Informativa"]
    counts = {s: 0 for s in order}
    for f in FINDINGS:
        counts[f["severity"]] += 1
    labels, values, colors_ = [], [], []
    for s in order:
        if counts[s] > 0:
            labels.append(f"{s} ({counts[s]})")
            values.append(counts[s])
            colors_.append(SEV_COLORS[s])

    fig, ax = plt.subplots(figsize=(4.6, 4.0), dpi=200)
    wedges, _ = ax.pie(
        values, colors=colors_, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2),
    )
    ax.legend(
        wedges, labels, loc="center left", bbox_to_anchor=(1.0, 0.5),
        frameon=False, fontsize=10, labelcolor=INK,
    )
    ax.text(0, 0.06, str(len(FINDINGS)), ha="center", va="center",
            fontsize=26, fontweight="bold", color=INK)
    ax.text(0, -0.18, "achados", ha="center", va="center",
            fontsize=10, color=MUTED)
    ax.set_title("Achados por severidade", fontsize=12, color=INK, pad=14, loc="left")
    fig.tight_layout()
    fig.savefig(path, transparent=True, bbox_inches="tight")
    plt.close(fig)


def make_bars(path):
    cats = ["Isolamento\n/ tenant", "Permissão\nno navegador", "IDOR",
            "Chaves\nexpostas", "Inputs sem\ntratamento"]
    keymap = {
        "Isolamento\n/ tenant": [],
        "Permissão\nno navegador": [],
        "IDOR": ["IDOR"],
        "Chaves\nexpostas": ["Chaves expostas / segredos"],
        "Inputs sem\ntratamento": ["Inputs sem tratamento (equiv. XSS)"],
    }
    counts = []
    bar_colors = []
    for c in cats:
        cat_findings = [f for f in FINDINGS if f["category"] in keymap[c]]
        counts.append(len(cat_findings))
        if not cat_findings:
            bar_colors.append(STRONG_COLOR)
        else:
            worst = max(cat_findings, key=lambda f: list(SEV_COLORS).index(f["severity"]) * -1
                        if f["severity"] != "Crítica" else -99)
            sev_order = ["Crítica", "Alta", "Média", "Baixa", "Informativa"]
            worst = min(cat_findings, key=lambda f: sev_order.index(f["severity"]))
            bar_colors.append(SEV_COLORS[worst["severity"]])

    display_counts = [c if c > 0 else 0.06 for c in counts]

    fig, ax = plt.subplots(figsize=(7.4, 4.0), dpi=200)
    bars = ax.bar(cats, display_counts, color=bar_colors, width=0.55, zorder=3)
    for bar, real in zip(bars, counts):
        label = "0 (ok)" if real == 0 else str(real)
        color = STRONG_COLOR if real == 0 else INK
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.05,
                 label, ha="center", va="bottom", fontsize=10, color=color, fontweight="bold")
    ax.set_ylim(0, max(counts + [1]) + 0.8)
    ax.set_yticks(range(0, max(counts + [1]) + 2))
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.spines["bottom"].set_color(LINE)
    ax.tick_params(axis="x", labelsize=9, colors=INK)
    ax.tick_params(axis="y", labelsize=9, colors=MUTED)
    ax.yaxis.grid(True, color=LINE, linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    ax.set_title("Achados por categoria (verde = nenhum achado, categoria coberta)",
                  fontsize=11, color=INK, pad=12, loc="left")
    fig.tight_layout()
    fig.savefig(path, transparent=True, bbox_inches="tight")
    plt.close(fig)


donut_path = os.path.join(HERE, "_chart_donut.png")
bars_path = os.path.join(HERE, "_chart_bars.png")
make_donut(donut_path)
make_bars(bars_path)

# --------------------------------------------------------------- estilos ----
styles = {
    "cover_title": ParagraphStyle("cover_title", fontName="Helvetica-Bold", fontSize=26,
                                    leading=31, textColor=colors.HexColor(INK)),
    "cover_sub": ParagraphStyle("cover_sub", fontName="Helvetica", fontSize=13,
                                  leading=18, textColor=colors.HexColor(MUTED)),
    "cover_meta_label": ParagraphStyle("cover_meta_label", fontName="Helvetica-Bold", fontSize=9,
                                         leading=12, textColor=colors.HexColor(MUTED),
                                         spaceAfter=1),
    "cover_meta_val": ParagraphStyle("cover_meta_val", fontName="Helvetica", fontSize=10.5,
                                       leading=14, textColor=colors.HexColor(INK),
                                       spaceAfter=10),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=17, leading=21,
                           textColor=colors.HexColor(INK), spaceBefore=4, spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
                           textColor=colors.HexColor(INK), spaceBefore=12, spaceAfter=6),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.6, leading=13.6,
                             textColor=colors.HexColor(INK), spaceAfter=6),
    "body_muted": ParagraphStyle("body_muted", fontName="Helvetica", fontSize=9, leading=12.6,
                                   textColor=colors.HexColor(MUTED), spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8.3, leading=11.5,
                              textColor=colors.HexColor(MUTED)),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=7.6, leading=10.6,
                             textColor=colors.HexColor(INK), backColor=colors.HexColor(BG_SOFT),
                             borderPadding=(6, 8, 6, 8), spaceAfter=6),
    "issue_body": ParagraphStyle("issue_body", fontName="Courier", fontSize=7.4, leading=10.2,
                                   textColor=colors.HexColor(INK)),
    "strength_title": ParagraphStyle("strength_title", fontName="Helvetica-Bold", fontSize=10,
                                       leading=13, textColor=colors.HexColor(STRONG_COLOR)),
}


def sev_chip(sev):
    color = SEV_COLORS.get(sev, MUTED)
    t = Table([[Paragraph(f'<font color="white"><b>{sev}</b></font>',
                           ParagraphStyle("chip", fontName="Helvetica-Bold", fontSize=7.6,
                                          textColor=colors.white, alignment=TA_CENTER))]],
               colWidths=[2.35 * cm], rowHeights=[0.48 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(color)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return t


# --------------------------------------------------------------- doc --------
doc = BaseDocTemplate(OUT_PDF, pagesize=A4,
                       leftMargin=2 * cm, rightMargin=2 * cm,
                       topMargin=2.6 * cm, bottomMargin=2.2 * cm,
                       title=f"Relatório de Auditoria de Segurança — {PROJECT}")

REPORT_NAME = f"Auditoria de Segurança — {PROJECT}"


def header_footer(canv: pdfcanvas.Canvas, d):
    canv.saveState()
    page_num = canv.getPageNumber()
    if page_num > 1:
        canv.setStrokeColor(colors.HexColor(LINE))
        canv.setLineWidth(0.6)
        canv.line(2 * cm, A4[1] - 1.6 * cm, A4[0] - 2 * cm, A4[1] - 1.6 * cm)
        canv.setFont("Helvetica", 8.3)
        canv.setFillColor(colors.HexColor(MUTED))
        canv.drawString(2 * cm, A4[1] - 1.35 * cm, REPORT_NAME)
        canv.drawRightString(A4[0] - 2 * cm, A4[1] - 1.35 * cm, "2026-09-08")
    canv.setStrokeColor(colors.HexColor(LINE))
    canv.setLineWidth(0.6)
    canv.line(2 * cm, 1.7 * cm, A4[0] - 2 * cm, 1.7 * cm)
    canv.setFont("Helvetica", 8.3)
    canv.setFillColor(colors.HexColor(MUTED))
    canv.drawString(2 * cm, 1.35 * cm, REPORT_NAME)
    canv.drawRightString(A4[0] - 2 * cm, 1.35 * cm, f"Página {page_num}")
    canv.restoreState()


frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])

story = []

# ---- Capa -----------------------------------------------------------------
story.append(Spacer(1, 2.2 * cm))
story.append(Paragraph(f"Relatório de Auditoria de<br/>Segurança — {PROJECT}", styles["cover_title"]))
story.append(Spacer(1, 0.5 * cm))
story.append(Paragraph(
    "Isolamento de tenant, permissões, IDOR, segredos e inputs sem tratamento",
    styles["cover_sub"]))
story.append(Spacer(1, 1.6 * cm))

meta_rows = [
    ("Data", "2026-09-08"),
    ("Repositório", "github.com/rilsonjoas/assidua"),
    ("Escopo auditado", SCOPE),
    ("Nota metodológica", METHOD_NOTE),
]
for label, val in meta_rows:
    story.append(Paragraph(label.upper(), styles["cover_meta_label"]))
    story.append(Paragraph(val, styles["cover_meta_val"]))

story.append(Spacer(1, 1.0 * cm))
sev_counts = {}
for f in FINDINGS:
    sev_counts[f["severity"]] = sev_counts.get(f["severity"], 0) + 1
summary_line = "  ·  ".join(f"{v} {k}" for k, v in sev_counts.items())
story.append(Table([[Paragraph(
    f'<b>{len(FINDINGS)} achados</b>  —  {summary_line}', styles["body"])]],
    colWidths=[doc.width]))

story.append(PageBreak())

# ---- Resumo executivo -------------------------------------------------
story.append(Paragraph("Resumo executivo", styles["h1"]))
story.append(Paragraph(
    f"{len(FINDINGS)} achados verificados em código real — nenhum especulativo. "
    f"1 de severidade Alta (IDOR real, com caminho de exploração concreto), "
    f"os outros dois de baixo risco/hardening. As categorias 1 (isolamento de "
    f"tenant) e 2 (permissão definida no navegador) não tiveram achados: "
    f"verificação sistemática, rota por rota, confirmou cobertura correta.",
    styles["body"]))

story.append(Spacer(1, 0.3 * cm))
chart_table = Table([
    [Image(donut_path, width=8.6 * cm, height=7.4 * cm),
     Image(bars_path, width=8.6 * cm, height=7.4 * cm)]
], colWidths=[8.6 * cm, 8.6 * cm])
chart_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(chart_table)

story.append(Spacer(1, 0.4 * cm))
story.append(Paragraph("Pontos fortes (verificados, com evidência)", styles["h2"]))
for title, desc in STRENGTHS:
    story.append(Paragraph(f'<font color="{STRONG_COLOR}"><b>✓ {title}</b></font> — {desc}',
                            styles["body"]))

story.append(Paragraph("Pontos fracos (risco central)", styles["h2"]))
story.append(Paragraph(
    "O IDOR de <b>POST /dose-logs</b> (A1) é o risco real deste levantamento: "
    "permite ler dado de medicamento de outro perfil e corromper registros de "
    "adesão de terceiros, sem nunca passar pela Policy do perfil-alvo. Os "
    "outros dois achados são hardening de baixo risco, sem exploração "
    "cross-tenant demonstrada hoje.", styles["body"]))

story.append(PageBreak())

# ---- Tabela de achados ------------------------------------------------
story.append(Paragraph("Achados detalhados", styles["h1"]))

for f in FINDINGS:
    block = []
    head = Table([
        [sev_chip(f["severity"]),
         Paragraph(f'<b>{f["id"]} · {f["category"]}</b>', styles["body"]),
         Paragraph(f'<font face="Courier" size="8">{f["file"]}:{f["lines"]}</font>', styles["small"])]
    ], colWidths=[2.6 * cm, 6.0 * cm, doc.width - 8.6 * cm])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    block.append(head)
    block.append(Paragraph(f'<b>{f["title"]}</b>', styles["body"]))
    block.append(Paragraph(f["desc"], styles["body"]))
    code_escaped = (f["code"].replace("&", "&amp;").replace("<", "&lt;")
                    .replace(">", "&gt;").replace("\n", "<br/>"))
    block.append(Paragraph(code_escaped, styles["code"]))
    block.append(Paragraph(f'<b>Impacto:</b> {f["impact"]}', styles["body_muted"]))
    block.append(Paragraph(f'<b>Correção sugerida:</b> {f["fix"]}', styles["body_muted"]))
    block.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor(LINE),
                              spaceBefore=8, spaceAfter=12))
    story.append(KeepTogether(block))

story.append(PageBreak())

# ---- Recomendações ------------------------------------------------------
story.append(Paragraph("Recomendações priorizadas", styles["h1"]))
rec_rows = [[Paragraph("<b>Prior.</b>", styles["small"]),
             Paragraph("<b>Ação</b>", styles["small"]),
             Paragraph("<b>Por quê</b>", styles["small"])]]
for prio, action, why in RECOMMENDATIONS:
    rec_rows.append([Paragraph(f"<b>{prio}</b>", styles["body"]),
                      Paragraph(action, styles["body"]),
                      Paragraph(why, styles["body_muted"])])
rec_table = Table(rec_rows, colWidths=[1.6 * cm, 6.4 * cm, doc.width - 8.0 * cm])
rec_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BG_SOFT)),
    ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor(LINE)),
    ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor(LINE)),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(rec_table)

story.append(PageBreak())

# ---- Issues pro GitHub --------------------------------------------------
story.append(Paragraph("Issues para o GitHub", styles["h1"]))
story.append(Paragraph(
    "Texto completo em Markdown, pronto para copiar e colar em cada issue.",
    styles["body_muted"]))

for i, issue in enumerate(ISSUES, start=1):
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(f"--- ISSUE {i} ---", styles["small"]))
    story.append(Paragraph(f'<b>{issue["title"]}</b>', styles["h2"]))
    story.append(Paragraph(f'<b>Labels:</b> {issue["labels"]}', styles["body_muted"]))
    body_escaped = (issue["body"].replace("&", "&amp;").replace("<", "&lt;")
                     .replace(">", "&gt;").replace("\n", "<br/>"))
    story.append(Paragraph(body_escaped, styles["issue_body"]))
    story.append(Paragraph(f"--- FIM ISSUE {i} ---", styles["small"]))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor(LINE),
                              spaceBefore=10, spaceAfter=10))

doc.build(story)
print(f"PDF gerado: {OUT_PDF}")
