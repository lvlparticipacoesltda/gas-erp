# Deploy e infraestrutura

Guia para colocar o Gas ERP em produção e evoluir a infraestrutura conforme o negócio cresce.

## Estratégia por fase

| Fase | Cenário | Sugestão |
|------|---------|----------|
| **Agora** | MVP real, 1 rede, poucas lojas | **Vercel + Railway + Neon** — sem VPS |
| **Crescimento** | Mais lojas, GPS tempo real, filas | Manter web na Vercel; API em VPS ou Fly; Redis (Upstash) |
| **Muito volume** | Fiscal, integrações pesadas | VPS ou Kubernetes com Postgres gerenciado |

### Arquitetura do MVP

```
Usuários
   │
   ▼
app.SEUDOMINIO  ──►  Vercel (Next.js apps/web)
   │
   │  NEXT_PUBLIC_API_URL
   ▼
api.SEUDOMINIO  ──►  Railway (NestJS apps/api)
   │
   ▼
Neon PostgreSQL
```

Substitua `SEUDOMINIO` pelo seu domínio (ex.: `gasminharede.com.br`).

---

## Pré-requisitos

- Conta [GitHub](https://github.com) com o repositório `gas-erp`
- Conta [Neon](https://neon.tech) (PostgreSQL)
- Conta [Railway](https://railway.app) (API)
- Conta [Vercel](https://vercel.com) (Web)
- Domínio próprio com acesso ao DNS
- Node.js 20+ e pnpm 9+ no Mac (para migrations/seed locais)

---

## Variáveis de ambiente

### Local (`.env` na raiz)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gas_erp?schema=public"
JWT_SECRET="dev-secret-change-me"
JWT_EXPIRES_IN="7d"
API_PORT=3001
WEB_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### Produção

| Variável | Onde | Exemplo |
|----------|------|---------|
| `DATABASE_URL` | Railway | `postgresql://...@neon.tech/gas_erp?sslmode=require` |
| `JWT_SECRET` | Railway | string longa aleatória (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Railway | `7d` |
| `WEB_URL` | Railway | `https://app.SEUDOMINIO` |
| `NODE_ENV` | Railway | `production` |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://api.SEUDOMINIO/api/v1` |

Railway injeta `PORT` automaticamente — a API usa `PORT` ou `API_PORT`.

---

## Passo a passo — MVP em produção

### Fase A — Repositório e banco (Neon)

1. Envie o código para o GitHub:
   ```bash
   git remote add origin git@github.com:SEU_USUARIO/gas-erp.git
   git push -u origin main
   ```

2. No [Neon](https://console.neon.tech): **New Project** → PostgreSQL 16.

3. Copie a connection string e adicione `?sslmode=require` se não estiver presente.

4. No seu Mac, na raiz do projeto, configure `.env` com a `DATABASE_URL` do Neon:
   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:deploy
   pnpm db:seed
   ```
   O seed roda apenas fora de `NODE_ENV=production`.

5. Gere o JWT secret:
   ```bash
   openssl rand -base64 48
   ```

### Fase B — API no Railway

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → selecione `gas-erp`.

2. O arquivo [`railway.toml`](../railway.toml) na raiz define build, migrations (`releaseCommand`) e start do monorepo. O build usa `pnpm install --prod=false` porque ferramentas como Prisma CLI, TypeScript e Nest CLI ficam em `devDependencies`.

3. Em **Variables**, configure:
   - `DATABASE_URL` — Neon
   - `JWT_SECRET` — valor gerado no passo A.5
   - `JWT_EXPIRES_IN` — `7d`
   - `WEB_URL` — `https://app.SEUDOMINIO` (ou URL Vercel temporária até o DNS)
   - `NODE_ENV` — `production`

4. Aguarde o deploy e anote a URL `*.up.railway.app`.

5. Teste o login:
   ```bash
   curl -X POST https://SUA-URL-RAILWAY.up.railway.app/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"master@gas.com","password":"admin123"}'
   ```

### Fase C — Web na Vercel

1. [Vercel](https://vercel.com) → **Add New Project** → importe o repo GitHub.

2. Configuração:
   - **Root Directory:** `apps/web`
   - O [`vercel.json`](../apps/web/vercel.json) cuida do build do monorepo

3. **Environment Variables:**
   - `NEXT_PUBLIC_API_URL` = `https://api.SEUDOMINIO/api/v1`  
     (use a URL Railway até o domínio `api.` estar ativo)

4. Deploy → anote a URL `*.vercel.app`.

5. Atualize `WEB_URL` no Railway com a URL final do app (domínio ou `*.vercel.app`) e redeploy a API.

### Fase D — Domínio e DNS

No painel do seu registrador (Registro.br, Cloudflare, etc.):

| Subdomínio | Tipo | Destino |
|------------|------|---------|
| `app` | CNAME | valor indicado pela Vercel (ex.: `cname.vercel-dns.com`) |
| `api` | CNAME | valor indicado pelo Railway |

Depois:

1. **Vercel** → Project → Settings → Domains → adicione `app.SEUDOMINIO`
2. **Railway** → Service → Settings → Custom Domain → `api.SEUDOMINIO`
3. Atualize variáveis:
   - Railway: `WEB_URL=https://app.SEUDOMINIO`
   - Vercel: `NEXT_PUBLIC_API_URL=https://api.SEUDOMINIO/api/v1`
4. Redeploy API e Web

### Fase E — Validação

- [ ] `https://app.SEUDOMINIO/login` abre sem erro
- [ ] Login com `master@gas.com` / `admin123` funciona
- [ ] Painel master mostra as 3 lojas (seed)
- [ ] Nova venda em uma loja → estoque baixa
- [ ] Resumo diário exibe dados
- [ ] DevTools → Network: sem erro de CORS

### Fase F — Segurança pós-MVP

- [ ] Trocar senha do usuário master e demais contas demo
- [ ] Não rodar `pnpm db:seed` em produção (`NODE_ENV=production` bloqueia)
- [ ] Confirmar `JWT_SECRET` único e não versionado no git
- [ ] HTTPS ativo em app e api

---

## Comandos úteis

```bash
# Verificar se o projeto compila e está pronto para deploy
pnpm verify:deploy

# Desenvolvimento local
pnpm dev

# Aplicar migrations em produção (com DATABASE_URL do Neon no .env)
pnpm db:deploy

# Build completo (CI local)
pnpm build
```

---

## Troubleshooting

### Erro de CORS no browser

- Confirme `WEB_URL` no Railway = URL exata do front (com `https://`, sem barra final)
- Redeploy da API após alterar `WEB_URL`

### API retorna 502 / não sobe

- Verifique logs no Railway
- Confirme `DATABASE_URL` com `sslmode=require`
- Confirme que `pnpm db:deploy` foi executado no Neon

### Build falha no monorepo

- Ordem: `pnpm install` → `db:generate` → `@gas-erp/shared build` → `@gas-erp/database build` → `@gas-erp/api` ou `@gas-erp/web build`
- Node 20+ obrigatório

### Railway: `prisma: Permission denied` no build

- Causa: `NODE_ENV=production` faz o pnpm pular `devDependencies` (Prisma CLI, TypeScript, Nest CLI).
- O [`railway.toml`](../railway.toml) já usa `pnpm install --prod=false` no `buildCommand`.
- Faça push dessa alteração e redeploy.

### Prisma: tabelas não existem

```bash
DATABASE_URL="..." pnpm db:deploy
```

### Web chama API errada

- `NEXT_PUBLIC_API_URL` deve terminar em `/api/v1`
- Rebuild na Vercel após mudar a variável (é embedada no build)

---

## Custos estimados (início)

| Serviço | Tier | Custo ~ |
|---------|------|---------|
| Neon | Free | R$ 0 |
| Vercel | Hobby | R$ 0 |
| Railway | Trial / Hobby | R$ 0–50/mês |
| Domínio .com.br | — | ~R$ 40/ano |

---

## Próximas fases (fora deste MVP)

- Ambiente **staging** (`staging.SEUDOMINIO`)
- **CI/CD** com GitHub Actions
- **Redis** (Upstash) para filas e real-time
- **Sentry** para erros
- **VPS / Fly.io** quando o volume justificar
