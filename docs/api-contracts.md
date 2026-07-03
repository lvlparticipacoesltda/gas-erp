# API Contracts

Schemas Zod em `packages/shared/src/schemas/`.  
Implementação nos controllers em `apps/api/src/modules/`.

Base: `/api/v1`

## Health

- `GET /health` — `{ status, database, timestamp }` (público)

## Auth

- `POST /auth/login` — `{ email, password }` → JWT com `storeIds`, `permissions`
- `GET /auth/me` — usuário autenticado (permissões efetivas)
- `PATCH /auth/me` — `{ name?, email?, phone? }` — atualizar próprio perfil
- `POST /auth/change-password` — `{ currentPassword, newPassword }`
- `POST /auth/forgot-password` — `{ email }` — envia link por e-mail (Resend)
- `POST /auth/reset-password` — `{ token, newPassword }`

## Users (master)

- `GET /users` — lista usuários da organização
- `POST /users` — `{ email, name, password, role, storeIds?, permissions? }`
- `PATCH /users/:id` — `{ name?, email?, role?, active?, storeIds?, permissions? }` — **inativar**: `active: false` (soft)
- `DELETE /users/:id` — **exclusão permanente** (hard delete; não pode excluir a si mesmo nem entregadores — use `/deliverers/:id`)

`permissions`: array de chaves `store.*` (ver [rbac.md](rbac.md)). Vazio = padrão do papel.

## Stores (master)

- `GET /stores` — lista lojas da organização
- `POST /stores` — criar loja
- `PATCH /stores/:id` — `{ name?, active?, ... }` — **inativar**: `active: false`
- `DELETE /stores/:id` — **exclusão permanente** (remove vendas e transferências da loja; operação irreversível)

### Formas de pagamento por loja

- `GET /stores/:storeId/payment-methods?activeOnly=true` — lista formas de pagamento
- `POST /stores/:storeId/payment-methods` — criar (gerente/financeiro/master)
- `PATCH /stores/:storeId/payment-methods/:id` — atualizar taxas e status
- `DELETE /stores/:storeId/payment-methods/:id` — remover forma customizada

Cada forma inclui `feeMode` (`NONE`, `PERCENT`, `FIXED`, `PERCENT_AND_FIXED`), `feePercent`, `feeFixed`. Vendas registram `processingFee` em `SalePayment`.

## Customers

Operações escopadas por loja (`storeId` obrigatório).

- `GET /customers?storeId=...` — lista clientes da loja
- `GET /customers/:id` — detalhe
- `POST /customers` — criar (vinculado à loja)
- `PATCH /customers/:id` — atualizar (inclui `active: false` para inativar)
- `DELETE /customers/:id?storeId=...` — **exclusão permanente** (desvincula vendas; remove cliente e endereços)
- `POST /customers/:id/addresses` — adicionar endereço
- `GET /customers/:id/product-prices` — preços negociados por produto
- `GET /customers/:id/product-prices/map` — mapa `{ productId: price }`
- `PUT /customers/:id/product-prices` — `{ items: [{ productId, price }] }`
- `DELETE /customers/:id/product-prices/:productId` — remover preço negociado

## Products, Stock, Sales, Deliverers, Deliveries, Dashboard

Operações escopadas por loja (`X-Store-Id` ou `storeId`).

### Products

- `GET /products?storeId=...` — inclui `storeSettings` com `price`, `deliveryFee`, `supplierCost`
- `PATCH /products/:id/price` — atualizar preço e custo fornecedor por loja

### Suppliers

- `GET /suppliers` — lista fornecedores da organização
- `GET /suppliers/:id` — detalhe
- `POST /suppliers` — criar (PJ/PF)
- `PATCH /suppliers/:id` — atualizar
- `DELETE /suppliers/:id` — desativar

### Purchase invoices

- `GET /purchase-invoices?storeId=...` — notas de compra da loja
- `GET /purchase-invoices/:id` — detalhe com itens
- `POST /purchase-invoices` — criar nota (entrada de estoque ao confirmar)
- `POST /purchase-invoices/import` — importar XML NF-e (quando disponível)
- `PATCH /purchase-invoices/:id` — atualizar
- `DELETE /purchase-invoices/:id` — cancelar

### Sales

- `GET /sales?storeId=...&status=...&page=...&pageSize=...&backdatePending=true&mobilePending=true` — lista paginada (20 padrão)
- `POST /sales` — criar venda confirmada com itens e pagamentos
  - `saleDate` (opcional, `YYYY-MM-DD`) — dia operacional da venda; padrão = hoje
  - `backdateRequestNotes` — obrigatório se atendente lança data anterior
  - `gasDoPovoBenefit` — força pagamento `GDP`
  - Pagamentos podem referenciar `storePaymentMethodId` (taxa calculada automaticamente)
- `PATCH /sales/:id/status` — atualizar status (bloqueado se `backdateApproval` ou `mobileApproval` pendentes/rejeitados)
- `PATCH /sales/:id/payments` — atualizar formas de pagamento (soma = total; ver permissões abaixo)
- `POST /sales/:id/backdate/approve` — aprovar venda retroativa (`canManageSales`)
- `POST /sales/:id/backdate/reject` — `{ reason }` — rejeitar venda retroativa
- `POST /sales/:id/mobile/approve` — aprovar venda criada no app (`canApproveMobileSales`)
- `POST /sales/:id/mobile/reject` — `{ reason }` — rejeitar venda mobile

#### Vendas pelo app do entregador

- `GET /sales/mobile/mine` — vendas do entregador logado (papel `DELIVERER`)
- `POST /sales/mobile` — entregador cria venda → `mobileApproval: PENDING` até aprovação na loja

