# RBAC

Controle de acesso do Gas ERP: papéis, lojas vinculadas e permissões granulares por tela.

## Papéis (roles)

| Papel | Escopo | Lojas |
|-------|--------|-------|
| PLATFORM_ADMIN | SaaS futuro | Todas |
| ORG_MASTER | Painel admin master | Todas (automático) |
| STORE_MANAGER | Operação da loja | Uma ou mais (UserStore) |
| ATTENDANT | Vendas e clientes | Uma ou mais |
| FINANCE | Vendas, resumo, clientes | Uma ou mais |
| DELIVERER | Dashboard (app mobile na fase 2) | Uma ou mais |

Token JWT contém `organizationId`, `storeIds[]` e `permissions[]` (telas efetivas após `resolveUserPermissions`).

## Vínculo usuário ↔ lojas

- Relação **N:N** via tabela `UserStore`
- **ORG_MASTER** não precisa de lojas vinculadas — acesso implícito a todas
- Demais papéis precisam de **ao menos uma loja**
- UI: **Master → Usuários → Lojas** — componente `StoreMultiSelect` (checkboxes, Todas/Limpar, contador)
- Na loja, o usuário alterna entre lojas vinculadas pelo seletor no painel

> Antes usava `<select multiple>` (exigia Cmd+clique no Mac). Substituído por checkboxes em jun/2026.

## Permissões por tela (loja)

O master define, por usuário, quais telas aparecem no menu da loja.

| Chave | Tela |
|-------|------|
| `store.dashboard` | Dashboard |
| `store.sales` | Vendas |
| `store.sales.new` | Nova venda |
| `store.customers` | Clientes |
| `store.products` | Produtos |
| `store.stock` | Estoque |
| `store.stock.transfers` | Transferências |
| `store.deliverers` | Entregadores |
| `store.daily-summary` | Resumo diário |

### Regras

- Lista **vazia** no banco → usa **padrão do papel** (`ROLE_DEFAULT_PERMISSIONS`)
- Lista **customizada** → apenas as telas marcadas
- `ORG_MASTER` / `PLATFORM_ADMIN` **ignoram** restrições de tela

### Padrões por papel

| Papel | Telas padrão |
|-------|----------------|
| STORE_MANAGER | Todas |
| ATTENDANT | dashboard, sales, sales.new, customers |
| FINANCE | dashboard, sales, daily-summary, customers |
| DELIVERER | dashboard |

Configuração: **Master → Usuários → Editar → Telas permitidas** (`permission-checkboxes.tsx`).

## Ações restritas por papel

| Ação | Quem pode |
|------|-----------|
| Aprovar/rejeitar venda com data anterior | `ORG_MASTER`, `STORE_MANAGER`, `PLATFORM_ADMIN` (`canManageSales`) |
| Cancelar venda finalizada (Portaria/Entregue) | `canManageSales` |
| Iniciar rota de entrega (`IN_PROGRESS`) | Apenas o entregador dono (app mobile) |
| Concluir entrega (`DELIVERED`) | Entregador dono ou equipe da loja |

Helpers em `packages/shared/src/permissions.ts`: `canManageSales`, `canManageDeliverers`, `hasScreenPermission`.

## Onde é aplicado

| Camada | Arquivo | Comportamento |
|--------|---------|---------------|
| Shared | `packages/shared/src/permissions.ts` | Chaves, defaults, `hasScreenPermission` |
| API | `auth.service.ts`, `users.service.ts` | JWT e CRUD com `permissions` |
| Web nav | `app-shell.tsx` | Filtra itens do menu da loja |
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
