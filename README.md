# Gas ERP

Sistema de gestão multi-loja para distribuidoras/revendas de gás (GLP).

**Cliente piloto:** Rede Gás Litoral / THL Gás do Povo — [thlgasdopovo.com.br](https://thlgasdopovo.com.br)

## Stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 + Tailwind
- **API:** NestJS + Prisma
- **Mobile:** Expo SDK 56 (app entregador, Android)
- **Banco:** PostgreSQL

## Estrutura

```
apps/web          Painel web (master + loja)
apps/api          REST API NestJS
apps/mobile       App entregador (Expo SDK 56, Android)
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

## Estado atual (jun/2026)

MVP **em produção** e funcional. Além do ciclo inicial (vendas, resumo diário, RBAC, app entregador), o sistema inclui **fornecedores, compras, relatórios, formas de pagamento com taxas, margem/custo, mapa de entregadores, venda pelo app do entregador com aprovação** e **preços por cliente**.

| Área | Status |
|------|--------|
| Deploy (Vercel + Railway + Neon) | ✅ No ar |
| Domínio `thlgasdopovo.com.br` | ✅ |
| Auth + JWT multi-tenant | ✅ |
| Painel master (lojas, usuários, dashboard consolidado) | ✅ |
| Painel loja (vendas, clientes, estoque, fornecedores, compras, relatórios) | ✅ |
| Resumo diário com filtro De/Até + auto-refresh 15s + métricas por entregador | ✅ |
| Paginação nas listas (vendas, clientes, produtos, estoque, usuários) | ✅ |
| Venda: canal Portaria, GDP, benefício Gás do Povo, taxa entrega | ✅ |
| Venda: data retroativa com aprovação gerente + log | ✅ |
| Venda pelo app entregador com aprovação na loja | ✅ |
| Minha conta (perfil + senha) | ✅ |
| Recuperação de senha (Resend) | ✅ Código + domínio verificado; e-mails funcionando |
| Permissões por tela (RBAC granular) | ✅ |
| Vínculo usuário ↔ múltiplas lojas | ✅ Checkboxes no cadastro |
| Clientes por loja + preço negociado por cliente/produto | ✅ |
| Fornecedores + notas de compra (entrada de estoque) | ✅ |
| Formas de pagamento por loja + taxas + receita líquida | ✅ |
| Custo fornecedor + margem bruta (produtos, resumo, relatório) | ✅ |
| Mapa de entregadores (presença GPS + disponibilidade) | ✅ |
| Entregador multi-unidade (`DelivererStore`) | ✅ |
| Push notifications (Expo + FCM) | ✅ Nova rota / cancelamento / lembrete pendente |
| App entregador (`apps/mobile`) | 🟡 MVP testado; Play Store pendente |
| Módulo fiscal / financeiro completo | ⏳ Fase 2 |

Documentação: [docs/development.md](docs/development.md) · [docs/deployment.md](docs/deployment.md) · [docs/architecture.md](docs/architecture.md) · [docs/api-contracts.md](docs/api-contracts.md)

## Módulos MVP

### Autenticação e conta
- Login JWT com `organizationId`, `storeIds[]` e `permissions[]`
- **Minha conta** — `/master/settings` (master) ou `/store/[storeId]/settings` (loja)
- **Recuperação de senha** — `/forgot-password` → e-mail Resend → `/reset-password`
- `PATCH /auth/me` e `POST /auth/change-password`

### Painel master
- Dashboard consolidado (cards por unidade + **resumo diário consolidado** de todas as lojas, auto-refresh 15s)
- Filtro de período **De/Até** no dashboard master
- CRUD de lojas e usuários (paginação 20/página)
- **Ir para loja** — `/master/go-to-store` (sem seletor fixo na sidebar)
- Permissões por tela por usuário (checkboxes)
- Vínculo com **uma ou mais lojas** por usuário (`StoreMultiSelect`)

### Painel loja
- Menu filtrado por permissões do usuário (`/store/[storeId]/daily-summary` é a tela inicial padrão)
- Guard de rota — URLs não autorizadas redirecionam
- **Nova venda** — wizard (cliente → produto → entrega/portaria), CEP automático, cadastro rápido de cliente, benefício Gás do Povo (pagamento GDP), **seleção de data da venda**, preço por cliente
- **Data retroativa** — atendente informa motivo; gerente/master aprova ou rejeita; log em `SaleBackdateLog`
- **Venda mobile** — entregador cria venda no app; loja aprova/rejeita (`mobileApproval`)
- Vendas: histórico paginado, status Portaria, edição/cancelamento por gerente
- Clientes **por loja**, endereços, preços negociados por produto, histórico paginado
- Produtos e estoque por loja (listagens paginadas, custo fornecedor e margem)
- **Fornecedores** e **Compras** (notas de entrada de estoque)
- **Formas de pagamento** — `/store/[storeId]/settings/payment-methods` (taxas e receita líquida)
- **Relatórios** — vendas, compras, estoque + exportação CSV
- Transferências entre unidades
- Entregadores, **mapa de entregadores** (presença GPS) e entregas (sidebar + push)
- **Resumo diário** com filtro De/Até, auto-refresh 15s, métricas por entregador
- API de tracking GPS (app mobile)

## Rotas principais (web)

| Rota | Quem |
|------|------|
| `/login` | Público |
| `/forgot-password`, `/reset-password` | Público |
| `/master` | ORG_MASTER |
| `/master/users`, `/master/stores` | ORG_MASTER |
| `/master/settings` | ORG_MASTER — Minha conta |
| `/master/go-to-store` | ORG_MASTER — escolher loja |
| `/store/[storeId]/daily-summary` | Resumo diário (tela inicial da loja) |
| `/store/[storeId]/suppliers`, `/purchases`, `/reports` | Conforme permissão |
| `/store/[storeId]/deliverers/map` | Mapa de entregadores |
| `/store/[storeId]/settings/payment-methods` | Formas de pagamento (gerente/financeiro) |
| `/store/[storeId]/*` | Usuários com acesso à loja |
| `/settings` | Redirect conforme papel |

## Deploy

Guia completo: [docs/deployment.md](docs/deployment.md)

### Produção (no ar)

| | |
|---|---|
| **App** | https://thlgasdopovo.com.br |
| **API** | https://gas-erpapi-production.up.railway.app/api/v1 |
| **Health** | https://gas-erpapi-production.up.railway.app/api/v1/health |
| **GitHub** | `lvlparticipacoesltda/gas-erp` |
| **Stack** | Vercel (web) + Railway (API) + Neon (PostgreSQL) |
| **DNS** | Hostinger → Vercel |

**Infraestrutura por fase:**

| Fase | Sugestão |
|------|----------|
| MVP (agora) | Vercel + Railway + Neon — sem VPS |
| Crescimento | Web na Vercel; API em VPS/Fly; Redis (Upstash) |
| Alto volume | VPS ou Kubernetes + Postgres gerenciado |

## Migrations (banco)

20 migrations até `20260627180000_customer_per_store`. Ver lista completa em [docs/development.md](docs/development.md#migrations-aplicadas).

Aplicar em produção: `pnpm db:deploy` (também roda no `releaseCommand` do Railway).

No Neon, configure `DIRECT_URL` (host sem `-pooler`) além de `DATABASE_URL` para evitar lock em migrations — ver [docs/deployment.md](docs/deployment.md).

## App entregador (mobile)

```bash
cd apps/mobile
cp .env.example .env
npx expo start --dev-client    # com dev build instalado no emulador
eas build -p android --profile preview   # APK para celulares
```

Funcionalidades: entregas (aguardando/em rota), GPS em background, push (FCM), **criar venda** com aprovação na loja, histórico, presença no mapa.

Guia completo: [docs/development.md](docs/development.md) · Push FCM: [docs/mobile-push-fcm.md](docs/mobile-push-fcm.md) · Play Store: [docs/playstore-checklist.md](docs/playstore-checklist.md)

## Próximos passos

Ver [docs/deployment.md#próximos-passos](docs/deployment.md#próximos-passos) e [docs/development.md](docs/development.md). Resumo:

1. Confirmar `pnpm db:deploy` em produção (20 migrations)
2. Finalizar Resend + trocar senhas demo
3. Publicação Play Store (AAB + política de privacidade)
4. **Fase 2:** fiscal, financeiro completo, relatórios avançados
