# Gas ERP

Sistema de gestão multi-loja para distribuidoras/revendas de gás (GLP).

**Cliente piloto:** Rede Gás Litoral / THL Gás do Povo — [thlgasdopovo.com.br](https://thlgasdopovo.com.br)

## Stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 + Tailwind
- **API:** NestJS + Prisma
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

MVP **em produção** e funcional. Ciclo de refinamentos de vendas, resumo diário, RBAC e app entregador concluído; última entrega: **data retroativa com aprovação**.

| Área | Status |
|------|--------|
| Deploy (Vercel + Railway + Neon) | ✅ No ar |
| Domínio `thlgasdopovo.com.br` | ✅ |
| Auth + JWT multi-tenant | ✅ |
| Painel master (lojas, usuários, dashboard consolidado) | ✅ |
| Painel loja (vendas, clientes, estoque, etc.) | ✅ |
| Resumo diário com filtro De/Até + métricas por entregador | ✅ |
| Paginação nas listas (vendas, clientes, produtos, estoque, usuários) | ✅ |
| Venda: canal Portaria, GDP, benefício Gás do Povo, taxa entrega | ✅ |
| Venda: data retroativa com aprovação gerente + log | ✅ |
| Minha conta (perfil + senha) | ✅ |
| Recuperação de senha (Resend) | ✅ Código pronto; domínio Resend pode estar pendente |
| Permissões por tela (RBAC granular) | ✅ |
| Vínculo usuário ↔ múltiplas lojas | ✅ Checkboxes no cadastro |
| Sidebar entregas + métricas espera/rota | ✅ |
| Entregador multi-unidade (`DelivererStore`) | ✅ |
| Push notifications (Expo) | ✅ Nova entrega / cancelamento |
| App entregador (`apps/mobile`) | 🟡 MVP testado; Play Store pendente |
| Módulo fiscal / financeiro | ⏳ Fase 2 |

Documentação: [docs/development.md](docs/development.md) · [docs/deployment.md](docs/deployment.md) · [docs/architecture.md](docs/architecture.md) · [docs/api-contracts.md](docs/api-contracts.md)

## Módulos MVP

### Autenticação e conta
- Login JWT com `organizationId`, `storeIds[]` e `permissions[]`
- **Minha conta** — `/master/settings` (master) ou `/store/[storeId]/settings` (loja)
- **Recuperação de senha** — `/forgot-password` → e-mail Resend → `/reset-password`
- `PATCH /auth/me` e `POST /auth/change-password`

### Painel master
- Dashboard consolidado (cards por unidade + **resumo diário consolidado** de todas as lojas)
- Filtro de período **De/Até** no dashboard master
- CRUD de lojas e usuários (paginação 20/página)
- **Ir para loja** — `/master/go-to-store` (sem seletor fixo na sidebar)
- Permissões por tela por usuário (checkboxes)
- Vínculo com **uma ou mais lojas** por usuário (`StoreMultiSelect`)

### Painel loja
- Menu filtrado por permissões do usuário
- Guard de rota — URLs não autorizadas redirecionam
- **Nova venda** — wizard (cliente → produto → entrega/portaria), CEP automático, cadastro rápido de cliente, benefício Gás do Povo (pagamento GDP), **seleção de data da venda**
- **Data retroativa** — atendente informa motivo; gerente/master aprova ou rejeita; log em `SaleBackdateLog`
- Vendas: histórico paginado, status Portaria, edição/cancelamento por gerente
- Clientes com endereços, histórico de pedidos paginado no modal
- Produtos e estoque por loja (listagens paginadas)
- Transferências entre unidades
- Entregadores e entregas (sidebar + push)
- **Resumo diário** com filtro De/Até, loading ao trocar datas, métricas por entregador
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

| Migration | Conteúdo |
|-----------|----------|
| `20250624000000_init` | Schema inicial |
| `20250624140000_password_reset_tokens` | Recuperação de senha |
| `20250624180000_user_permissions` | `User.permissions String[]` |
| `20260625120000_deliverer_multi_store` | Entregador N:N com unidades |
| `20260625140000_deliverer_push_token` | Token Expo Push no entregador |
| `20260625160000_sync_deliverer_stores` | Backfill `DelivererStore` |
| `20260625180000_sale_status_portaria` | Status `PORTARIA` em vendas |
| `20260625180001_backfill_sale_status_portaria` | Backfill vendas retirada na loja |
| `20260625200000_gas_do_povo_benefit_and_delivery_fee` | Benefício Gás do Povo + taxa entrega |
| `20260625210000_payment_method_gdp` | Forma de pagamento `GDP` |
| `20260626100000_sale_backdate_approval` | `saleDate`, aprovação retroativa, `SaleBackdateLog` |

Aplicar em produção: `pnpm db:deploy` (também roda no `releaseCommand` do Railway).

No Neon, configure `DIRECT_URL` (host sem `-pooler`) além de `DATABASE_URL` para evitar lock em migrations — ver [docs/deployment.md](docs/deployment.md).

## App entregador (mobile)

```bash
cd apps/mobile
cp .env.example .env
npx expo start --dev-client    # com dev build instalado no emulador
eas build -p android --profile preview   # APK para celulares
```

Guia completo: [docs/development.md](docs/development.md) · Play Store: [docs/playstore-checklist.md](docs/playstore-checklist.md)

## Próximos passos

Ver [docs/deployment.md#próximos-passos](docs/deployment.md#próximos-passos) e [docs/development.md](docs/development.md). Resumo:

1. `git push` + `pnpm db:deploy` se migrations pendentes em produção (incl. `sale_backdate_approval`)
2. Configurar `DIRECT_URL` no Railway (Neon) se migrations travarem com P1002
3. Novo APK EAS (`eas build --profile preview`) para entregadores
4. Finalizar Resend + trocar senhas demo
5. Publicação Play Store (AAB + política de privacidade)
6. **Fase 2:** fiscal, financeiro, relatórios avançados
