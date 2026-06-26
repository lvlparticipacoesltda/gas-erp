# Arquitetura

Monorepo Gas ERP — gestão multi-loja para distribuidoras de GLP.

## Estrutura e stack

| Pacote | Stack | Função |
|--------|-------|--------|
| `apps/web` | Next.js (App Router) | Painel master e de loja |
| `apps/api` | NestJS (`/api/v1`) | API REST |
| `apps/mobile` | Expo SDK 56 + `expo-router` (React Native) | App do entregador (Android primeiro) |
| `packages/shared` | TypeScript | Tipos, schemas Zod, labels, permissões, métricas (`delivery-metrics.ts`), dia operacional (`business-day.ts`), data retroativa (`sale-backdate.ts`) |
| `packages/database` | Prisma | Schema, client e migrations |

`apps/web`, `apps/api` e `apps/mobile` consomem `@gas-erp/shared` (tipos, `getSaleDisplayStatus`, helpers de métrica) garantindo regras consistentes entre web, API e app.

## Modelo de dados

- **Organization** = tenant (SaaS-ready)
- **Store** = unidade física
- **User** + **UserStore** = RBAC por loja (N:N — um usuário pode ter várias lojas)
- **User.permissions** = telas customizadas (`String[]`; vazio = padrão do papel)
- **StockBalance** por loja; **StockTransfer** entre lojas
- **Sale** → baixa estoque; cancelamento repõe; `saleDate` (dia operacional); `backdateApproval` para lançamentos retroativos
- **SaleBackdateLog** — auditoria de solicitação/aprovação/rejeição de data anterior
- **Delivery** + **DeliveryTrackingPoint** para GPS (app entregador)
- **DelivererStore** = entregador N:N com unidades (mesmo `DELIVERER` pode atender várias lojas)
- **PasswordResetToken** para recuperação de senha

## Autenticação

JWT contém:

```ts
{
  sub, email, name, role,
  organizationId,
  storeIds: string[],
  permissions: string[]  // telas efetivas (resolveUserPermissions)
}
```

Login: `POST /auth/login` → token armazenado no front (localStorage).

## RBAC

Dois níveis:

1. **Papel (role)** — define escopo master vs loja e defaults de tela
2. **Permissões por tela** — override opcional por usuário (master configura)

Detalhes: [rbac.md](rbac.md) · implementação em `packages/shared/src/permissions.ts`

| Papel | Escopo |
|-------|--------|
| ORG_MASTER | Painel master + todas as lojas (ignora restrição de tela) |
| STORE_MANAGER, ATTENDANT, FINANCE, DELIVERER | Loja(s) vinculadas via UserStore |
| PLATFORM_ADMIN | SaaS futuro |

Header `X-Store-Id` ou query `storeId` para operações por loja na API.

## Web — rotas e shell

```
/login, /forgot-password, /reset-password     público
/master/*                                     ORG_MASTER
  /master/settings                            Minha conta (master)
  /master/go-to-store                         escolher loja
  /master/users, /master/stores               CRUD
/store/[storeId]/*                            usuários com acesso à loja
  layout.tsx                                  guard por permissão de tela
/settings                                     redirect conforme papel
```

- `AppShell` filtra menu da loja com `hasScreenPermission`
- Master não tem seletor de loja na sidebar; entra na loja via dashboard ou "Ir para loja"

Componentes relevantes:

| Componente | Função |
|------------|--------|
| `app-shell.tsx` | Nav master/loja filtrado |
| `permission-checkboxes.tsx` | Telas no formulário de usuário |
| `store-multi-select.tsx` | Vínculo N lojas (checkboxes) |
| `daily-summary-content.tsx` | Resumo diário com filtro De/Até e tabelas paginadas (client-side) |
| `loading-overlay.tsx` | Overlay de carregamento ao trocar período no resumo |
| `pagination.tsx` / `paginated-list.tsx` | Paginação reutilizável (server e client) |
| `customer-picker.tsx` | Combobox de cliente na nova venda |

