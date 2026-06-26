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
- `PATCH /users/:id` — `{ name?, email?, role?, active?, storeIds?, permissions? }`
- `DELETE /users/:id` — desativa (soft)

`permissions`: array de chaves `store.*` (ver [rbac.md](rbac.md)). Vazio = padrão do papel.

## Stores (master)

- CRUD em `/stores` — ver `stores.controller.ts`

## Customers, Products, Stock, Sales, Deliverers, Deliveries, Dashboard

Operações escopadas por loja (`X-Store-Id` ou `storeId`).

### Sales

- `GET /sales?storeId=...&status=...&page=...&pageSize=...&backdatePending=true` — lista paginada (20 padrão). `backdatePending=true` filtra vendas aguardando aprovação de data.
- `POST /sales` — criar venda confirmada com itens e pagamentos
  - `saleDate` (opcional, `YYYY-MM-DD`) — dia operacional da venda; padrão = hoje
  - `backdateRequestNotes` — obrigatório se atendente lança data anterior
  - `gasDoPovoBenefit` — força pagamento `GDP` e desativa seletor de forma de pagamento
- `PATCH /sales/:id/status` — atualizar status (bloqueado se `backdateApproval` = `PENDING` ou `REJECTED`)
- `POST /sales/:id/backdate/approve` — aprovar venda retroativa (`canManageSales`)
- `POST /sales/:id/backdate/reject` — `{ reason }` — rejeitar venda retroativa (`canManageSales`)

Vendas retroativas pendentes **não** baixam estoque nem criam entrega até aprovação. Resposta inclui `saleDate`, `backdateApproval`, `backdateLogs[]`.

### Deliverers

Um entregador (papel `DELIVERER`) atende **N unidades** da mesma organização (relação
N:N via `DelivererStore`).

- `GET /deliverers?storeId=...` — entregadores que atendem a unidade. Cada item inclui
  `stores: [{ storeId, store }]` (todas as unidades atendidas) e `status`.
- `POST /deliverers` — `{ userId, storeIds: string[], status? }` (≥ 1 unidade)
- `PATCH /deliverers/:id` — `{ storeIds?: string[], status? }`. `storeIds` substitui o
  conjunto de unidades atendidas. Todas as unidades devem pertencer à organização.
- `PUT /deliverers/me/push-token` — `{ token: "ExponentPushToken[...]" }` (papel
  `DELIVERER`). Registra token Expo Push no perfil do entregador logado.
- `DELETE /deliverers/me/push-token` — remove token (logout do app).

#### Push notifications (Expo)

A API envia notificações via [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/)
quando:

| Evento | Gatilho |
|--------|---------|
| Nova entrega atribuída | Venda confirmada com `delivererId` ou status `IN_DELIVERY` com entregador |
| Entrega cancelada | Venda cancelada com entrega `PENDING` ou `IN_PROGRESS` |

Payload `data`: `{ type: "NEW_DELIVERY" \| "DELIVERY_CANCELLED", deliveryId }`. O app
abre `/delivery/:id` ao tocar na notificação.

Ao criar uma venda com `delivererId`, a API valida que o entregador atende a
`storeId` informado; caso contrário retorna `400` ("Entregador não atende esta unidade").

### Deliveries (app entregador)

- `GET /deliveries?storeId=...` — entregas ativas da loja (`PENDING` / `IN_PROGRESS`)
- `GET /deliveries/my` — entregas do entregador logado (não canceladas)
- `POST /deliveries/:id/tracking` — `{ latitude, longitude, accuracy? }`
- `GET /deliveries/:id/tracking` — histórico GPS
- `PATCH /deliveries/:id/status` — `{ status: IN_PROGRESS | DELIVERED | CANCELLED }`

#### Quem pode mudar o status

| Transição | Quem pode |
|-----------|-----------|
| `IN_PROGRESS` (iniciar rota) | **Exclusivo do entregador dono** da entrega (papel `DELIVERER`, via app). A loja recebe `403` ao tentar iniciar pelo painel |
| `DELIVERED` (concluir) | Entregador dono **ou** equipe da loja (`ORG_MASTER`, `STORE_MANAGER`, `ATTENDANT`, `FINANCE`) |

Iniciar a rota (`IN_PROGRESS`) preenche `delivery.startedAt = now` e move a venda para `IN_DELIVERY`.

#### Campos nas listas de entregas

Cada item de `GET /deliveries` e `GET /deliveries/my` inclui, além dos dados de `sale`/`customer`/`items`:

| Campo | Descrição |
|-------|-----------|
| `deliveryAddress` | Endereço completo montado a partir dos campos `sale.delivery*` (rua, número, complemento, bairro, cidade/UF, referência) |
| `sale.createdAt` | Momento do registro da venda (base da métrica de espera) |
| `startedAt` | Quando a rota foi iniciada (`null` enquanto `PENDING`) |
| `waitTimeSeconds` | `startedAt - sale.createdAt` em segundos (`null` se ainda não iniciada) |
| `elapsedWaitingSeconds` | Segundos decorridos desde `sale.createdAt` (útil para itens `PENDING`) |

Helpers de cálculo em `packages/shared/src/delivery-metrics.ts` (`getWaitTimeSeconds`, `getElapsedWaitingSeconds`, `formatWaitTime`).

### Dashboard

- `GET /dashboard/master?date=...&dateFrom=...&dateTo=...` — cards por unidade + **resumo consolidado** (`summary`) de todas as lojas no período
- `GET /dashboard/store?storeId=...&date=...&dateFrom=...&dateTo=...` — resumo da loja no período

Período: dia único (`date`) ou intervalo inclusivo (`dateFrom` + `dateTo`). Fuso operacional: `America/Sao_Paulo`. Agregações usam **`saleDate`** da venda; exclui `backdateApproval` `PENDING` e `REJECTED`.

Inclui o bloco `deliveryMetrics`:

```ts
deliveryMetrics: {
  avgWaitTimeSeconds: number | null;
  maxWaitTimeSeconds: number | null;
  avgRouteDurationSeconds: number | null;
  maxRouteDurationSeconds: number | null;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  slowDeliveries: {
    saleId: string;
    storeName?: string;       // só no master consolidado
    customerName: string;
    delivererName: string;
    waitTimeSeconds: number | null;
    routeDurationSeconds: number | null;
  }[];
  byDeliverer: {
    delivererId: string;
    delivererName: string;
    deliveryCount: number;
    avgWaitTimeSeconds: number | null;
    avgRouteDurationSeconds: number | null;
  }[];
}
```

Métrica de espera = `delivery.startedAt - sale.createdAt`. O limiar de "entrega lenta" é 15 min (900s).

## Erros

A API retorna mensagens estruturadas; o front normaliza em `apps/web/src/lib/errors.ts` (ex.: e-mail duplicado, validação).

## Produção

```
https://gas-erpapi-production.up.railway.app/api/v1
```
