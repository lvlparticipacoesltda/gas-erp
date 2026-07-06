# Plano de infraestrutura — latência, deploy e evolução

Documento de planejamento para **Sprint 2** e fases seguintes. Atualizado jul/2026.

**Relacionado:** [roadmap.md](roadmap.md) · [deployment.md](deployment.md) · [architecture.md](architecture.md)

---

## Já implementado (Sprint 2 — B, C e cutover)

| Item | Onde / nota |
|------|-------------|
| Dashboard master em batch (5 queries fixas vs N×loja) | `dashboard.service.ts` |
| Requests lentos logados (`SLOW_REQUEST_MS`) | `request-timing.interceptor.ts` |
| Queries lentas opcionais (`PRISMA_LOG_QUERIES=true`) | `prisma.service.ts` |
| Migration só se pendente | `scripts/release-migrate.sh` |
| API no **Fly.io GRU** | `Dockerfile`, `fly.toml` |
| Domínio **`api.thlgasdopovo.com.br`** | CNAME → `gas-erp-api.fly.dev` (DNS Vercel) |
| Web Vercel → nova API | `NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1` |
| CI path filter + deploy seletivo | `.github/workflows/ci.yml`, `vercel-should-build.sh` |
| Benchmark | `pnpm benchmark:api` — health ~59 ms, master ~71 ms (jul/2026) |

**Cutover concluído.** Pendências: rotacionar senha Neon, pausar Railway, Sentry/staging/Redis (opcional). Ver [roadmap.md](roadmap.md).

---

## Diagnóstico: de onde vem o “delay”?

Hoje existem **três tipos diferentes** de lentidão. Tratar tudo como “problema de infra” leva a decisões erradas.

| Tipo | Sintoma | Causa principal | Onde atuar |
|------|---------|-----------------|------------|
| **A — Percepção na UI** | Dashboard/mapa “atualiza sozinho” a cada 15–20s | Polling intencional (`useLiveQuery`, mapa, sidebar entregas) | Produto: SSE/WebSocket ou push |
| **B — Latência de request** | Clique demora 1–3s+ para responder | API ↔ banco distantes, queries pesadas, cold start | Infra + otimização SQL |
| **C — Delay de deploy** | Push → produção leva 8–15 min | Build monorepo completo + migration no `releaseCommand` | CI/CD + deploy seletivo |

### Arquitetura atual (produção — jul/2026)

```
Usuário (Brasil)
    │
    ▼
Vercel — Next.js (apps/web)          ← CDN/edge
    │  NEXT_PUBLIC_API_URL
    ▼
Fly.io GRU — NestJS (apps/api)       ← São Paulo (api.thlgasdopovo.com.br)
    │  DATABASE_URL (pooler)
    ▼
Neon PostgreSQL (sa-east-1)          ← banco no Brasil
```

**Latência B resolvida no Sprint 2:** API e banco agora na mesma região (~59 ms health vs ~1–3 s no Railway EUA).

### Polling atual (tipo A — não é bug de rede)

| Tela / app | Intervalo | Arquivo |
|------------|-----------|---------|
| Resumo diário / dashboard master | 15s | `apps/web/src/hooks/use-live-query.ts` |
| Mapa de entregadores | 15s | `deliverers/map/page.tsx` |
| Sidebar entregas | 20s | `deliveries-sidebar.tsx` |
| App entregador — lista | 30s | `apps/mobile/src/hooks/useDeliveries.ts` |
| App entregador — presença GPS | 15s | `apps/mobile/src/lib/location.ts` |

Ou seja: mesmo com infra perfeita, o usuário **não verá mudanças instantâneas** nessas telas até migrarmos para eventos em tempo real.

---

## Visão de evolução (não é “um único sistema” amanhã)

Não recomendamos migrar tudo para um monolito único de imediato. O caminho natural é **colocar os componentes na mesma região** e **substituir polling por eventos**, mantendo o monorepo.

```
Hoje (MVP)                    Curto prazo (Sprint 2–3)           Médio prazo (Fase 3)
─────────────────────────────────────────────────────────────────────────────────────
Vercel + Fly GRU + Neon   →   + cache Redis + staging        →   SSE/WebSocket real-time
Deploy seletivo + CI      →   Sentry + uptime                →   Staging obrigatório
Polling 15–30s            →   Cache dashboard 10s           →   Real-time (Redis pub/sub)
```

