# RBAC

| Papel | Escopo |
|-------|--------|
| PLATFORM_ADMIN | SaaS futuro |
| ORG_MASTER | Toda organização |
| STORE_MANAGER | Loja(s) vinculada(s) |
| ATTENDANT | Operação de venda |
| FINANCE | Financeiro (fase 2) |
| DELIVERER | App mobile |

Token JWT contém `organizationId` e `storeIds[]`.

Header `X-Store-Id` ou query `storeId` para operações por loja.
