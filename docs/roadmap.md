# Roadmap — Gas ERP

Planejamento de fases e sprints do projeto. Atualizado em **jul/2026**.

**Documentação relacionada:** [deployment.md](deployment.md) · [playstore-checklist.md](playstore-checklist.md) · [development.md](development.md) · [infrastructure-plan.md](infrastructure-plan.md)

---

## Visão geral das fases

| Fase | Objetivo | Status |
|------|----------|--------|
| **Fase 0 — MVP operacional** | Web + API + mobile em produção para 1 rede piloto | ✅ Concluída |
| **Fase 1 — Consolidação** | Play Store, segurança, infra mínima, refinamentos operacionais | 🟡 Quase concluída (falta redirect `www`) |
| **Fase 2 — Fiscal e financeiro** | NFC-e/NF-e, contas a pagar/receber, fluxo de caixa | ⏳ Planejada |
| **Fase 3 — Crescimento** | App cliente, WhatsApp, real-time, multi-tenant SaaS | ⏳ Backlog |

---

## Sprint 1 — Publicação mobile e segurança

**Meta:** entregadores usando app via Play Store; ambiente de produção seguro.

**Status:** 🟡 Quase concluído — falta apenas redirect `www` (1.7).

| # | Tarefa | Status |
|---|--------|--------|
| 1.1 | Confirmar **21 migrations** em produção (`pnpm db:deploy`) | ✅ |
| 1.2 | Trocar **senhas demo** (`admin123`) em produção | ✅ |
| 1.3 | Build **AAB produção** (`eas build --profile production`) | ✅ |
| 1.4 | Gravar **vídeo** da divulgação GPS (Play Store) | ✅ |
| 1.5 | Preencher **Data safety** + declaração background location | ✅ |
| 1.6 | Publicar app na Play Store (`eas submit` → produção) | ✅ |
| 1.7 | Redirect **`www`** → apex na Vercel | ⏳ |

**Entregável restante:** redirect `www`.

---

## Sprint 2 — Infraestrutura, latência e deploy

**Meta:** API e banco na mesma região, deploy previsível, baseline de latência, cache onde importa.

**Plano detalhado:** [infrastructure-plan.md](infrastructure-plan.md)

| Bloco | Foco | Semana |
|-------|------|--------|
| **2.0 Baseline** | Medir latência, região Railway, Sentry, uptime | 1 |
| **2.1 Regional** | API perto do Neon (Fly.io GRU ou equivalente) + subdomínio `api.` | 1–2 |
| **2.2 Deploy** | CI/CD, deploy seletivo, staging, migration gate | 2 |
| **2.3 Performance** | Redis cache dashboard, otimizar queries master | 2–3 |
| **2.4 Observabilidade** | Sentry, backups Neon documentados | 3 |

| # | Tarefa | Status |
|---|--------|--------|
| 2.0.1 | Confirmar região Railway vs Neon sa-east-1 | ⏳ |
| 2.0.2 | Baseline latência (health, login, dashboard) | ⏳ |
| 2.1.1 | Subdomínio `api.thlgasdopovo.com.br` | ⏳ |
| 2.1.2 | API colocalizada com banco (Fly GRU ou região SA) | ⏳ |
| 2.2.1 | GitHub Actions (lint + build + verify:deploy) | ⏳ |
| 2.2.2 | Deploy seletivo (API vs web) | ⏳ |
| 2.2.3 | Ambiente staging | ⏳ |
| 2.3.1 | Upstash Redis — cache dashboard (TTL 10s) | ⏳ |
| 2.3.2 | Otimizar `masterOverview` (N queries por loja) | ⏳ |
| 2.4.1 | Sentry + uptime `/health` | ⏳ |
| 2.4.2 | Backups Neon documentados | ⏳ |

**Entregáveis:** p95 dashboard < 1,5s; deploy < 5 min quando só web ou só API muda; staging funcional.

