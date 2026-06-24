# Gas ERP

Sistema de gestão multi-loja para distribuidoras/revendas de gás (GLP).

## Stack

- **Monorepo:** Turborepo + pnpm
- **Web:** Next.js 15 + Tailwind
- **API:** NestJS + Prisma
- **Banco:** PostgreSQL

## Estrutura

```
apps/web          Painel web (master + loja)
apps/api          REST API NestJS
packages/database Prisma schema + seeds
packages/shared   Types, Zod schemas, enums
```

## Setup

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir PostgreSQL
docker compose up -d

# 3. Configurar ambiente
cp .env.example .env

# 4. Migrar e popular banco
pnpm db:push
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

## Módulos MVP

- Auth + RBAC multi-tenant
- **Minha conta** — editar perfil e alterar senha (`/settings`)
- **Recuperação de senha** — e-mail via Resend (`/forgot-password`)
- Painel master (lojas, usuários, visão consolidada)
- **Edição** de lojas e usuários (master)
- **Ir para loja** — seleção de unidade ao sair do painel master
- Vendas (nova venda, histórico, status)
- Clientes com endereços
- Produtos e estoque por loja
- Transferências entre unidades
- Entregadores e entregas
- Resumo diário
- API de tracking GPS (preparada para app mobile)

## Deploy

Guia completo: [docs/deployment.md](docs/deployment.md)

### Produção (no ar)

| | |
|---|---|
| **App** | https://thlgasdopovo.com.br |
| **API** | https://gas-erpapi-production.up.railway.app/api/v1 |
| **Health** | https://gas-erpapi-production.up.railway.app/api/v1/health |
| **Stack** | Vercel (web) + Railway (API) + Neon (PostgreSQL) |
| **DNS** | Hostinger → Vercel |

**Infraestrutura por fase:**

| Fase | Sugestão |
|------|----------|
| MVP (agora) | Vercel + Railway + Neon — sem VPS |
| Crescimento | Web na Vercel; API em VPS/Fly; Redis (Upstash) |
| Alto volume | VPS ou Kubernetes + Postgres gerenciado |

**Produção rápida:** Neon (banco) → Railway (`apps/api`) → Vercel (`apps/web`) → DNS do domínio.

> As credenciais `admin123` do seed são apenas para demo. **Troque-as** após validar o login em produção.

## Próximos passos

Ver lista completa em [docs/deployment.md#próximos-passos](docs/deployment.md#próximos-passos). Resumo:

1. Validar login e fluxos MVP em produção
2. Trocar senhas demo
3. Subdomínio `api.thlgasdopovo.com.br` (opcional)
4. Módulo fiscal, financeiro e app entregador (Fase 2)
