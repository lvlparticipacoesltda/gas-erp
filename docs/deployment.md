# Deploy e infraestrutura

Guia para colocar o Gas ERP em produção e evoluir a infraestrutura conforme o negócio cresce.

## Status atual (jun/2026)

Deploy MVP **no ar** para a Rede Gás Litoral / THL Gás do Povo.

| Item | Status | Detalhe |
|------|--------|---------|
| Repositório GitHub | ✅ | `lvlparticipacoesltda/gas-erp` |
| Banco PostgreSQL (Neon) | ✅ | Migrations aplicadas + seed demo |
| API (Railway) | ✅ | `https://gas-erpapi-production.up.railway.app` |
| Web (Vercel) | ✅ | Alias `gas-erp-web.vercel.app` |
| Domínio customizado | ✅ | `https://thlgasdopovo.com.br` → Vercel (DNS Hostinger) |
| CORS | ✅ | `WEB_URL=https://thlgasdopovo.com.br` no Railway |
| Health check | ✅ | `GET /api/v1/health` |
| Subdomínio `api.` | ⏳ | API ainda na URL `*.up.railway.app` (opcional) |
| Subdomínio `www` | ⏳ | Redirecionar `www` → apex ou incluir no CORS |
| Senhas demo | ⏳ | Ainda `admin123` — trocar em produção |
| CI/CD (GitHub Actions) | ⏳ | Deploy manual via push |
| Módulo fiscal | ⏳ | Fase 2 |
| Apps mobile | ⏳ | Fase 2 |

### URLs de produção

| Serviço | URL |
|---------|-----|
| **App (login)** | https://thlgasdopovo.com.br/login |
| **API** | https://gas-erpapi-production.up.railway.app/api/v1 |
| **Health** | https://gas-erpapi-production.up.railway.app/api/v1/health |
| **Vercel (backup)** | https://gas-erp-web.vercel.app |

### Variáveis configuradas

