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

- `POST /sales` — criar venda confirmada com itens e pagamentos
- `PATCH /sales/:id/status` — atualizar status

### Deliveries (mobile prep)

- `GET /deliveries/my` — entregas do entregador logado
- `POST /deliveries/:id/tracking` — `{ latitude, longitude, accuracy? }`
- `GET /deliveries/:id/tracking` — histórico GPS
- `PATCH /deliveries/:id/status` — `{ status: IN_PROGRESS | DELIVERED | CANCELLED }`

## Erros

A API retorna mensagens estruturadas; o front normaliza em `apps/web/src/lib/errors.ts` (ex.: e-mail duplicado, validação).

## Produção

```
https://gas-erpapi-production.up.railway.app/api/v1
```