## App do entregador (Expo — `apps/mobile`)

App React Native (Expo SDK 56 + `expo-router`) para os entregadores. Consome a mesma API (`/api/v1`).

| Recurso | Implementação |
|---------|---------------|
| Auth | Login restrito ao papel `DELIVERER`; JWT em `expo-secure-store` |
| Listas | **Aguardando** / **Em rota** via `GET /deliveries/my` (pull-to-refresh + polling) |
| Iniciar rota | `PATCH /deliveries/:id/status` → `IN_PROGRESS` (exclusivo do entregador) e abre o Google Maps via deep link |
| Rota ativa | Timer + `Concluir entrega` (`PATCH` → `DELIVERED`) |
| GPS | `expo-location` + `expo-task-manager` → `POST /deliveries/:id/tracking` em background durante `IN_PROGRESS` (requer permissão "o tempo todo") |
| Push | `expo-notifications` — alertas de nova entrega e cancelamento (Expo Push) |
| Branding | Nome da organização no header após login |
| Divulgação GPS | Aviso destacado antes do prompt de background (requisito Play Store) |
| Config | `EXPO_PUBLIC_API_URL` (default aponta para produção) |
| Estado global | `DeliveriesProvider` no `_layout.tsx` raiz (todas as rotas) |

Estrutura principal em `apps/mobile/src/`:

| Arquivo | Função |
|---------|--------|
| `lib/api.ts` | Cliente HTTP + JWT |
| `lib/auth.tsx` | Contexto de autenticação |
| `lib/deliveries-context.tsx` | Cache e refresh das entregas |
| `lib/location.ts` | Task de GPS em background |
| `hooks/useDeliveries.ts` | Polling e pull-to-refresh |

Build, emulador e comandos: [development.md](development.md) · EAS: [deployment.md](deployment.md) · Play Store: [playstore-checklist.md](playstore-checklist.md).

## Dia operacional e resumo diário

O fuso das lojas é `America/Sao_Paulo` (`packages/shared/src/business-day.ts`):

- Dia operacional = meia-noite a meia-noite no fuso da loja
- Dashboard e resumo filtram vendas por **`saleDate`**, não por `createdAt`
- Query `date`, `dateFrom`, `dateTo` em `GET /dashboard/store` e `GET /dashboard/master`
- Vendas com `backdateApproval` `PENDING` ou `REJECTED` **não entram** nos totais do resumo

## Data retroativa (vendas)

Fluxo em `packages/shared/src/sale-backdate.ts` + `sales.service.ts`:

| Cenário | `backdateApproval` | Comportamento |
|---------|-------------------|---------------|
| Data de hoje | `NOT_REQUIRED` | Fluxo normal (estoque + entrega) |
| Data anterior + atendente | `PENDING` | Sem estoque/entrega até aprovação; motivo obrigatório |
| Data anterior + gerente/master | `APPROVED` | Aprovação automática; fluxo normal |
| Data futura | — | Rejeitado pela API |

Aprovação/rejeição: `POST /sales/:id/backdate/approve` e `POST /sales/:id/backdate/reject` (papéis com `canManageSales`).

## Métricas de entrega

Calcula quanto tempo uma venda com entrega esperou até a rota começar:

```text
tempoEspera = delivery.startedAt - sale.createdAt
```

- `startedAt` é preenchido quando o entregador inicia a rota (`IN_PROGRESS`) no app.
- Enquanto `PENDING`, mostra-se o tempo decorrido desde `sale.createdAt`.
- Helpers puros em `packages/shared/src/delivery-metrics.ts` (`getWaitTimeSeconds`, `getRouteDurationSeconds`, `getElapsedWaitingSeconds`, `formatWaitTime`), reutilizados por API, web e app.
- Resumo diário inclui **por entregador** (médias de espera e tempo em rota) e entregas lentas com nome do entregador.
- A API expõe `waitTimeSeconds` / `elapsedWaitingSeconds` nas listas de entregas e o bloco `deliveryMetrics` em `GET /dashboard/store` (ver [api-contracts.md](api-contracts.md)).

