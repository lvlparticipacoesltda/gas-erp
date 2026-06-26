# Gas ERP

Sistema de gestão multi-loja para distribuidoras/revendas de gás (GLP).

**Cliente piloto:** Rede Gás Litoral / THL Gás do Povo — [thlgasdopovo.com.br](https://thlgasdopovo.com.br)

## Stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 + Tailwind
- **API:** NestJS + Prisma
- **Banco:** PostgreSQL

## Estrutura

```
apps/web          Painel web (master + loja)
apps/api          REST API NestJS
apps/mobile       App entregador (Expo SDK 56, Android)
packages/database Prisma schema + seeds + migrations
packages/shared   Types, Zod schemas, enums, permissões, métricas
```

## Setup local

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir PostgreSQL (Docker ou Homebrew)
docker compose up -d

# 3. Configurar ambiente
cp .env.example .env

# 4. Migrar e popular banco
pnpm db:push    # dev rápido
# ou
pnpm db:deploy  # migrations (recomendado, igual produção)
pnpm db:seed

# 5. Rodar em desenvolvimento
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1

## Credenciais demo (seed)

| Usuário | E-mail | Senha | Papel |
|---------|--------|-------|-------|
| Master | master@gas.com | admin123 | ORG_MASTER |
| Gerente | gerente@gas.com | admin123 | STORE_MANAGER |
| Atendente | atendente@gas.com | admin123 | ATTENDANT |
| Entregador | entregador@gas.com | admin123 | DELIVERER |

> Em produção, troque essas senhas após validar o login.

## Estado atual (jun/2026)

MVP **em produção** e funcional. Refinamentos de UX, auth e RBAC concluídos na pré-Fase 2.

| Área | Status |
|------|--------|
| Deploy (Vercel + Railway + Neon) | ✅ No ar |
| Domínio `thlgasdopovo.com.br` | ✅ |
| Auth + JWT multi-tenant | ✅ |
| Painel master (lojas, usuários, dashboard) | ✅ |
| Painel loja (vendas, clientes, estoque, etc.) | ✅ |
| Minha conta (perfil + senha) | ✅ |
| Recuperação de senha (Resend) | ✅ Código pronto; domínio Resend pode estar pendente |
| Permissões por tela (RBAC granular) | ✅ |
| Vínculo usuário ↔ múltiplas lojas | ✅ Checkboxes no cadastro |
| Edição de lojas e usuários | ✅ |
| Confirmação ao desativar | ✅ |
| Sidebar entregas + métrica tempo até rota | ✅ |
| Entregador multi-unidade (`DelivererStore`) | ✅ |
| App entregador (`apps/mobile`) | 🟡 MVP testado; Play Store pendente |
| Módulo fiscal / financeiro | ⏳ Fase 2 |

Documentação: [docs/development.md](docs/development.md) · [docs/deployment.md](docs/deployment.md) · [docs/architecture.md](docs/architecture.md) · [docs/api-contracts.md](docs/api-contracts.md)

## Módulos MVP

### Autenticação e conta
- Login JWT com `organizationId`, `storeIds[]` e `permissions[]`
- **Minha conta** — `/master/settings` (master) ou `/store/[storeId]/settings` (loja)
- **Recuperação de senha** — `/forgot-password` → e-mail Resend → `/reset-password`
- `PATCH /auth/me` e `POST /auth/change-password`

### Painel master
- Dashboard consolidado (cards clicáveis para ir à loja)
- CRUD de lojas e usuários
- **Ir para loja** — `/master/go-to-store` (sem seletor fixo na sidebar)
- Permissões por tela por usuário (checkboxes)
- Vínculo com **uma ou mais lojas** por usuário (`StoreMultiSelect`)

### Painel loja
- Menu filtrado por permissões do usuário
- Guard de rota — URLs não autorizadas redirecionam
- Vendas (nova venda, histórico, status)
- Clientes com endereços
- Produtos e estoque por loja
- Transferências entre unidades
- Entregadores e entregas
- Resumo diário
- API de tracking GPS (preparada para app mobile)

## Rotas principais (web)

| Rota | Quem |
|------|------|
| `/login` | Público |
| `/forgot-password`, `/reset-password` | Público |
| `/master` | ORG_MASTER |
| `/master/users`, `/master/stores` | ORG_MASTER |
| `/master/settings` | ORG_MASTER — Minha conta |
| `/master/go-to-store` | ORG_MASTER — escolher loja |
| `/store/[storeId]/*` | Usuários com acesso à loja |
| `/settings` | Redirect conforme papel |

## Deploy

Guia completo: [docs/deployment.md](docs/deployment.md)

### Produção (no ar)

| | |
|---|---|
| **App** | https://thlgasdopovo.com.br |
| **API** | https://gas-erpapi-production.up.railway.app/api/v1 |
| **Health** | https://gas-erpapi-production.up.railway.app/api/v1/health |
| **GitHub** | `lvlparticipacoesltda/gas-erp` |
| **Stack** | Vercel (web) + Railway (API) + Neon (PostgreSQL) |
| **DNS** | Hostinger → Vercel |

**Infraestrutura por fase:**

| Fase | Sugestão |
|------|----------|
| MVP (agora) | Vercel + Railway + Neon — sem VPS |
| Crescimento | Web na Vercel; API em VPS/Fly; Redis (Upstash) |
| Alto volume | VPS ou Kubernetes + Postgres gerenciado |

## Migrations (banco)

| Migration | Conteúdo |
|-----------|----------|
| `20250624000000_init` | Schema inicial |
| `20250624140000_password_reset_tokens` | Recuperação de senha |
| `20250624180000_user_permissions` | `User.permissions String[]` |
| `20260625120000_deliverer_multi_store` | Entregador N:N com unidades |

Aplicar em produção: `pnpm db:deploy` (também roda no `releaseCommand` do Railway).

## App entregador (mobile)

```bash
cd apps/mobile
cp .env.example .env
npx expo start --dev-client    # com dev build instalado no emulador
eas build -p android --profile preview   # APK para celulares
```

Guia completo: [docs/development.md](docs/development.md) · Play Store: [docs/playstore-checklist.md](docs/playstore-checklist.md)

## Próximos passos

Ver [docs/deployment.md#próximos-passos](docs/deployment.md#próximos-passos) e [docs/development.md](docs/development.md). Resumo:

1. `pnpm db:deploy` se migration `deliverer_multi_store` ainda não aplicada em produção
2. Novo APK EAS (`eas build --profile preview`) para entregadores
3. Finalizar Resend + trocar senhas demo
4. Publicação Play Store (AAB + política de privacidade)
5. **Fase 2:** fiscal, financeiro, push notifications, relatórios
