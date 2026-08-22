# Naming — decisão de marca pré-L0

> Criado 2026-08-22 quando o projeto entrou em pausa por colisão de
> nome ("Meus Remedios" já existia na App Store desde 11/2025 — ver
> ROADMAP, seção ⚖️). Este documento é o processo completo até o novo
> nome ser escolhido, validado e aplicado.

## Critérios (o nome precisa passar em TUDO)

1. **Distintivo e registrável** no INPI — coined/arbitrário > descritivo
2. **Internacional**: lê-se bem em pt-BR, EN e ES sem trocadilho ruim
3. **Semântica remota mas presente**: medicação/hora/tratamento/cuidado
4. **Curto** (≤3 sílabas) e claro ao OUVIDO — idoso tem que entender
   quando alguém fala em voz alta (teste da avó)
5. Domínio `.com`/`.app` plausível + handles sociais livres
6. Zero apps grandes homônimos nas stores (BR, US, PT)

## Processo por finalista (checklist obrigatório)

- [ ] INPI: busca classes **09** (software), **42** (SaaS), **44** (saúde)
- [ ] App Store + Play Store: BR, US e PT (busca exata e aproximada)
- [ ] Domínios disponíveis (.com e .app)
- [ ] Teste da avó: falar em voz alta nos 3 idiomas
- [ ] Significado ruim/gíria noutro idioma? (ES principalmente)
- [ ] Handles sociais (@) disponíveis
- [ ] Decidir → registrar INPI ANTES de qualquer anúncio público

## Candidatos — ⚠️ TODOS NÃO VERIFICADOS ainda

Validar antes de se apegar. A lista é ponto de partida criativo.

### Coined forte (melhor registrabilidade)

| Nome | Raiz | Por quê | Risco observado |
|---|---|---|---|
| **Ritmia** | ritmo do tratamento | inventivo, feminino, provavelmente único, bonito nos 3 idiomas | verificar INPI/stores |
| **Dosely** | dose + `-ly` | soa app nativo em EN; PT pronuncia "dozéli" naturalmente | verificar |
| **Dosemate** | dose + mate (companheiro) | captura O diferencial: cuidador remoto é um "mate" | verificar |
| **Medora** | med + ora (hora) | sonoro, quase nome próprio | existem pequenas marcas Medora |
| **Remedia** | latim: "tu remedias" | semântica perfeita | Remedia = rede de farmácias na Áustria; risco médio |
| **Sanavia** | sanus (curar) | limpo, global; mais genérico-saúde que remédio-específico | verificar |

### Híbridos semânticos

| Nome | Raiz | Nota |
|---|---|---|
| **HoraMed** | hora + med | clareza total em PT; EN soa estranho |
| **Cuidia** | cuidar | carrega o diferencial do cuidador; coined; verificar |

### Descartados de cara (aprendizado registrado)

- Traduções literais ("MyMeds", "MisRemedios") = descritivas = mesmo
  problema jurídico do nome atual, só que em inglês
- **Bula**, **Cartela**: untransliteráveis, presos ao BR
- **Medly/Medley**: colide com a farmacêutica brasileira Medley

## Checklist de renomeação (executar QUANDO o nome for escolhido)

### Código / infra
1. `app.json`: `name`, `slug`, `package`/`bundleIdentifier` (**bundle id NOVO!**)
2. i18n pt/en/es: strings com o nome (`profile.version` footer, login, sobre)
3. Assets: logo/splash/favicon regenerados com o novo wordmark
4. WebTopNav wordmark + login logoBox + AlertDialogs
5. `api/.env`: `APP_NAME`; `MagicLinkMail` (subject + view)
6. README/ROADMAP/docs do repo

### Serviços externos (reconfigurar do zero)
7. Play Console: app NOVO (bundle id novo) → Data Safety de novo
8. RevenueCat: app novo + chaves novas (`goog_`) + entitlement `pro`
9. GCloud OAuth: client novo pro bundle (redirect URIs)
10. EAS: projectId permanece (independente de bundle); canais seguem
11. Domínio: `<nome>.narniano.com` → DNS + Traefik labels + nginx `server_name`
12. Umami: site novo · Sentry: projeto novo ou renomear

### Documentos/marketing
13. Vault (Projetos/, Monetização, Marketing), Portfólio, LinkedIn
14. Contas de divulgação futuras já usam o nome novo desde o dia 1

## Status da decisão

- [ ] Rilson valida candidatos → escolhe 3 finalistas
- [ ] Roda checklist nos finalistas (INPI + stores + domínios)
- [ ] Escolhe → registra INPI → aplica checklist de renomeação
- [ ] Retoma projeto pelo gate no topo do ROADMAP
