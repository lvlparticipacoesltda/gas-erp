# Arquitetura

Monorepo Gas ERP — gestão multi-loja para distribuidoras de GLP.

## Estrutura e stack

| Pacote | Stack | Função |
|--------|-------|--------|
| `apps/web` | Next.js (App Router) | Painel master e de loja |
| `apps/api` | NestJS (`/api/v1`) | API REST |
| `apps/mobile` | Expo SDK 56 + `expo-router` (React Native) | App entregador + ponto do atendente (Android) |
| `packages/shared` | TypeScript | Tipos, Zod, permissões, métricas, dia operacional, venda (backdate/mobile/counting), gastos (`expense-financials.ts`), ponto (`time-clock-totals.ts`) |
| `packages/database` | Prisma | Schema, client e migrations |

`apps/web`, `apps/api` e `apps/mobile` consomem `@gas-erp/shared` (tipos, `getSaleDisplayStatus`, helpers de métrica) garantindo regras consistentes entre web, API e app.

## Modelo de dados

- **Organization** = tenant (SaaS-ready)
- **Store** = unidade física (CNPJ, razão social, endereço estruturado, geo)
- **User** + **UserStore** = RBAC por loja (N:N); campos de RH (CPF/PIS/admissão/cargo) para o ponto
- **User.permissions** = telas customizadas (`String[]`; vazio = padrão do papel)
- **UserSession** = sessão JWT (`sid`); **TrustedDevice** + **DevicePairingCode** = pairing web ↔ mobile
- **Customer** = **por loja**; **CustomerCategory** (P13/P20/P45/Gás do Povo); endereços e **CustomerProductPrice**
- **Supplier** = fornecedores da organização (PJ/PF)
- **PurchaseInvoice** + itens = notas de compra (entrada de estoque)
- **StorePaymentMethod** = formas de pagamento por loja com taxas (`PaymentFeeMode`)
- **StockBalance** por loja (`available` / `inTransit` / `lent`); **StockTransfer** entre lojas
- **Product.vasilhameProductId** = vínculo GLP cheio ↔ vasilhame vazio (trava de entrada)
- **ProductStoreSetting.supplierCost** = custo fornecedor por loja; **SaleItem.unitCost** = snapshot na venda
- **Sale** → baixa estoque ao finalizar (DELIVERED / PORTARIA); `saleDate`; `backdateApproval`; `mobileApproval`; coords de entrega
- **SaleBackdateLog** / **SaleMobileApprovalLog** — auditoria
- **Delivery** + **DeliveryTrackingPoint** (entregador opcional); lembrete push
- **Deliverer** + **DelivererStore**; `availableStoreId` / `defaultStoreId`; presença GPS
- **Notification** + **NotificationRead** — alertas do master (portaria / cancelamento)
- **WorkScheduleEntry** / **WorkScheduleWeekly**(+Day) — escalas e horários
- **TimeClockPunch** — batidas (slots ent1/sai1/ent2/sai2, geo, selfie, WEB/MOBILE)
- **TimeClockJustification** — atestados/ausências com arquivo
- **ExpenseCategory** + **Expense** — gastos por unidade e competência (`storeId` obrigatório)
- **VasilhameLoan** — comodato (não movimenta estoque)
- **PasswordResetToken** — recuperação de senha
- **FiscalDocument** — stub fiscal por venda

## Autenticação

JWT contém:

```ts
{
  sub, email, name, role,
  organizationId,
  storeIds: string[],
  permissions: string[],  // telas efetivas (resolveUserPermissions)
  sid: string             // UserSession — logout/revogação invalidam o token
}
```