| Variável | Onde | Valor atual |
|----------|------|-------------|
| `DATABASE_URL` | Railway | Neon (`sslmode=require`) |
| `JWT_SECRET` | Railway | gerado (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Railway | `7d` |
| `WEB_URL` | Railway | `https://thlgasdopovo.com.br` |
| `NODE_ENV` | Railway | `production` |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://gas-erpapi-production.up.railway.app/api/v1` |

### Arquitetura em produção (atual)

```
Usuários
   │
   ▼
thlgasdopovo.com.br  ──►  Hostinger DNS  ──►  Vercel (Next.js)
   │
   │  NEXT_PUBLIC_API_URL
   ▼
gas-erpapi-production.up.railway.app  ──►  Railway (NestJS)
   │
   ▼
Neon PostgreSQL (sa-east-1)
```

---

## Estratégia por fase

| Fase | Cenário | Sugestão |
|------|---------|----------|
| **Agora** | MVP real, 1 rede, poucas lojas | **Vercel + Railway + Neon** — sem VPS |
| **Crescimento** | Mais lojas, GPS tempo real, filas | Manter web na Vercel; API em VPS ou Fly; Redis (Upstash) |
| **Muito volume** | Fiscal, integrações pesadas | VPS ou Kubernetes com Postgres gerenciado |

### Arquitetura alvo (com subdomínios)

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

Hoje o domínio raiz (`thlgasdopovo.com.br`) aponta direto para a Vercel. O subdomínio `api.` no Railway é opcional e pode ser configurado depois.

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
| `WEB_URL` | Railway | `https://thlgasdopovo.com.br` |
| `NODE_ENV` | Railway | `production` |
| `RESEND_API_KEY` | Railway | chave da [Resend](https://resend.com) (recuperação de senha) |
| `EMAIL_FROM` | Railway | `Gas ERP <noreply@thlgasdopovo.com.br>` (domínio verificado na Resend) |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://gas-erpapi-production.up.railway.app/api/v1` |

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
   - `WEB_URL` — `https://app.SEUDOMINIO` (ou URL Vercel temporária até o DNS). **Sem aspas** e sem barra no final. Ex.: `https://gas-erp.vercel.app`
   - `NODE_ENV` — `production`

4. Aguarde o deploy e anote a URL `*.up.railway.app`.

5. Teste a API:
   ```bash
   # Health check (sem autenticação)
   curl https://gas-erpapi-production.up.railway.app/api/v1/health

   # Login
   curl -X POST https://gas-erpapi-production.up.railway.app/api/v1/auth/login \
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

#### Configuração atual (Hostinger + domínio raiz)

1. **Hostinger** → DNS apontando para a Vercel (nameservers ou registros indicados pela Vercel).
2. **Vercel** → Settings → Domains → `thlgasdopovo.com.br` adicionado e validado.
3. **Railway** → `WEB_URL=https://thlgasdopovo.com.br` (sem aspas, sem `/` no final).
4. **Vercel** → `NEXT_PUBLIC_API_URL=https://gas-erpapi-production.up.railway.app/api/v1` + redeploy.

> **Importante:** variáveis `NEXT_PUBLIC_*` são embutidas no build do Next.js. Sempre **redeploy** na Vercel após alterá-las.

#### Configuração com subdomínios (opcional, recomendado depois)

No painel DNS da **Hostinger**:

| Subdomínio | Tipo | Destino |
|------------|------|---------|
| `@` (raiz) | A / CNAME | valor indicado pela Vercel |
| `www` | CNAME | `cname.vercel-dns.com` (ou redirect na Vercel) |
| `api` | CNAME | valor indicado pelo Railway |

Depois:

1. **Vercel** → Domains → `thlgasdopovo.com.br` e/ou `app.thlgasdopovo.com.br`
2. **Railway** → Settings → Custom Domain → `api.thlgasdopovo.com.br`
3. Atualize variáveis:
   - Railway: `WEB_URL=https://thlgasdopovo.com.br`
   - Vercel: `NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1`
4. Redeploy API e Web

### Fase E — Validação

- [x] Site abre em `https://thlgasdopovo.com.br`
- [x] API responde em `/api/v1/health` (`status: ok`, `database: ok`)
- [x] CORS configurado (`WEB_URL` = domínio do front)
- [ ] Login com `master@gas.com` / `admin123` validado em produção
- [ ] Painel master mostra as 3 lojas (seed)
- [ ] Nova venda em uma loja → estoque baixa
- [ ] Resumo diário exibe dados
- [ ] DevTools → Network: sem erro de CORS em todas as telas

### Fase F — Segurança pós-MVP

- [ ] Trocar senha do usuário master e demais contas demo
- [x] Não rodar `pnpm db:seed` em produção (`NODE_ENV=production` bloqueia)
- [ ] Confirmar `JWT_SECRET` único e não versionado no git
- [x] HTTPS ativo no app (`thlgasdopovo.com.br`)
- [ ] HTTPS no domínio customizado da API (quando `api.` for configurado)

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
- **Não use aspas** no valor no Railway — use `https://thlgasdopovo.com.br`, não `"https://thlgasdopovo.com.br"`
- Vários domínios (com e sem `www`): separe por vírgula, ex. `https://thlgasdopovo.com.br,https://www.thlgasdopovo.com.br`
- Se aparecer `ERR_INVALID_CHAR` em `Access-Control-Allow-Origin`, o valor de `WEB_URL` provavelmente tem aspas, espaço ou quebra de linha
- Se aparecer `header contains multiple values` com as duas URLs juntas, faça deploy da API mais recente (CORS com callback) ou use só uma URL em `WEB_URL` por enquanto
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

### E-mail de recuperação de senha não chega

Guia passo a passo: [resend-setup.md](resend-setup.md)

- Configure `RESEND_API_KEY` e `EMAIL_FROM` no Railway
- Verifique o domínio do remetente na [Resend](https://resend.com/domains)
- Sem API key, o link aparece nos **logs do Railway** (modo fallback)
- Confirme que `WEB_URL` aponta para o front (`https://thlgasdopovo.com.br`)
- Rode `pnpm db:deploy` para criar a tabela `PasswordResetToken`

---

## Custos estimados (início)

| Serviço | Tier | Custo ~ |
|---------|------|---------|
| Neon | Free | R$ 0 |
| Vercel | Hobby | R$ 0 |
| Railway | Trial / Hobby | R$ 0–50/mês |
| Domínio .com.br | — | ~R$ 40/ano |

---

## Próximos passos

### Imediato (esta semana)

1. **Validar login em produção** — `https://thlgasdopovo.com.br/login`
2. **Trocar senhas demo** — usar Minha conta ou recuperação por e-mail
3. **Configurar Resend** — guia completo: [resend-setup.md](resend-setup.md)
4. **Rodar migration** — `pnpm db:deploy` com `DATABASE_URL` do Neon (tabela `PasswordResetToken`)
5. **Redirect `www`** — na Vercel, `www.thlgasdopovo.com.br` → `thlgasdopovo.com.br`
6. **Testar fluxos MVP** — venda, estoque, clientes, resumo diário

### Refinamentos MVP (concluídos)

- [x] Minha conta — perfil e alteração de senha
- [x] Recuperação de senha por e-mail (Resend)
- [x] Edição de usuários e lojas (master)
- [x] Confirmação ao desativar usuário/loja
- [x] Mensagens de erro claras (e-mail duplicado)
- [x] Logo e favicon no login
- [x] Painel master sem seletor de loja (apenas em "Ir para loja")

### Infraestrutura (curto prazo)

| Passo | Descrição |
|-------|-----------|
| Subdomínio `api.` | Railway Custom Domain + CNAME na Hostinger; atualizar `NEXT_PUBLIC_API_URL` na Vercel |
| Ambiente staging | Branch `staging` + projeto Neon/Railway/Vercel separados |
| CI/CD | GitHub Actions: lint, build, `verify:deploy` em cada PR |
| Monitoramento | Sentry (erros) + uptime no `/api/v1/health` |
| Backups | Confirmar política de backup automático no Neon |

### Produto — Fase 2 (implementações)

| Módulo | Descrição | Prioridade |
|--------|-----------|------------|
| **Fiscal** | NFC-e/NF-e via `FiscalProvider` (stub já existe em `packages/shared`) | Alta |
| **Financeiro** | Contas a pagar/receber, fluxo de caixa | Alta |
| **Relatórios** | Exportação PDF/Excel, filtros avançados | Média |
| **App entregador** | Expo/React Native — GPS, rotas, confirmação de entrega | Alta |
| **App cliente** | Pedido online, rastreamento, pagamento (Pix/cartão) | Média |
| **WhatsApp** | Notificações e pedidos via API Business | Média |
| **Redis / filas** | Entregas em tempo real, jobs assíncronos (Upstash) | Média |
| **Multi-tenant SaaS** | Onboarding de novas redes, billing por loja | Baixa (já preparado no schema) |

### Melhorias técnicas (pendentes)

- **Paginação** e busca em listagens grandes
- **Auditoria** — expandir `AuditService` para mais ações
- **Testes E2E** — Playwright no fluxo de login e venda
- **Prisma config** — migrar de `package.json#prisma` para `prisma.config.ts`

---

## Próximas fases de infra (longo prazo)

- Ambiente **staging** (`staging.thlgasdopovo.com.br`)
- **CI/CD** completo com GitHub Actions
- **Redis** (Upstash) para filas e real-time
- **Sentry** para erros
- **VPS / Fly.io** quando o volume justificar sair do Railway
