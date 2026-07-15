# Arquitetura

Monorepo Gas ERP — gestão multi-loja para distribuidoras de GLP.

## Estrutura e stack

| Pacote | Stack | Função |
|--------|-------|--------|
| `apps/web` | Next.js (App Router) | Painel master e de loja |
| `apps/api` | NestJS (`/api/v1`) | API REST |
| `apps/mobile` | Expo SDK 56 + `expo-router` (React Native) | App do entregador (Android primeiro) |
| `packages/shared` | TypeScript | Tipos, schemas Zod, labels, permissões, métricas (`delivery-metrics.ts`), dia operacional (`business-day.ts`), data retroativa (`sale-backdate.ts`), venda mobile (`sale-mobile.ts`) |
| `packages/database` | Prisma | Schema, client e migrations |

`apps/web`, `apps/api` e `apps/mobile` consomem `@gas-erp/shared` (tipos, `getSaleDisplayStatus`, helpers de métrica) garantindo regras consistentes entre web, API e app.

## Modelo de dados

- **Organization** = tenant (SaaS-ready)
- **Store** = unidade física
- **User** + **UserStore** = RBAC por loja (N:N — um usuário pode ter várias lojas)
- **User.permissions** = telas customizadas (`String[]`; vazio = padrão do papel)
- **Customer** = **por loja** (`storeId`); endereços e **CustomerProductPrice** (preço negociado por cliente/produto/loja)
- **Supplier** = fornecedores da organização (PJ/PF)
- **PurchaseInvoice** + itens = notas de compra (entrada de estoque)
- **StorePaymentMethod** = formas de pagamento por loja com taxas (`PaymentFeeMode`)
- **StockBalance** por loja; **StockTransfer** entre lojas
- **ProductStoreSetting.supplierCost** = custo fornecedor por loja; **SaleItem.unitCost** = snapshot na venda (margem histórica)
- **Sale** → baixa estoque ao finalizar (DELIVERED / PORTARIA); cancelamento repõe se já houve baixa; `saleDate` (dia operacional); `backdateApproval` para lançamentos retroativos; `mobileApproval` para vendas criadas pelo app do entregador
- **SaleBackdateLog** — auditoria de solicitação/aprovação/rejeição de data anterior
- **SaleMobileApprovalLog** — auditoria de aprovação de venda mobile
- **Delivery** + **DeliveryTrackingPoint** para GPS (app entregador); `pendingReminderSentAt` para lembrete push
- **Deliverer** + **DelivererStore** = entregador N:N com unidades; `availableStoreId` = unidade atual no mapa; `lastLatitude`/`lastSeenAt`/bateria para presença
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
/privacidade-entregador, /exclusao-conta-entregador  público (Play Store)
/master/*                                     ORG_MASTER
  /master/settings                            Minha conta (master)
  /master/go-to-store                         escolher loja
  /master/users, /master/stores, /master/deliverers  CRUD
/store/[storeId]/*                            usuários com acesso à loja
  /daily-summary                              tela inicial (dashboard antigo redireciona aqui)
  /suppliers, /purchases, /reports            novos módulos
  /deliverers/map                             mapa de presença
  /settings/payment-methods                   formas de pagamento
  layout.tsx                                  guard por permissão de tela
/settings                                     redirect conforme papel
```

- `AppShell` filtra menu da loja com `hasScreenPermission`
- Master não tem seletor de loja na sidebar; entra na loja via dashboard ou "Ir para loja"
- Dashboard master e resumo diário usam `useLiveQuery` com polling a cada 15s

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
| `payment-methods-content.tsx` | CRUD de formas de pagamento por loja |
| `deliverers-panel.tsx` | CRUD de entregadores (master e loja) |
| `settings-content.tsx` | Perfil e troca de senha |

## App do entregador (Expo — `apps/mobile`)

App React Native (Expo SDK 56 + `expo-router`) para os entregadores. Consome a mesma API (`/api/v1`). Nome no dispositivo: **Gás do Povo Entregador**.

| Recurso | Implementação |
|---------|---------------|
| Auth | Login restrito ao papel `DELIVERER`; JWT em `expo-secure-store` |
| Entregas | Abas **Aguardando** / **Em rota** via `GET /deliveries/my` (pull-to-refresh + polling) |
| Nova venda | Aba **Venda** — `POST /sales/mobile`; aguarda aprovação na loja (`mobileApproval`) |
| Histórico | Aba **Histórico** — vendas/entregas do entregador |
| Iniciar rota | `PATCH /deliveries/:id/status` → `IN_PROGRESS` (exclusivo do entregador) e abre o Google Maps via deep link |
| Rota ativa | Timer + `Concluir entrega` (`PATCH` → `DELIVERED`) |
| GPS | `expo-location` + `expo-task-manager` → `POST /deliveries/:id/tracking` em background durante `IN_PROGRESS` |
| Presença | `POST /deliverers/me/position` — posição no mapa da loja mesmo sem rota ativa |
| Push | `expo-notifications` + **FCM** — nova rota, cancelamento, lembrete de aceite; som customizado `rota_entrega.wav` |
| Branding | Nome da organização no header após login |
| Divulgação GPS | Aviso destacado antes do prompt de background (requisito Play Store) |
| Config | `EXPO_PUBLIC_API_URL`; `google-services.json` via EAS secret (não commitado) |
| Estado global | `DeliveriesProvider` no `_layout.tsx` raiz |

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
| Auth | `/auth` | login, me, change-password, forgot/reset |
| Health | `/health` | público |
| Stores | `/stores` | master; `/:storeId/payment-methods` |
| Users | `/users` | master; `storeIds`, `permissions` |
| Customers | `/customers` | por loja; preços por produto |
| Products | `/products` | por loja; custo fornecedor |
| Suppliers | `/suppliers` | fornecedores da organização |
| Purchase invoices | `/purchase-invoices` | notas de compra |
| Stock | `/stock` | saldos e movimentações |
| Stock transfers | `/stock-transfers` | entre lojas |
| Sales | `/sales` | criar, status, backdate, **mobile** |
| Deliverers | `/deliverers` | por loja; posição GPS; push token |
| Deliveries | `/deliveries` | + tracking GPS |
| Dashboard | `/dashboard` | master e loja |
| Reports | `/reports` | vendas, compras, estoque + CSV |

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

21 migrations até jul/2026. Lista completa em [development.md](development.md#migrations-aplicadas).

Fly.io roda `scripts/fly-release.sh` → `release-migrate.sh` a cada deploy. Use `DIRECT_URL` no Neon para migrations (ver [deployment.md](deployment.md)).

## Status do produto (jul/2026)

| Área | Status |
|------|--------|
| Web MVP (vendas, estoque, entregas, resumo diário) | ✅ Produção |
| Fornecedores, compras, relatórios CSV | ✅ |
| Formas de pagamento + taxas + receita líquida | ✅ |
| Custo/margem fornecedor | ✅ |
| Clientes por loja + preço por cliente | ✅ |
| Mapa de entregadores (presença GPS) | ✅ |
| Venda mobile com aprovação | ✅ |
| Pagamentos múltiplos + geocoding + sugestão entregador | ✅ |
| Inativar vs excluir cadastros (usuários, lojas, clientes, entregadores) | ✅ |
| Aba entregadores no painel master | ✅ |
| Status unificado venda/entrega + Portaria | ✅ `packages/shared/src/sale-display.ts` |
| Benefício Gás do Povo + pagamento GDP | ✅ |
| Data retroativa com aprovação | ✅ |
| Filtro De/Até no resumo (loja + master) + auto-refresh 15s | ✅ |
| Paginação nas listas | ✅ |
| Métricas tempo até aceitar / em rota / total + por entregador | ✅ `delivery-metrics.ts` |
| Vendas efetivadas em painéis e relatórios | ✅ `sale-counting.ts` |
| GPS stale + alerta quando posição para | ✅ |
| App entregador MVP | ✅ Emulador + EAS preview APK |
| Push FCM (nova rota / cancelamento / lembrete) | ✅ |
| Páginas privacidade e exclusão de conta | ✅ |
| Play Store (Google Play) | ✅ Publicado jul/2026 |
| API regional Fly.io GRU | ✅ `api.thlgasdopovo.com.br` jul/2026 |
| Branding web (ícones, favicon, loading) | ✅ jul/2026 |

Roadmap e sprints: [roadmap.md](roadmap.md)

## Fase 2 (planejado)

- Fiscal (`FiscalProvider` stub em `packages/shared`)
- Financeiro completo (contas a pagar/receber, fluxo de caixa)
- Redis/filas para real-time
- CI/CD, staging, monitoramento
