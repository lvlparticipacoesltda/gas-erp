# Roadmap — Gas ERP

Planejamento de fases e sprints do projeto. Atualizado em **6 jul/2026** (pós-cutover Fly + mobile + métricas).

**Documentação relacionada:** [deployment.md](deployment.md) · [playstore-checklist.md](playstore-checklist.md) · [development.md](development.md) · [infrastructure-plan.md](infrastructure-plan.md) · [fly-migration.md](fly-migration.md)

---

## Visão geral das fases

| Fase | Objetivo | Status |
|------|----------|--------|
| **Fase 0 — MVP operacional** | Web + API + mobile em produção para 1 rede piloto | ✅ Concluída |
| **Fase 1 — Consolidação** | Play Store, segurança, cutover API regional | ✅ Quase fechada (pendências menores abaixo) |
| **Fase 2 — Fiscal e financeiro** | NFC-e/NF-e, contas a pagar/receber, fluxo de caixa | ⏳ Planejada |
| **Fase 3 — Crescimento** | App cliente, WhatsApp, real-time, multi-tenant SaaS | ⏳ Backlog |

---

## Produção atual (pós-cutover)

| Serviço | URL |
|---------|-----|
| **Web** | https://thlgasdopovo.com.br |
| **API** | https://api.thlgasdopovo.com.br/api/v1 (Fly.io **GRU**) |
| **Health** | https://api.thlgasdopovo.com.br/api/v1/health |
| **Banco** | Neon PostgreSQL sa-east-1 |
| **App entregador** | Google Play (`com.gaserp.entregador`) |

**Latência medida (jul/2026, `api.thlgasdopovo.com.br`):** health ~59 ms · login ~171 ms · dashboard master ~71 ms (antes no Railway: ~1–3 s).

---

## Sprint 1 — Publicação mobile e segurança

**Status:** ✅ Concluída (exceto redirect `www`, opcional).

| # | Tarefa | Status |
|---|--------|--------|
| 1.1 | 21 migrations em produção | ✅ |
| 1.2 | Senhas demo trocadas | ✅ |
| 1.3 | Build AAB produção | ✅ |
| 1.4 | Vídeo divulgação GPS | ✅ |
| 1.5 | Data safety + background location | ✅ |
| 1.6 | App publicado na Google Play | ✅ |
| 1.7 | Redirect `www` → apex na Vercel | ⏳ Opcional |

---

## Sprint 2 — Infraestrutura, latência e deploy

**Status:** 🟡 Bloco principal (B + C + cutover) **concluído**. Restam observabilidade, staging e cache Redis.

**Plano detalhado:** [infrastructure-plan.md](infrastructure-plan.md) · [fly-migration.md](fly-migration.md)

| # | Tarefa | Status |
|---|--------|--------|
| 2.0.2 | Baseline latência (antes/depois) | ✅ |
| 2.1 | API no **Fly.io GRU** + `api.thlgasdopovo.com.br` | ✅ |
| 2.1 | Vercel `NEXT_PUBLIC_API_URL` → API Fly | ✅ |
| 2.1 | Dashboard master em batch (menos queries) | ✅ |
| 2.2 | CI GitHub Actions (path filter) | ✅ |
| 2.2 | Deploy seletivo (Railway/Fly release, Vercel ignoreCommand) | ✅ |
| 2.2 | Migration só se pendente | ✅ |
| 2.2 | Fix redeploy Vercel (mesmo commit / env) | ✅ |
| 2.2 | Ambiente **staging** | ⏳ |
| 2.3 | Upstash Redis — cache dashboard | ⏳ |
| 2.4 | Sentry + uptime `/health` | ⏳ |
| 2.4 | Backups Neon documentados | ⏳ |
| — | Pausar/desligar **Railway** (após 24–48h estáveis) | ⏳ |
| — | **Rotacionar senha Neon** (exposta no chat) | ⏳ Prioridade segurança |
| — | App mobile: EAS com `EXPO_PUBLIC_API_URL` = `api.thlgasdopovo.com.br` | ✅ Commit `a2787ab` |