Login: `POST /auth/login` → token no front (localStorage). Logout: `POST /auth/logout`. Master revoga em `/master/sessions`.

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
/privacidade-entregador, /exclusao-conta-entregador  público (Play Store)
/master/*                                     ORG_MASTER
  /master/dashboard                           visão geral (SSE org)
  /master/dashboard/fechamento                fechamento consolidado
  /master/settings                            Minha conta
  /master/go-to-store                         escolher loja
  /master/users, /master/stores, /master/sessions
  /master/deliverers, /master/deliverers/map
  /master/schedules, /horarios, /ponto        escalas e ponto
  /master/results, /master/expenses           resultado e gastos
  /master/purchases, /master/stock/transfers, /master/reports
/store/[storeId]/*                            usuários com acesso à loja
  /daily-summary, /daily-summary/fechamento
  /sales, /sales/new, /sales/:id/receipt
  /customers, /vasilhame-loans
  /products, /stock, /stock/transfers, /suppliers, /purchases
  /deliverers, /deliverers/map
  /schedules, /schedules/horarios, /schedules/ponto
  /expenses, /reports
  /settings/payment-methods
  layout.tsx                                  guard por permissão de tela
/settings                                     redirect conforme papel
```

- Nav: `master-nav.ts` e `store-nav.ts` (grupos accordion)
- Master não tem seletor de loja na sidebar; entra via dashboard ou "Ir para loja"
- Dashboard e resumo usam `useLiveQuery` com **SSE** (`/realtime/org` ou `/realtime/store`) e fallback de 60s
- Mapa consolidado do master: `GET /deliverers/positions` sem `storeId`

Componentes relevantes:

| Componente | Função |
|------------|--------|
| `app-shell.tsx` | Nav master/loja filtrado |
| `master-nav.ts` / `store-nav.ts` | Itens e grupos do menu |
| `permission-checkboxes.tsx` | Telas no formulário de usuário |
| `store-multi-select.tsx` | Vínculo N lojas (checkboxes) |
| `daily-summary-content.tsx` | Resumo diário com filtro De/Até |
| `pagination.tsx` / `paginated-list.tsx` | Paginação reutilizável |
| `customer-picker.tsx` | Combobox de cliente na nova venda |
| `payment-methods-content.tsx` | CRUD de formas de pagamento por loja |
| `deliverers-panel.tsx` | CRUD de entregadores (master e loja) |
| `deliverers-map-view.tsx` | Mapa de entregadores |
| `settings-content.tsx` | Perfil e troca de senha |

## App do entregador (Expo — `apps/mobile`)

App React Native (Expo SDK 56 + `expo-router`). Consome a mesma API (`/api/v1`). Nome no dispositivo: **THLGDP Entregador**.

| Recurso | Implementação |
|---------|---------------|
| Auth | Login `DELIVERER` ou `ATTENDANT`; JWT em `expo-secure-store` |
| Mapa | Tab **Mapa** (`react-native-maps` + Google Directions); picker de entregas |
| Entregas | `GET /deliveries/my` (pull-to-refresh); rota in-app com polyline e reroteamento |
| Nova venda | Aba **Venda** (só entregador) — `POST /sales/mobile` |
| Histórico | Aba **Histórico** (só entregador) |
| Escala / ponto | Aba **Escala** — grade do mês + `POST /time-clock/punch` (GPS 100 m + selfie) |
| Iniciar rota | `PATCH /deliveries/:id/status` → `IN_PROGRESS` (exclusivo do entregador) |
| GPS | `expo-location` + `expo-task-manager` → tracking em background durante `IN_PROGRESS` |
| Presença | `POST /deliverers/me/position` |
| Push | `expo-notifications` + **FCM** — nova rota, cancelamento, lembrete; som `rota_entrega.wav` |
| Config | `EXPO_PUBLIC_API_URL`; `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; `google-services.json` via EAS secret |

Estrutura principal em `apps/mobile/src/`:

| Arquivo | Função |
|---------|--------|
| `lib/api.ts` | Cliente HTTP + JWT |
| `lib/auth.tsx` | Contexto de autenticação |
| `lib/deliveries-context.tsx` | Cache e refresh das entregas |
| `lib/location.ts` | Task de GPS em background + presença |

Build, emulador e comandos: [development.md](development.md) · Push FCM: [mobile-push-fcm.md](mobile-push-fcm.md) · EAS: [deployment.md](deployment.md) · Play Store: [playstore-checklist.md](playstore-checklist.md).

## Dia operacional e resumo diário

O fuso das lojas é `America/Sao_Paulo` (`packages/shared/src/business-day.ts`):

- Dia operacional = meia-noite a meia-noite no fuso da loja (offset fixo UTC-3)
- Dashboard e resumo filtram vendas por **`saleDate`**, não por `createdAt`
- Query `date`, `dateFrom`, `dateTo` em `GET /dashboard/store` e `GET /dashboard/master`
- Vendas com `backdateApproval` `PENDING` ou `REJECTED` **não entram** nos totais do resumo
- Vendas com `mobileApproval` pendente/rejeitada também ficam fora dos totais até aprovadas

## Data retroativa (vendas)

Fluxo em `packages/shared/src/sale-backdate.ts` + `sales.service.ts`:

| Cenário | `backdateApproval` | Comportamento |
|---------|-------------------|---------------|
| Data de hoje | `NOT_REQUIRED` | Fluxo normal (estoque + entrega) |
| Data anterior + atendente | `PENDING` | Sem estoque/entrega até aprovação; motivo obrigatório |
| Data anterior + gerente/master | `APPROVED` | Aprovação automática; fluxo normal |
| Data futura | — | Rejeitado pela API |

Aprovação/rejeição: `POST /sales/:id/backdate/approve` e `POST /sales/:id/backdate/reject` (papéis com `canManageSales`).

## Venda pelo app do entregador

Fluxo em `packages/shared/src/sale-mobile.ts` + `sales.service.ts`:

| Cenário | `mobileApproval` | Comportamento |
|---------|------------------|---------------|
| Venda criada no app | `PENDING` | Sem estoque/entrega até aprovação na loja |
| Aprovada | `APPROVED` | Fluxo normal |
| Rejeitada | `REJECTED` | Venda não contabilizada |

Aprovação: `POST /sales/:id/mobile/approve` (`canApproveMobileSales` — master, gerente, atendente).

## Métricas de entrega

Calcula quanto tempo uma venda com entrega levou em cada fase:

| Métrica | Cálculo | Rótulo na UI |
|---------|---------|--------------|
| Tempo até aceitar | `delivery.startedAt - sale.createdAt` | Enquanto `PENDING`, mostra tempo decorrido desde a venda |
| Tempo em rota | `delivery.completedAt - delivery.startedAt` | Timer ativo durante `IN_PROGRESS` |
| Tempo total da entrega | soma dos dois acima | Resumo diário, relatórios CSV e detalhe da venda |

- `startedAt` é preenchido quando o entregador inicia a rota (`IN_PROGRESS`) no app.
- Helpers puros em `packages/shared/src/delivery-metrics.ts`, reutilizados por API, web e app.
- Resumo diário inclui **por entregador** (médias e entregas lentas).
- Margem bruta e receita líquida (após taxas de pagamento) no resumo e relatórios.
- Painéis e relatórios contabilizam apenas **vendas efetivadas** (`DELIVERED`/`PORTARIA`) — ver `packages/shared/src/sale-counting.ts`.

## API

Base URL: `/api/v1`

| Módulo | Prefixo | Notas |
|--------|---------|-------|
| Auth | `/auth` | login, logout, me, senha, trusted-devices |
| Health | `/health` | público |
| Stores | `/stores` | master; `/:storeId/payment-methods` |
| Users | `/users` | master; `storeIds`, `permissions`; `/sessions` |
| Customers | `/customers` | por loja; categorias; preços; export XLSX |
| Products | `/products` | por loja; custo; vínculo vasilhame |
| Suppliers | `/suppliers` | fornecedores da organização |
| Purchase invoices | `/purchase-invoices` | notas + entrada de botijões |
| Stock / transfers | `/stock`, `/stock-transfers` | saldos, ajuste, transferências |
| Sales | `/sales` | criar, status, items, backdate, mobile |
| Deliverers / deliveries | `/deliverers`, `/deliveries` | GPS, push, rota Directions |
| Dashboard | `/dashboard` | master e loja |
| Reports | `/reports` | vendas, compras, estoque + CSV |
| Expenses | `/expenses` | gastos por unidade |
| Results | `/results` | P&L por unidade (`/by-store`) |
| Vasilhame loans | `/vasilhame-loans` | comodato |
| Notifications | `/notifications` | master |
| Schedules / ponto | `/schedules`, `/time-clock` | escalas, weeklies, batidas, atestados |
| Realtime | `/realtime/store`, `/realtime/org` | SSE |

### Produção

| | |
|---|---|
| Base | `https://api.thlgasdopovo.com.br/api/v1` (Fly.io GRU) |
| Health | `GET /health` (público, sem auth) |
| CORS | `WEB_URL` no Fly; callback suporta múltiplas origens separadas por vírgula |

## Infraestrutura

```
thlgasdopovo.com.br  →  Vercel (Next.js apps/web)
       │
       │  NEXT_PUBLIC_API_URL
       ▼
api.thlgasdopovo.com.br  →  Fly.io GRU (NestJS apps/api)
       │
       ▼
Neon PostgreSQL (sa-east-1)
```

Deploy, DNS, variáveis e roadmap: [deployment.md](deployment.md)  
Contratos REST: [api-contracts.md](api-contracts.md)  
E-mail (Resend): [resend-setup.md](resend-setup.md)

## Migrations

46 migrations até `20260806160000_time_clock_justifications`. Lista em [development.md](development.md#migrations-aplicadas).

Fly.io roda `scripts/fly-release.sh` → `release-migrate.sh` a cada deploy. Use `DIRECT_URL` no Neon para migrations (ver [deployment.md](deployment.md)).

## Status do produto (set/2026)

| Área | Status |
|------|--------|
| Web + API em produção (Vercel + Fly GRU + Neon) | ✅ |
| Vendas, estoque, entregas, resumo, fechamento | ✅ |
| Fornecedores, compras, relatórios CSV | ✅ |
| Formas de pagamento + taxas + margem | ✅ |
| Gastos por unidade + resultado por unidade | ✅ |
| Vasilhames emprestados | ✅ |
| Escalas, horários, cartão de ponto, atestados | ✅ |
| Sessões + dispositivos confiáveis | ✅ |
| Notificações master + SSE (fallback 60s) | ✅ |
| Clientes por loja + categorias + export XLSX | ✅ |
| Mapa / venda mobile / push FCM | ✅ |
| App **THLGDP Entregador** (entregador + ponto atendente) | ✅ Play Store |
| Fiscal / contas a pagar-receber / fluxo de caixa | ⏳ Fase 2 |

Roadmap e sprints: [roadmap.md](roadmap.md)

## Fase 2 (planejado)

- Fiscal (`FiscalProvider` stub em `packages/shared`)
- Financeiro completo (contas a pagar/receber, fluxo de caixa) — o painel de gastos já cobre o custo operacional
- Redis/filas para pub/sub (SSE já cobre o painel)
- Staging, Sentry, monitoramento
