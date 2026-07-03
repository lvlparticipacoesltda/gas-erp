# RBAC

Controle de acesso do Gas ERP: papéis, lojas vinculadas e permissões granulares por tela.

## Papéis (roles)

| Papel | Escopo | Lojas |
|-------|--------|-------|
| PLATFORM_ADMIN | SaaS futuro | Todas |
| ORG_MASTER | Painel admin master | Todas (automático) |
| STORE_MANAGER | Operação da loja | Uma ou mais (UserStore) |
| ATTENDANT | Vendas e clientes | Uma ou mais |
| FINANCE | Vendas, resumo, fornecedores, compras, relatórios | Uma ou mais |
| DELIVERER | App mobile (entregas + venda) | Uma ou mais |

Token JWT contém `organizationId`, `storeIds[]` e `permissions[]` (telas efetivas após `resolveUserPermissions`).

## Vínculo usuário ↔ lojas

- Relação **N:N** via tabela `UserStore`
- **ORG_MASTER** não precisa de lojas vinculadas — acesso implícito a todas
- Demais papéis precisam de **ao menos uma loja**
- UI: **Master → Usuários → Lojas** — componente `StoreMultiSelect` (checkboxes)
- Na loja, o usuário alterna entre lojas vinculadas pelo seletor no painel

## Permissões por tela (loja)

O master define, por usuário, quais telas aparecem no menu da loja.

| Chave | Tela |
|-------|------|
| `store.daily-summary` | Resumo diário (tela inicial padrão) |
| `store.sales` | Vendas |
| `store.sales.new` | Nova venda |
| `store.customers` | Clientes |
| `store.products` | Produtos |
| `store.suppliers` | Fornecedores |
| `store.purchases` | Compras |
| `store.stock` | Estoque |
| `store.stock.transfers` | Transferências |
| `store.deliverers` | Entregadores |
| `store.deliverers.map` | Mapa de entregadores |
| `store.reports` | Relatórios |

> `store.dashboard` foi renomeado para `store.daily-summary`. Valores antigos no banco são normalizados automaticamente.

### Regras

- Lista **vazia** no banco → usa **padrão do papel** (`ROLE_DEFAULT_PERMISSIONS`)
- Lista **customizada** → apenas as telas marcadas
- `ORG_MASTER` / `PLATFORM_ADMIN` **ignoram** restrições de tela

### Padrões por papel

| Papel | Telas padrão |
|-------|----------------|
| STORE_MANAGER | Todas |
| ATTENDANT | daily-summary, sales, sales.new, customers, deliverers.map |
| FINANCE | daily-summary, sales, customers, suppliers, purchases, reports |
| DELIVERER | daily-summary (app mobile é o canal principal) |

Configuração: **Master → Usuários → Editar → Telas permitidas** (`permission-checkboxes.tsx`).

Entregadores são gerenciados em **Master → Entregadores** (`/master/deliverers`) ou **Loja → Entregadores** — componente compartilhado `deliverers-panel.tsx`. Usuários com papel `DELIVERER` não aparecem no CRUD de usuários do master (redirecionados para a aba Entregadores).

Formas de pagamento: `/store/[storeId]/settings/payment-methods` — acesso via `canManagePaymentMethods` (não é chave de menu separada).

## Inativar vs excluir

| Entidade | Inativar | Excluir |
|----------|----------|---------|
| Usuário (não entregador) | `PATCH` com `active: false` | `DELETE /users/:id` — hard delete |
| Loja | `PATCH` com `active: false` | `DELETE /stores/:id` — remove vendas e transferências |
| Cliente | `PATCH` com `active: false` | `DELETE /customers/:id?storeId=...` |
| Entregador | status `OFFLINE` no mapa | `DELETE /deliverers/:id` — remove usuário e entregador |

Exclusões são **irreversíveis**. A UI exige confirmação explícita.

## Ações restritas por papel

| Ação | Quem pode |
|------|-----------|
| Aprovar/rejeitar venda com data anterior | `ORG_MASTER`, `STORE_MANAGER`, `PLATFORM_ADMIN` (`canManageSales`) |
| Aprovar/rejeitar venda criada no app | `ORG_MASTER`, `STORE_MANAGER`, `ATTENDANT`, `PLATFORM_ADMIN` (`canApproveMobileSales`) |
| Cancelar venda finalizada (Portaria/Entregue) | `canManageSales` |
| Ver custo fornecedor e margem bruta | `ORG_MASTER`, `STORE_MANAGER`, `FINANCE`, `PLATFORM_ADMIN` (`canViewFinancialMargins`) |
| Configurar formas de pagamento e taxas | `ORG_MASTER`, `STORE_MANAGER`, `FINANCE`, `PLATFORM_ADMIN` (`canManagePaymentMethods`) |
| Iniciar rota de entrega (`IN_PROGRESS`) | Apenas o entregador dono (app mobile) |
| Concluir entrega (`DELIVERED`) | Entregador dono ou equipe da loja |
| Marcar entregador disponível / indisponível (mapa) | Gerente, master ou atendente com `store.deliverers.map` (`canToggleDelivererAvailability`) |
| Criar venda no app mobile | Papel `DELIVERER` |

Helpers em `packages/shared/src/permissions.ts`: `canManageSales`, `canApproveMobileSales`, `canManageDeliverers`, `canViewFinancialMargins`, `canManagePaymentMethods`, `canToggleDelivererAvailability`, `hasScreenPermission`.

## Onde é aplicado

| Camada | Arquivo | Comportamento |
|--------|---------|---------------|
| Shared | `packages/shared/src/permissions.ts` | Chaves, defaults, helpers |
| API | `auth.service.ts`, `users.service.ts` | JWT e CRUD com `permissions` |
| Web nav | `app-shell.tsx`, `store-nav.ts` | Filtra itens do menu da loja |
| Web guard | `store/[storeId]/layout.tsx` | Bloqueia URL sem permissão |
| Formulário | `master/users/page.tsx` | Checkboxes de tela + lojas |

## API

- `POST /users`, `PATCH /users/:id` aceitam `storeIds: string[]` e `permissions?: string[]`
- Operações por loja: header `X-Store-Id` ou query `storeId`

## Schema (Prisma)

```prisma
model User {
  // ...
  permissions String[] @default([])
  stores      UserStore[]
}
```

Migration: `20250624180000_user_permissions`
