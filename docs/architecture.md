# Arquitetura

Monorepo Gas ERP — gestão multi-loja para distribuidoras de GLP.

## Modelo de dados

- **Organization** = tenant (SaaS-ready)
- **Store** = unidade física
- **User** + **UserStore** = RBAC por loja (N:N — um usuário pode ter várias lojas)
- **User.permissions** = telas customizadas (`String[]`; vazio = padrão do papel)
- **StockBalance** por loja; **StockTransfer** entre lojas
- **Sale** → baixa estoque; cancelamento repõe
- **Delivery** + **DeliveryTrackingPoint** para GPS (fase mobile)
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
| `settings-content.tsx` | Perfil e troca de senha |

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
| Sales | `/sales` | criar, status |
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

## Migrations

| Arquivo | Descrição |
|---------|-----------|
| `20250624000000_init` | Schema inicial |
| `20250624140000_password_reset_tokens` | Tokens de reset |
| `20250624180000_user_permissions` | Campo `permissions` em User |

Railway roda `pnpm db:deploy` no `releaseCommand` a cada deploy.

## Fase 2 (planejado)

- Fiscal (`FiscalProvider` stub em `packages/shared`)
- Financeiro (contas, fluxo de caixa)
- App entregador (Expo) — GPS via `/deliveries/:id/tracking`
- Redis/filas para real-time
- CI/CD, staging, monitoramento