> **Importante:** parte do “delay” hoje é **polling de 15–30s** (comportamento de produto), não latência de rede. Ver [infrastructure-plan.md#diagnóstico-de-onde-vem-o-delay](infrastructure-plan.md).

---

## Sprint 3 — Refinamentos operacionais (web + API)

**Meta:** reduzir atrito no dia a dia da loja e do master.

| # | Tarefa | Prioridade |
|---|--------|------------|
| 3.1 | Badge de **pendências** (vendas retroativas + mobile aguardando aprovação) | Alta |
| 3.2 | Expandir **AuditService** (exclusões, alterações críticas) | Média |
| 3.3 | Relatórios: exportação **PDF/Excel** além de CSV | Média |
| 3.4 | Filtros avançados no-repeat nos relatórios (entregador, forma pagamento) | Média |
| 3.5 | Testes **E2E** Playwright (login → nova venda → aprovação) | Média |
| 3.6 | Revalidar checklist pós-deploy (venda → estoque → resumo diário) | Alta |

**Entregáveis:** UX mais clara para aprovações pendentes; cobertura E2E mínima.

---

## Fase 2 — Fiscal e financeiro (Q3–Q4 2026)

| Módulo | Descrição | Dependências |
|--------|-----------|--------------|
| **Fiscal** | NFC-e/NF-e via `FiscalProvider` (stub em `packages/shared/src/fiscal/`) | Escolha de provedor (Focus NFe, eNotas, etc.) |
| **Contas a pagar** | Títulos de fornecedores vinculados a `PurchaseInvoice` | Módulo fiscal parcial |
| **Contas a receber** | Títulos de vendas a prazo / fiado | Formas de pagamento já existem |
| **Fluxo de caixa** | Consolidação entradas/saídas por loja e período | Contas a pagar/receber |
| **DRE simplificado** | Receita líquida, CMV, margem (base já existe no resumo) | Custo fornecedor ✅ |

**Sugestão de ordem:** provedor fiscal → emissão NF venda → contas a receber → contas a pagar → fluxo de caixa.

---

## Fase 3 — Crescimento e novos canais

| Item | Descrição | Prioridade |
|------|-----------|------------|
| **App cliente** | Pedido online, rastreamento, Pix/cartão | Média |
| **WhatsApp Business** | Notificações e pedidos | Média |
| **Redis / filas** | Entregas real-time, jobs assíncronos (Upstash) | Média |
| **Multi-tenant SaaS** | Onboarding self-service, billing por loja | Baixa (schema já preparado) |
| **iOS entregador** | TestFlight + App Store | Baixa |

---

## Concluído recentemente (jun–jul/2026)

Referência para não replanejar o que já está no ar:

- Pagamentos múltiplos (web + mobile) + validação de soma
- Geocoding + sugestão de entregador por proximidade
- Páginas públicas privacidade e exclusão de conta (Play Store)
- Fix fuso UTC-3 e ranges de dashboard no fim do mês
- GPS stale + alerta quando posição para de atualizar
- Métricas entregador: rotas realizadas vs canceladas
- **Inativar vs excluir** — usuários, lojas, clientes, entregadores
- Aba **Entregadores** no painel master (`/master/deliverers`)
- Componente reutilizável `deliverers-panel.tsx` (master + loja)
- Exclusão de loja apaga vendas e transferências vinculadas

---

## Infraestrutura por escala

| Cenário | Stack sugerida |
|---------|----------------|
| **Agora** (1 rede, poucas lojas) | Vercel + Railway + Neon |
| **Crescimento** (GPS real-time, filas) | Web Vercel; API VPS/Fly; Redis Upstash |
| **Alto volume** (fiscal, integrações) | VPS/K8s + Postgres gerenciado |

---

## Como usar este documento

1. **Sprint 1** — concluir **1.7** (redirect `www`); demais itens ✅ jul/2026.
2. **Sprint 2** — foco atual: infra, latência API↔DB, CI/CD, cache — ver [infrastructure-plan.md](infrastructure-plan.md).
3. **Sprint 3** — após app publicado ou em teste interno estável.
4. **Fase 2** — alinhar com cliente piloto (prioridade fiscal vs financeiro).
5. Atualize este arquivo ao fechar cada sprint (marque itens e ajuste datas).
