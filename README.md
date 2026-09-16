# Gas ERP

Sistema de gestão multi-loja para distribuidoras/revendas de gás (GLP).

**Cliente piloto:** Rede Gás Litoral / THL Gás do Povo — [thlgasdopovo.com.br](https://thlgasdopovo.com.br)

## Stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 + Tailwind
- **API:** NestJS + Prisma
- **Mobile:** Expo SDK 56 (app entregador + ponto do atendente, Android)
- **Banco:** PostgreSQL

## Estrutura

```
apps/web          Painel web (master + loja)
apps/api          REST API NestJS
apps/mobile       App entregador + ponto do atendente (Expo SDK 56, Android)
packages/database Prisma schema + seeds + migrations
packages/shared   Types, Zod schemas, enums, permissões, métricas
```

## Setup local

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir PostgreSQL (Docker ou Homebrew)
docker compose up -d

# 3. Configurar ambiente
cp .env.example .env

# 4. Migrar e popular banco
pnpm db:push    # dev rápido
# ou
pnpm db:deploy  # migrations (recomendado, igual produção)
pnpm db:seed

# 5. Rodar em desenvolvimento
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1

## Credenciais demo (seed)

| Usuário | E-mail | Senha | Papel |
|---------|--------|-------|-------|
| Master | master@gas.com | admin123 | ORG_MASTER |
| Gerente | gerente@gas.com | admin123 | STORE_MANAGER |
| Atendente | atendente@gas.com | admin123 | ATTENDANT |
| Entregador | entregador@gas.com | admin123 | DELIVERER |

> Em produção, troque essas senhas após validar o login.

## Estado atual (set/2026)

MVP **em produção** e funcional. Além do ciclo operacional (vendas, estoque, entregas, RBAC), o sistema inclui **RH (escalas, horários, cartão de ponto, atestados)**, **gastos e resultado por unidade**, **vasilhames emprestados**, **sessões/dispositivos confiáveis**, **notificações + SSE**, **fechamento**, cupom de venda e exportação XLSX de clientes. API no Fly.io GRU.

| Área | Status |
|------|--------|
| Deploy (Vercel + Fly.io GRU + Neon) | ✅ No ar |
| Domínio `thlgasdopovo.com.br` | ✅ |
| Auth + JWT multi-tenant + sessões (`sid`) + logout | ✅ |
| Dispositivos confiáveis (pairing web ↔ mobile) | ✅ |
| Painel master (lojas, usuários, sessões, entregadores, escalas, financeiro) | ✅ |
| Painel loja (vendas, clientes, estoque, compras, equipe, gastos, relatórios) | ✅ |
| Resumo diário De/Até + SSE (fallback 60s) + métricas por entregador | ✅ |
| Fechamento (loja + consolidado master) | ✅ |
| Paginação nas listas (vendas, clientes, produtos, estoque, usuários) | ✅ |
| Venda: Portaria, GDP, taxa entrega, data retroativa, preço por cliente | ✅ |
| Venda pelo app entregador com aprovação na loja | ✅ |
| Master edita itens/valores de venda já registrada | ✅ |
| Cupom/recibo da venda (impressão / PDF) | ✅ |
| Recuperação de senha (Resend) | ✅ |
| RBAC granular (inclui vasilhames, escalas, horários, ponto) | ✅ |
| Clientes por loja + categorias (P13/P20/P45/Gás do Povo) + preço negociado | ✅ |
| Exportação XLSX da base de clientes (master) | ✅ |
| Fornecedores + notas de compra (entrada; trava vasilhame ↔ cheio) | ✅ |
| Formas de pagamento + taxas + receita líquida + margem | ✅ |
| **Gastos da empresa** por unidade (competência) + custo/lucro líquido | ✅ |
| **Resultado por unidade** (`/master/results`) | ✅ |
| Vasilhames emprestados (comodato, sem movimentar estoque) | ✅ |
| Escalas, horários semanais, cartão de ponto, justificativas/atestados | ✅ |
| Mapa de entregadores + venda mobile + push FCM | ✅ |
| Notificações master (portaria / cancelamento) + SSE org/loja | ✅ |
| App mobile (`THLGDP Entregador`) | ✅ Play Store — entregador (mapa/venda) + atendente (escala/ponto) |
| Módulo fiscal / contas a pagar-receber / fluxo de caixa | ⏳ Fase 2 |

Documentação: [docs/development.md](docs/development.md) · [docs/deployment.md](docs/deployment.md) · [docs/fly-migration.md](docs/fly-migration.md) · [docs/infrastructure-plan.md](docs/infrastructure-plan.md)

## Módulos MVP

### Autenticação e conta
- Login JWT com `organizationId`, `storeIds[]`, `permissions[]` e `sessionId` (`sid`)
- **Sessões** — `/master/sessions` (listar e revogar; `POST /auth/logout`)
- **Dispositivos confiáveis** — pairing web ↔ mobile (`/auth/trusted-devices`)
- **Minha conta** — `/master/settings` (master) ou `/store/[storeId]/settings` (loja)
- **Recuperação de senha** — `/forgot-password` → e-mail Resend → `/reset-password`
- `PATCH /auth/me` e `POST /auth/change-password`
- Cadastro de usuário gera senha aleatória se nenhuma for informada

### Painel master
- Dashboard consolidado (cards por unidade + estoque final P13 + **resumo consolidado**; SSE org, fallback 60s)
- **Fechamento** consolidado — `/master/dashboard/fechamento`
- Filtro de período **De/Até**
- CRUD de lojas, usuários e entregadores (paginação 20/página; **inativar** ou **excluir**)
- **Sessões ativas** — `/master/sessions`
- **Escalas, horários semanais e cartão de ponto** (com atestados/justificativas)
- **Resultado por unidade** e **gastos da empresa**
- Compras consolidadas, transferências entre unidades, relatórios
- **Ir para loja** — `/master/go-to-store`
- Permissões por tela + vínculo com **uma ou mais lojas** (`StoreMultiSelect`)
- Notificações (venda Portaria / cancelamento)

### Painel loja
- Menu em grupos (Operação, Estoque, Equipe, Financeiro, Relatórios) filtrado por permissão
- Guard de rota — URLs não autorizadas redirecionam
- **Nova venda** — wizard (cliente → produto → entrega/portaria), CEP, cadastro rápido, GDP, data da venda, preço por cliente
- **Data retroativa** e **venda mobile** com aprovação
- Vendas: histórico (bairro + produtos), cupom, edição de itens pelo master, cancelamento por gerente
- Clientes **por loja**, categorias, preços negociados, exportação XLSX (master)
- **Vasilhames emprestados** (comodato; não mexe no estoque)
- Produtos e estoque (custo/margem; trava entrada de cheio vs vasilhame vinculado)
- **Fornecedores** e **Compras** (notas de entrada)
- **Gastos da empresa** — `/store/[storeId]/expenses` (master/financeiro): competência, categorias, parcelas, pago/pendente. Toda despesa tem `storeId` obrigatório
- **Formas de pagamento**, **relatórios** CSV, transferências
- Entregadores, mapa GPS, escalas, horários, cartão de ponto
- **Resumo diário** + **fechamento** da unidade (SSE loja, fallback 60s)

## Rotas principais (web)

| Rota | Quem |
|------|------|
| `/login` | Público |
| `/forgot-password`, `/reset-password` | Público |
| `/master` | ORG_MASTER — visão geral |
| `/master/users`, `/master/stores`, `/master/sessions` | ORG_MASTER |
| `/master/deliverers`, `/master/deliverers/map` | ORG_MASTER |
| `/master/schedules`, `/horarios`, `/ponto` | Escalas, horários, cartão de ponto |
| `/master/results` | Resultado por unidade |
| `/master/expenses` | Gastos da empresa (master / financeiro) |
| `/master/purchases`, `/master/stock/transfers`, `/master/reports` | Compras, transferências, relatórios |
| `/master/dashboard/fechamento` | Fechamento consolidado |
| `/master/settings` | Minha conta |
| `/master/go-to-store` | Escolher loja |
| `/store/[storeId]/daily-summary` | Resumo diário (tela inicial) |
| `/store/[storeId]/daily-summary/fechamento` | Fechamento da unidade |
| `/store/[storeId]/vasilhame-loans` | Vasilhames emprestados |
| `/store/[storeId]/schedules`, `/horarios`, `/ponto` | Escalas e ponto |
| `/store/[storeId]/suppliers`, `/purchases`, `/reports` | Conforme permissão |
| `/store/[storeId]/deliverers/map` | Mapa de entregadores |
| `/store/[storeId]/expenses` | Gastos da unidade (master/financeiro) |
| `/store/[storeId]/sales/[saleId]/receipt` | Cupom da venda |
| `/store/[storeId]/settings/payment-methods` | Formas de pagamento |
| `/store/[storeId]/*` | Usuários com acesso à loja |
| `/settings` | Redirect conforme papel |

## Deploy

Guia completo: [docs/deployment.md](docs/deployment.md)

### Produção (no ar)

| | |
|---|---|
| **App** | https://thlgasdopovo.com.br |
| **API** | https://api.thlgasdopovo.com.br/api/v1 (Fly.io **GRU**) |
| **Health** | https://api.thlgasdopovo.com.br/api/v1/health |
| **GitHub** | `lvlparticipacoesltda/gas-erp` |
| **Stack** | Vercel (web) + Fly.io GRU (API) + Neon (PostgreSQL sa-east-1) |
| **DNS** | Hostinger → Vercel (web); `api.` → Fly.io |

**Infraestrutura por fase:**

| Fase | Sugestão |
|------|----------|
| **Atual** | Vercel + Fly.io GRU + Neon — API e banco no Brasil |
| Crescimento | + Redis (Upstash sa-east-1), staging, Sentry |
| Alto volume | VPS ou Kubernetes + Postgres dedicado |

## Migrations (banco)

**46 migrations** até `20260806160000_time_clock_justifications`. Ver lista em [docs/development.md](docs/development.md#migrations-aplicadas).

Aplicar em produção: `pnpm db:deploy` (também roda no `release_command` do Fly via `scripts/fly-release.sh`).

No Neon, configure `DIRECT_URL` (host sem `-pooler`) além de `DATABASE_URL` para evitar lock em migrations — ver [docs/deployment.md](docs/deployment.md).

## App entregador (mobile)

```bash
cd apps/mobile
cp .env.example .env
npx expo start --dev-client    # com dev build instalado no emulador
eas build -p android --profile preview   # APK para celulares
```

Nome no dispositivo: **THLGDP Entregador**. Entregador: mapa in-app, entregas, GPS, push, criar venda, histórico. Atendente: aba **Escala** + bater ponto (GPS 100 m + selfie).

Guia completo: [docs/development.md](docs/development.md) · Push FCM: [docs/mobile-push-fcm.md](docs/mobile-push-fcm.md) · Play Store: [docs/playstore-checklist.md](docs/playstore-checklist.md)

## Próximos passos

Roadmap completo com sprints: **[docs/roadmap.md](docs/roadmap.md)**

| Sprint | Foco |
|--------|------|
| **Sprint 1** | Redirect `www` (opcional) |
| **Sprint 2** | Infra: API Fly GRU ✅, CI ✅, SSE ✅ — pendente: staging, Redis, Sentry, pausar Railway |
| **Sprint 3** | Badges de pendências, E2E, relatórios PDF/Excel |
| **Fase 2** | Fiscal (NFC-e/NF-e), contas a pagar/receber, fluxo de caixa |
| **Fase 3** | App cliente, WhatsApp, Redis pub/sub, SaaS multi-tenant |

Detalhes operacionais: [docs/deployment.md#próximos-passos](docs/deployment.md#próximos-passos)
