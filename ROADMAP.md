# Roadmap — Meus Remédios

**Status (2026-08-21):** No ar em `api-remedios.narniano.com` (Laravel 13 + Postgres + Docker no VPS Hetzner) + App Mobile Expo (React Native). P0-P7 de infraestrutura e qualidade 100% concluídos. 211 testes automatizados passando.

---

## Backlog de Produto — Issues e Bugs (levantamento 2026-08-21)

> Levantamento de UX e produto feito pelo Rilson.

### 🔴 Crítico / Alta Prioridade (UX e Configuração de Uso Real)

- [ ] **Frequência e duração do tratamento incompletas** — usuários precisam de:
  - Frequência flexível: a cada X horas, a cada X dias, dias da semana específicos ou horários livres/múltiplos.
  - Duração do tratamento: limite de dias (ex.: tomar por 7 dias e parar automaticamente).
- [ ] **Logotipo ausente na UI** — colocar a logomarca (`meus-remedios-logo.png`) no header da página inicial e na tela de perfis. Pode ser sutil ou marca d'água.
- [ ] **Editar agendamentos existentes** — permitir alterar horários e frequências de um remédio já cadastrado sem ter que deletar e recriar.

### 🟡 Média Prioridade / Evolução

- [ ] **Versão Web do Meus Remédios** — o projeto nasceu como mobile, mas existe espaço para uma versão web (Next.js/React) integrada à API Laravel existente, permitindo aos cuidadores gerenciarem os medicamentos pelo computador.
- [ ] **Fluxo de L0 (Google Play)** — aguardando taxa de $25 para conta de desenvolvedor. Quando destravar: `eas build --profile production` → submeter → 14 dias de teste fechado (12 testadores).