### Opções de “stack unificada” (futuro)

| Opção | Prós | Contras | Quando considerar |
|-------|------|---------|-------------------|
| **Manter Vercel + API regional BR** | Web já funciona; menor risco | Ainda 2 provedores | **Recomendado agora** |
| **Fly.io GRU (API) + Neon sa-east-1** | API e DB no Brasil | Custo ~US$ 5–7/mês | ✅ **Implementado jul/2026** |
| **VPS BR (Hetzner não tem BR; Locaweb/DO)** | Controle total, custo fixo | Você opera OS, backups, SSL | Time com ops ou >50 lojas |
| **Supabase sa-east-1** | DB + realtime + auth | Reescrever auth/queries; lock-in | Greenfield ou refactor grande |
| **Railway tudo** | Um painel | Web Next.js no Railway é ok; região SA limitada | Se Railway liberar SA |
| **Monolito Next.js full-stack** | Um deploy | NestJS viraria Route Handlers; refactor enorme | Não recomendado |

**Conclusão:** o melhor custo/benefício é **regionalizar a API** (Fly.io GRU ou VPS BR) + **Redis (Upstash sa-east-1)** + **eventos**, mantendo Vercel para o painel web.

---

## Sprint 2 — Plano de infraestrutura (detalhado)

### Bloco 1 — Baseline e medição (semana 1)

Sem métricas, otimização vira chute.

| # | Tarefa | Done quando |
|---|--------|-------------|
| 2.0.1 | Confirmar **região Railway** da API (Settings → Region) | Documentado |
| 2.0.2 | Medir latência: `curl -w "%{time_total}"` health + login + dashboard | Baseline registrada |
| 2.0.3 | Ativar **Sentry** (API + web) ou logs estruturados com tempo de request | Erros e p95 visíveis |
| 2.0.4 | Uptime no `/api/v1/health` (Better Stack, UptimeRobot, etc.) | Alerta se API cair |
| 2.0.5 | Neon: revisar **compute size** e auto-suspend (cold start do banco) | Config anotada |

**Metas de referência (Brasil, usuário final):**

| Endpoint | Alvo p95 |
|----------|----------|
| `GET /health` | < 200 ms |
| `POST /auth/login` | < 500 ms |
| `GET /dashboard/store` (1 loja) | < 800 ms |
| `GET /dashboard/master` (3–5 lojas) | < 1,5 s |

### Bloco 2 — Colocar API perto do banco (semana 1–2)

**Maior ganho de latência B com menor refactor.**

| # | Tarefa | Notas |
|---|--------|-------|
| 2.1.1 | Deploy API no **Fly.io GRU** | ✅ Arquivos prontos — seguir [fly-migration.md](fly-migration.md) |
| 2.1.2 | Subdomínio **`api.thlgasdopovo.com.br`** → Fly | Atualizar `NEXT_PUBLIC_API_URL` na Vercel + redeploy |
| 2.1.3 | Manter Neon sa-east-1; `DATABASE_URL` continua pooler | `DIRECT_URL` só migrations |
| 2.1.4 | Smoke test: login, venda, dashboard, mobile | Mesma URL base `/api/v1` |

Alternativa mais simples (se Railway permitir região SA no futuro): só mudar região do serviço Railway.

### Bloco 3 — Deploy mais rápido e previsível (semana 2)

Hoje **cada push** pode rebuildar web + API e rodar migrations.

| # | Tarefa | Impacto |
|---|--------|---------|
| 2.2.1 | **GitHub Actions**: build seletivo em PR/push | ✅ `.github/workflows/ci.yml` |
| 2.2.2 | **Deploy seletivo**: Fly só se API/packages mudou; Vercel só se web mudou | ✅ |
| 2.2.3 | **Migration gate**: release só quando há migration nova | ✅ `release-migrate.sh` |
| 2.2.4 | Ambiente **staging** (Neon branch + Vercel preview) | ⏳ |

Arquivos envolvidos: `fly.toml`, `Dockerfile`, `apps/web/vercel.json`, `.github/workflows/ci.yml`.

