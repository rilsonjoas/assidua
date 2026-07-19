<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Política de Privacidade — Meus Remédios</title>
    <style>
        :root { color-scheme: light dark; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 720px;
            margin: 0 auto;
            padding: 32px 20px 80px;
            line-height: 1.6;
            color: #1e293b;
            background: #f8fafc;
        }
        @media (prefers-color-scheme: dark) {
            body { color: #f1f5f9; background: #0f172a; }
            a { color: #818cf8; }
            .box { background: #1e293b !important; border-color: #334155 !important; }
        }
        h1 { font-size: 1.6rem; margin-bottom: 4px; }
        h2 { font-size: 1.15rem; margin-top: 32px; }
        p, li { font-size: 0.97rem; }
        .updated { color: #64748b; font-size: 0.85rem; margin-bottom: 28px; }
        .box { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin: 20px 0; }
        a { color: #6366f1; }
    </style>
</head>
<body>
    <h1>Política de Privacidade</h1>
    <p class="updated">Meus Remédios · Última atualização: 19 de julho de 2026</p>

    <p>
        Esta política explica quais dados o aplicativo <strong>Meus Remédios</strong> coleta, como eles são usados
        e quais direitos você tem sobre eles, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
    </p>

    <h2>1. Quem é o responsável pelos dados</h2>
    <p>
        O Meus Remédios é desenvolvido e operado por Rilson Joás. Dúvidas sobre privacidade podem ser enviadas para
        <a href="mailto:rilsonjoas10@gmail.com">rilsonjoas10@gmail.com</a>.
    </p>

    <h2>2. Quais dados coletamos</h2>
    <ul>
        <li><strong>Dados de conta:</strong> nome, e-mail e senha (armazenada com hash, nunca em texto puro) ou, se você entrar com Google, seu identificador e avatar do Google.</li>
        <li><strong>Dados de saúde inseridos por você:</strong> nomes de medicamentos, dosagens, horários e histórico de doses tomadas, puladas ou perdidas. Esses dados são sensíveis e tratados com cuidado adicional — veja a seção 6.</li>
        <li><strong>Dados técnicos:</strong> token de notificação do dispositivo, usado apenas para enviar lembretes de doses.</li>
    </ul>

    <h2>3. Para que usamos esses dados</h2>
    <ul>
        <li>Calcular e exibir as doses do dia de cada perfil de paciente cadastrado.</li>
        <li>Enviar notificações locais de lembrete de horário de medicação.</li>
        <li>Calcular estatísticas de adesão ao tratamento e manter o histórico.</li>
        <li>Autenticar seu acesso à conta.</li>
    </ul>
    <p>Não usamos seus dados de saúde para publicidade, treinamento de modelos de IA, nem os vendemos a terceiros.</p>

    <h2>4. Compartilhamento com terceiros</h2>
    <p>
        Seus dados não são vendidos. Compartilhamos dados apenas com provedores estritamente necessários para operar
        o serviço, como o provedor de hospedagem do servidor e, caso você opte por entrar com Google, o próprio Google
        (apenas para autenticação — não temos acesso à sua senha do Google).
    </p>

    <h2>5. Armazenamento e segurança</h2>
    <p>
        Os dados ficam armazenados em banco de dados protegido, acessível apenas pela aplicação. Senhas são
        armazenadas com hash (bcrypt) e o acesso à API é feito por token de autenticação pessoal, que pode ser
        revogado a qualquer momento ao sair da conta.
    </p>

    <div class="box">
        <h2 style="margin-top:0">6. Seus direitos e exclusão de conta</h2>
        <p>Você pode, a qualquer momento, dentro do app:</p>
        <ul>
            <li>Acessar e corrigir seus dados diretamente nas telas de Perfis, Remédios e Estoque.</li>
            <li>Exportar ou revisar seu histórico de doses na tela Histórico.</li>
            <li>
                <strong>Excluir permanentemente sua conta</strong> e todos os dados associados (perfis, medicamentos,
                horários e histórico de doses), na tela <em>Perfis → Excluir conta</em>. A exclusão é imediata e
                definitiva — não guardamos cópia dos dados depois de excluídos, exceto quando a lei exigir retenção
                por período determinado.
            </li>
        </ul>
    </div>

    <h2>7. Dados de saúde</h2>
    <p>
        Entendemos que informações sobre medicamentos e condições de saúde são dados sensíveis. Eles existem no
        sistema apenas para o funcionamento do app (lembretes, histórico, controle de estoque) e são visíveis
        apenas para a conta que os cadastrou.
    </p>

    <h2>8. Alterações nesta política</h2>
    <p>
        Podemos atualizar esta política conforme o app evolui (por exemplo, ao introduzir anúncios ou assinaturas).
        A data de "última atualização" no topo desta página sempre refletirá a versão mais recente.
    </p>

    <h2>9. Contato</h2>
    <p>
        Para dúvidas, solicitações de acesso, correção ou exclusão de dados, entre em contato:
        <a href="mailto:rilsonjoas10@gmail.com">rilsonjoas10@gmail.com</a>.
    </p>
</body>
</html>