---

## Sprint 3 — Refinamentos operacionais (web + API)

**Status:** ⏳ Próximo foco de produto (após pendências de segurança do Sprint 2).

| # | Tarefa | Prioridade |
|---|--------|------------|
| 3.1 | Badge de **pendências** (vendas retroativas + mobile aguardando aprovação) | Alta |
| 3.2 | Expandir **AuditService** (exclusões, alterações críticas) | Média |
| 3.3 | Relatórios: exportação **PDF/Excel** além de CSV | Média |
| 3.4 | Filtros avançados nos relatórios | Média |
| 3.5 | Testes **E2E** Playwright (login → nova venda → aprovação) | Média |
| 3.6 | Revalidar checklist pós-deploy (venda → estoque → resumo diário) | Alta |

**Entregáveis:** UX mais clara para aprovações pendentes; cobertura E2E mínima.

---

## Fase 2 — Fiscal e financeiro (Q3–Q4 2026)

| Módulo | Descrição | Dependências |
|--------|-----------|--------------|
| **Fiscal** | NFC-e/NF-e via `FiscalProvider` (stub em `packages/shared/src/fiscal/`) | Escolha de provedor |
| **Contas a pagar** | Títulos de fornecedores vinculados a `PurchaseInvoice` | Fiscal parcial |
| **Contas a receber** | Títulos de vendas a prazo / fiado | Formas de pagamento ✅ |
| **Fluxo de caixa** | Consolidação entradas/saídas por loja e período | Contas a pagar/receber |
| **DRE simplificado** | Receita líquida, CMV, margem (base já existe no resumo) | Custo fornecedor ✅ |

**Ordem sugerida:** provedor fiscal → emissão NF venda → contas a receber → contas a pagar → fluxo de caixa.

---

## Fase 3 — Crescimento e novos canais

| Item | Descrição | Prioridade |
|------|-----------|------------|
| **SSE / real-time** | Substituir polling 15–30s (mapa, sidebar, resumo) | Média |
| **App cliente** | Pedido online, rastreamento, Pix/cartão | Média |
| **WhatsApp Business** | Notificações e pedidos | Média |
| **Redis / filas** | Jobs assíncronos (Upstash) | Média |
| **Multi-tenant SaaS** | Onboarding self-service, billing por loja | Baixa |
| **iOS entregador** | TestFlight + App Store | Baixa |

---

## Já entregue (referência rápida — jun/jul 2026)

### Produto
- MVP web + API em produção (vendas, estoque, entregas, resumo diário, RBAC)
- Fornecedores, compras, relatórios CSV
- Formas de pagamento + taxas + margem
- Clientes por loja + preço por cliente
- Mapa GPS, push FCM, venda mobile com aprovação
- Pagamentos múltiplos, geocoding, sugestão de entregador
- Inativar vs excluir (usuários, lojas, clientes, entregadores)
- Aba entregadores no master
- App na Google Play
- Loading com app-icon + pulsação; favicon alinhado à marca
- Métricas de entrega: tempo até aceitar, em rota e total (`f427a17`)
- Painéis/relatórios contabilizam vendas efetivadas (`4bbf3dd`)

### Infra (Sprint 2)
- API Fly.io GRU + `api.thlgasdopovo.com.br`
- Web Vercel apontando para a nova API
- CI GitHub Actions, deploy seletivo, migrations condicionais
- Mobile EAS apontando para API Fly
- Latência ~20–50× melhor no dashboard/health

---

## Como priorizar agora

1. **Segurança:** rotacionar senha Neon e atualizar secrets no Fly (e Railway se ainda ativo).
2. **Fechar Sprint 2:** pausar Railway; opcionalmente Sentry/uptime e staging.
3. **Fechar Sprint 2:** pausar Railway; opcionalmente Sentry/uptime e staging.
4. **Sprint 3** ou **Fase 2 (fiscal)** — alinhar com o cliente piloto.
5. **Fase 3** real-time só se o polling de 15s continuar incomodando no dia a dia.