### Bloco 4 — Cache e queries (semana 2–3)

| # | Tarefa | Impacto |
|---|--------|---------|
| 2.3.1 | **Upstash Redis** (sa-east-1): cache `GET /dashboard/*` TTL 10s por `orgId+storeId+dateRange` | Dashboard master muito mais rápido no poll |
| 2.3.2 | Otimizar `masterOverview`: hoje faz **N × (3–4 queries)** por loja | Consolidar agregações SQL ou usar `computeDashboardForStores` uma vez |
| 2.3.3 | Revisar índices Prisma: `Sale(storeId, saleDate)`, `Delivery(status, delivererId)` | Verificar `EXPLAIN` nas queries mais lentas |
| 2.3.4 | Prisma: `connection_limit` na URL do pooler Neon | Evitar esgotar conexões |

### Bloco 5 — Staging + observabilidade (semana 3)

Itens originais do Sprint 2, mantidos:

- Staging branch + variáveis separadas
- CI/CD completo
- Sentry + uptime
- Backups Neon documentados

---

## Sprint 3+ — Reduzir delay percebido (tipo A)

Infra sozinha **não elimina** o polling de 15s. Para “conversar melhor” em tempo real:

| Fase | Solução | Esforço |
|------|---------|---------|
| **3a** | Redis pub/sub + **SSE** no NestJS para entregas e posições GPS | Médio |
| **3b** | Invalidar cache dashboard no `POST/PATCH` de vendas | Baixo |
| **3c** | WebSocket gateway NestJS (substituir polling mapa/sidebar) | Médio-alto |
| **3d** | Mobile: push já existe; reduzir poll de 30s → 60s onde push cobre | Baixo |

Ordem sugerida: **3b → 3a → 3d → 3c**.

---

## Roadmap de migração regional (se latência B continuar alta)

```
Etapa 0 — Antes (jun/2026)
  Vercel (web) + Railway (API, EUA) + Neon (sa-east-1)

Etapa 1 — Atual (jul/2026) ✅
  Vercel (web) + Fly.io GRU (API) + Neon (sa-east-1)

Etapa 2 — Crescimento
  + Staging + Redis cache dashboard + SSE entregas

Etapa 3 — Alto volume / fiscal
  VPS ou K8s em SP + Postgres dedicado (ou Neon scale)
  Redis dedicado; filas (BullMQ) para NF-e e jobs pesados
```

**Não migrar web da Vercel** no curto prazo — CDN global e DX são bons; o gargalo é API ↔ DB.

---

## Checklist rápido — o que fazer primeiro?

Prioridade se o objetivo é **menos delay percebido agora**:

1. [x] Colocar API no Brasil (Bloco 2) — **concluído jul/2026**
2. [ ] Cache Redis no dashboard (Bloco 4) — **segundo maior ROI**
3. [ ] Pausar Railway (fallback legado)
4. [ ] Deploy seletivo no CI (Bloco 3) — ✅ concluído
5. [ ] Explicar ao time que polling 15s é comportamento atual (tipo A)
6. [ ] Sprint 3: SSE + invalidação de cache após vendas

---

## Decisões em aberto (validar com o time)

| Pergunta | Opções |
|----------|--------|
| Orçamento mensal infra? | Neon free → scale; Fly ~$5–15; Upstash free tier |
| Aceita migrar API Railway → Fly.io GRU? | Sim / Não / só se latência > X ms |
| Staging obrigatório antes de prod? | Recomendado sim |
| Real-time substitui polling em quais telas primeiro? | Mapa + sidebar entregas (maior impacto operacional) |

---

## Referências no código

| Área | Arquivo |
|------|---------|
| Polling web | `apps/web/src/hooks/use-live-query.ts` |
| Dashboard pesado | `apps/api/src/modules/dashboard/dashboard.service.ts` |
| Deploy API | `fly.toml`, `Dockerfile`, `scripts/fly-deploy.sh` |
| Deploy web | `apps/web/vercel.json` |
| Prisma | `apps/api/src/prisma/prisma.service.ts` |
| Pooler Neon | `DATABASE_URL` com `-pooler`; migrations via `DIRECT_URL` |