## API

Base URL: `/api/v1`

| Módulo | Prefixo | Notas |
|--------|---------|-------|
| Auth | `/auth` | login, me, change-password, forgot/reset |
| Health | `/health` | público |
| Stores | `/stores` | master |
| Users | `/users` | master; `storeIds`, `permissions` |
| Customers | `/customers` | por loja |
| Products | `/products` | por loja |
| Stock | `/stock` | saldos e movimentações |
| Stock transfers | `/stock-transfers` | entre lojas |
| Sales | `/sales` | criar, status, aprovar/rejeitar data retroativa |
| Deliverers | `/deliverers` | por loja |
| Deliveries | `/deliveries` | + tracking GPS |
| Dashboard | `/dashboard` | master e loja |

### Produção

| | |
|---|---|
| Base | `https://gas-erpapi-production.up.railway.app/api/v1` |
| Health | `GET /health` (público, sem auth) |
| CORS | `WEB_URL` no Railway; callback suporta múltiplas origens separadas por vírgula |

## Infraestrutura

```
thlgasdopovo.com.br  →  Vercel (Next.js apps/web)
       │
       │  NEXT_PUBLIC_API_URL
       ▼
gas-erpapi-production.up.railway.app  →  NestJS apps/api
       │
       ▼
Neon PostgreSQL (sa-east-1)
```

Deploy, DNS, variáveis e roadmap: [deployment.md](deployment.md)  
Contratos REST: [api-contracts.md](api-contracts.md)  
E-mail (Resend): [resend-setup.md](resend-setup.md)

| `settings-content.tsx` | Perfil e troca de senha |

## Migrations

| Arquivo | Descrição |
|---------|-----------|
| `20250624000000_init` | Schema inicial |
| `20250624140000_password_reset_tokens` | Tokens de reset |
| `20250624180000_user_permissions` | Campo `permissions` em User |
| `20260625120000_deliverer_multi_store` | Tabela `DelivererStore` (entregador N:N unidades) |
| `20260625140000_deliverer_push_token` | Token Expo Push |
| `20260625160000_sync_deliverer_stores` | Backfill vínculos entregador-loja |
| `20260625180000_sale_status_portaria` | Enum `PORTARIA` |
| `20260625180001_backfill_sale_status_portaria` | Backfill status portaria |
| `20260625200000_gas_do_povo_benefit_and_delivery_fee` | Benefício Gás do Povo + taxa entrega |
| `20260625210000_payment_method_gdp` | Pagamento `GDP` |
| `20260626100000_sale_backdate_approval` | `saleDate`, aprovação retroativa, `SaleBackdateLog` |

Railway roda `pnpm db:deploy` no `releaseCommand` a cada deploy. Use `DIRECT_URL` no Neon para migrations (ver [deployment.md](deployment.md)).

## Status do produto (jun/2026)

| Área | Status |
|------|--------|
| Web MVP (vendas, estoque, entregas, resumo diário) | ✅ Produção |
| Status unificado venda/entrega + Portaria | ✅ `packages/shared/src/sale-display.ts` |
| Benefício Gás do Povo + pagamento GDP | ✅ |
| Data retroativa com aprovação | ✅ |
| Filtro De/Até no resumo (loja + master) | ✅ |
| Paginação nas listas | ✅ |
| Métricas tempo até rota + por entregador | ✅ `delivery-metrics.ts` |
| App entregador MVP | ✅ Emulador + EAS preview APK |
| Play Store (AAB) | ⏳ Checklist em [playstore-checklist.md](playstore-checklist.md) |
| Push notifications | ✅ Expo Push (nova entrega / cancelamento) |

## Fase 2 (planejado)

- Fiscal (`FiscalProvider` stub em `packages/shared`)
- Financeiro (contas, fluxo de caixa)
- Publicação Play Store
- Redis/filas para real-time
- CI/CD, staging, monitoramento