Vendas pendentes **não** baixam estoque nem criam entrega até aprovação.

#### Atualizar pagamentos (`PATCH /sales/:id/payments`)

Body: `{ payments: [{ storePaymentMethodId?, method?, amount }] }` — soma deve ser igual ao `total` da venda.

| Quem pode | Quando |
|-----------|--------|
| Entregador dono da entrega | Entrega `IN_PROGRESS` (ao concluir rota no app) |
| Gerente/master | Qualquer venda não cancelada |
| Financeiro | Qualquer venda não cancelada |
| Atendente com `store.sales` | Venda ainda não finalizada (`DELIVERED`/`PORTARIA`) |

Registra auditoria (`AuditLog` + `SaleStatusLog`).

### Reports

- `GET /reports/sales?storeId=...&dateFrom=...&dateTo=...&status=...&delivererId=...&paymentMethod=...` — relatório de vendas (inclui margem e taxas)
- `GET /reports/purchases?storeId=...&dateFrom=...&dateTo=...` — relatório de compras
- `GET /reports/stock?storeId=...` — posição de estoque
- `GET /reports/export?type=sales|purchases|stock&storeId=...&format=csv` — download CSV

### Geocoding

- `POST /geocoding/address` — geocodifica endereço brasileiro (Nominatim + cache); usado na sugestão de entregador

### Deliverers

Um entregador (papel `DELIVERER`) atende **N unidades** da mesma organização (relação
N:N via `DelivererStore`).

- `GET /deliverers?storeId=...` — entregadores que atendem a unidade
- `GET /deliverers/suggest?storeId=...` — sugestão por proximidade (lat/lng ou endereço de entrega)
- `POST /deliverers` — `{ userId, storeIds: string[], status? }` (≥ 1 unidade)
- `PATCH /deliverers/:id` — `{ storeIds?: string[], status? }`
- `DELETE /deliverers/:id` — **exclusão permanente** (remove entregador e usuário; bloqueado se houver rota `PENDING`/`IN_PROGRESS`)
- `GET /deliverers/me` — perfil do entregador logado
- `POST /deliverers/me/position` — `{ latitude, longitude, accuracy?, batteryLevel?, batteryCharging? }` (presença no mapa)
- `GET /deliverers/positions?storeId=...` — posições atuais dos entregadores da loja
- `PUT /deliverers/me/push-token` — `{ token: "ExponentPushToken[...]" }`
- `DELETE /deliverers/me/push-token` — remove token (logout do app)

Entregador **indisponível** (`OFFLINE`) não pode receber novas rotas. Entregador com rota alocada não pode ficar indisponível.

#### Push notifications (Expo + FCM)

| Evento | Gatilho |
|--------|---------|
| Nova entrega atribuída | Venda confirmada com `delivererId` ou status `IN_DELIVERY` |
| Entrega cancelada | Venda cancelada com entrega `PENDING` ou `IN_PROGRESS` |
| Lembrete de aceite | Entrega `PENDING` sem iniciar após intervalo configurado |

Payload `data`: `{ type: "NEW_DELIVERY" | "DELIVERY_CANCELLED" | "PENDING_REMINDER", deliveryId }`.

Requer FCM configurado — ver [mobile-push-fcm.md](mobile-push-fcm.md).

### Deliveries (app entregador)

- `GET /deliveries?storeId=...` — entregas ativas da loja (`PENDING` / `IN_PROGRESS`)
- `GET /deliveries/my` — entregas do entregador logado (não canceladas)
- `POST /deliveries/:id/tracking` — `{ latitude, longitude, accuracy? }`
- `GET /deliveries/:id/tracking` — histórico GPS
- `PATCH /deliveries/:id/status` — `{ status: IN_PROGRESS | DELIVERED | CANCELLED }`

#### Quem pode mudar o status

| Transição | Quem pode |
|-----------|-----------|
| `IN_PROGRESS` (iniciar rota) | **Exclusivo do entregador dono** da entrega (papel `DELIVERER`, via app) |
| `DELIVERED` (concluir) | Entregador dono **ou** equipe da loja |

#### Campos nas listas de entregas

| Campo | Descrição |
|-------|-----------|
| `deliveryAddress` | Endereço completo montado a partir dos campos `sale.delivery*` |
| `sale.createdAt` | Momento do registro da venda (base da métrica de espera) |
| `startedAt` | Quando a rota foi iniciada (`null` enquanto `PENDING`) |
| `waitTimeSeconds` | `startedAt - sale.createdAt` em segundos |
| `elapsedWaitingSeconds` | Segundos decorridos desde `sale.createdAt` |

### Dashboard

- `GET /dashboard/master?date=...&dateFrom=...&dateTo=...` — cards por unidade + resumo consolidado
- `GET /dashboard/store?storeId=...&date=...&dateFrom=...&dateTo=...` — resumo da loja

Período: dia único (`date`) ou intervalo inclusivo (`dateFrom` + `dateTo`). Fuso: `America/Sao_Paulo` (UTC-3 fixo). Agregações usam **`saleDate`**; exclui `backdateApproval` e `mobileApproval` pendentes/rejeitados.

Inclui `deliveryMetrics` (espera, rota, por entregador) e totais financeiros com **receita líquida** (após taxas de pagamento) e **margem bruta** (quando custo fornecedor configurado).

## Erros

A API retorna mensagens estruturadas; o front normaliza em `apps/web/src/lib/errors.ts`.

## Produção

```
https://gas-erpapi-production.up.railway.app/api/v1
```
