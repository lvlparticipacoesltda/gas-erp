# RBAC

## Papéis (roles)

| Papel | Escopo |
|-------|--------|
| PLATFORM_ADMIN | SaaS futuro |
| ORG_MASTER | Painel admin + todas as lojas |
| STORE_MANAGER | Loja(s) vinculada(s) — telas padrão completas |
| ATTENDANT | Vendas e clientes |
| FINANCE | Vendas, resumo e clientes |
| DELIVERER | Dashboard (app mobile na fase 2) |

Token JWT contém `organizationId`, `storeIds[]` e `permissions[]` (telas efetivas).

## Permissões por tela (loja)

O Master define, por usuário, quais telas aparecem no menu da loja:

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

- Lista vazia no banco = usa **padrão do papel**
- Lista customizada = apenas as telas marcadas
- `ORG_MASTER` / `PLATFORM_ADMIN` ignoram restrições de tela

Configuração em **Master → Usuários → Editar → Telas permitidas**.

Header `X-Store-Id` ou query `storeId` para operações por loja na API.
