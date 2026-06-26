# Deploy e infraestrutura

Guia para colocar o Gas ERP em produção e evoluir a infraestrutura conforme o negócio cresce.

## Status atual (jun/2026)

Deploy MVP **no ar** e validado em uso para a Rede Gás Litoral / THL Gás do Povo.

| Item | Status | Detalhe |
|------|--------|---------|
| Repositório GitHub | ✅ | `lvlparticipacoesltda/gas-erp` |
| Banco PostgreSQL (Neon) | ✅ | 11 migrations (ver abaixo); rodar `pnpm db:deploy` após push com migration nova |
| API (Railway) | ✅ | `https://gas-erpapi-production.up.railway.app` |
| Web (Vercel) | ✅ | Alias `gas-erp-web.vercel.app` |
| Domínio customizado | ✅ | `https://thlgasdopovo.com.br` → Vercel (DNS Hostinger) |
| CORS | ✅ | Callback multi-origin; `WEB_URL=https://thlgasdopovo.com.br` |
| Health check | ✅ | `GET /api/v1/health` |
| Login e fluxos MVP | ✅ | Validado pelo cliente |
| Minha conta + troca de senha | ✅ | `/master/settings` e `/store/[id]/settings` |
| Recuperação de senha (código) | ✅ | Resend integrado; ver [resend-setup.md](resend-setup.md) |
| Permissões por tela (RBAC) | ✅ | Ver [rbac.md](rbac.md) |
| Usuário ↔ múltiplas lojas | ✅ | `StoreMultiSelect` com checkboxes |
| Subdomínio `api.` | ⏳ | API ainda na URL `*.up.railway.app` (opcional) |
| Subdomínio `www` | ⏳ | Redirecionar `www` → apex ou incluir no CORS |
| Domínio Resend verificado | ⏳ | DNS na Hostinger pode estar pendente |
| Senhas demo | ⏳ | Ainda `admin123` — trocar em produção |
| CI/CD (GitHub Actions) | ⏳ | Deploy manual via push |
| Módulo fiscal | ⏳ | Fase 2 |
| Sidebar entregas + métricas espera/rota + por entregador | ✅ | `delivery-metrics.ts` no dashboard e listagens |
| Resumo diário filtro De/Até (loja + master consolidado) | ✅ | `business-day.ts`, `DailySummaryDateFilter` |
| Paginação nas listas + loading ao filtrar período | ✅ | Server-side 20/pág; resumo client-side 15/pág |
| Venda: Portaria, GDP, Gás do Povo, data retroativa | ✅ | Ver migrations jun/2026 |
| Entregador N:N unidades (`DelivererStore`) | ✅ | Migration `20260625120000_deliverer_multi_store` |
| Push notifications (Expo) | ✅ | Nova entrega / cancelamento |
| App entregador (Expo) | 🟡 | MVP testado (emulador + EAS preview APK); Play Store pendente |
| App cliente | ⏳ | Fase 2 |

> **Guia de desenvolvimento local e mobile:** [development.md](development.md)

### Commits recentes (main)

| Commit | Descrição |
|--------|-----------|
| `5edbe93` | Data retroativa com aprovação de gerente + `SaleBackdateLog` |
| `bc84474` | Paginação nas listas + loading ao filtrar período |
| `aefac8e` | Filtro De/Até no resumo diário e painel master |
| `891b1b5` | Resumo diário consolidado de todas as unidades (master) |
| `a6435ce` | GDP como pagamento, métricas por entregador, `DIRECT_URL` |
| `1335208` | Benefício Gás do Povo, taxa entrega, cadastro entregadores |
| `d044e6e` | Status Portaria, auditoria, edição por gerente/master |
| `c2642d7` | Push notifications Expo para entregador |

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
| `DATABASE_URL` | Railway | Neon pooler (`sslmode=require`) |
| `DIRECT_URL` | Railway | Neon **sem** `-pooler` (migrations Prisma) |
| `JWT_SECRET` | Railway | gerado (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Railway | `7d` |
| `WEB_URL` | Railway | `https://thlgasdopovo.com.br` |
| `NODE_ENV` | Railway | `production` |
| `RESEND_API_KEY` | Railway | chave Resend (recuperação de senha) |
| `EMAIL_FROM` | Railway | `Gas ERP <noreply@thlgasdopovo.com.br>` |
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

## App do entregador (Expo — `apps/mobile`)

App React Native (Expo SDK 56 + `expo-router`) usado pelos entregadores para ver entregas atribuídas, iniciar a rota (abre o Google Maps), acompanhar o tempo em rota, concluir a entrega e enviar GPS em segundo plano. O foco inicial é **Android**, perfil de uso típico dos entregadores.

- JWT guardado com `expo-secure-store`
- GPS em segundo plano com `expo-location` + `expo-task-manager` durante entregas `IN_PROGRESS`
- Login restrito ao papel `DELIVERER` (usuário criado pelo painel master)
- Consome a mesma API (`/api/v1`) do painel web

### Variáveis de ambiente

| Variável | Onde | Valor |
|----------|------|-------|
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` ou perfil EAS | URL base da API **incluindo `/api/v1`**. Default no código aponta para produção (`https://gas-erpapi-production.up.railway.app/api/v1`) |

> Variáveis `EXPO_PUBLIC_*` são embutidas no bundle em build/start. Ao mudar o valor, reinicie o `expo start` ou gere um novo build EAS.

`.env` local (ver [`apps/mobile/.env.example`](../apps/mobile/.env.example)):

```env
# Default já aponta para produção; descomente para apontar para a API local
# EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
EXPO_PUBLIC_API_URL=https://gas-erpapi-production.up.railway.app/api/v1
```

> Para testar contra a API local em um dispositivo físico, use o IP da máquina na rede (ex.: `http://192.168.0.10:3001/api/v1`), não `localhost`.

### Desenvolvimento local

Ver guia completo: **[development.md](development.md)** (JAVA_HOME, emulador, Metro, troubleshooting).

Resumo:

```bash
# Na raiz
pnpm install && pnpm dev

# Mobile — emulador (dev build)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd apps/mobile
npx expo run:android              # primeira vez (~15–20 min)
npx expo start --dev-client       # dia a dia (Metro obrigatório)
```

> **GPS em segundo plano não funciona no Expo Go.** Use dev build (`expo run:android`) ou APK EAS (`preview`/`development`). Permissão "o tempo todo" necessária para tracking em background.

### Build interno Android (EAS)

A configuração de build está em [`apps/mobile/eas.json`](../apps/mobile/eas.json), com três perfis:

| Perfil | Uso | Saída Android |
|--------|-----|---------------|
| `development` | Dev build com `developmentClient` para testar GPS em background | APK interno |
| `preview` | Build interno para validação dos entregadores | APK |
| `production` | Build de loja (Play Store) | App Bundle (`.aab`) |

Pré-requisitos: conta [Expo](https://expo.dev) e EAS CLI (`npm install -g eas-cli`).

```bash
cd apps/mobile

# 1. Login na conta Expo (uma vez)
npx eas login

# 2. Vincular o projeto ao EAS (gera extra.eas.projectId no app.json)
npx eas init

# 3. Build interno (APK) para distribuir aos entregadores
npx eas build -p android --profile preview

# Dev build (necessário para testar GPS em background localmente)
npx eas build -p android --profile development

# Build de produção (App Bundle para a Play Store)
npx eas build -p android --profile production
```

> Os comandos `eas build` exigem login e credenciais (keystore Android gerenciado pelo EAS). Não são executados no CI/local sem autenticação.

### Distribuição interna do APK

1. Rode `npx eas build -p android --profile preview`.
2. Ao terminar, o EAS retorna um **link de download do APK** (também visível no dashboard `expo.dev`).
3. Compartilhe o link com os entregadores (WhatsApp/e-mail). No Android, é preciso permitir **instalar de fontes desconhecidas** para instalar o APK fora da Play Store.
4. Para atualizações, basta gerar um novo build `preview` e reenviar o link.

> iOS fica para uma etapa seguinte (TestFlight via `npx eas build -p ios --profile preview` + `eas submit`), exige conta Apple Developer paga.

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
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/gas_erp?schema=public"
JWT_SECRET="dev-secret-change-me"
JWT_EXPIRES_IN="7d"
API_PORT=3001
WEB_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### Produção

| Variável | Onde | Exemplo |
|----------|------|---------|
| `DATABASE_URL` | Railway | `postgresql://...@ep-xxx-pooler.neon.tech/...?sslmode=require` |
| `DIRECT_URL` | Railway | `postgresql://...@ep-xxx.neon.tech/...?sslmode=require` (sem pooler) |
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
- [x] Login com `master@gas.com` / `admin123` validado em produção
- [x] Painel master mostra as lojas (seed)
- [x] Fluxos principais testados pelo cliente (jun/2026)
- [ ] Nova venda em uma loja → estoque baixa (revalidar após mudanças)
- [ ] Resumo diário exibe dados (revalidar após mudanças)
- [x] DevTools → Network: sem erro de CORS nas telas principais
- [x] Cadastro de usuário com múltiplas lojas (checkboxes)
- [x] Permissões por tela refletem no menu da loja
- [ ] E-mail de recuperação de senha entregue (depende Resend + DNS)

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

### Prisma: tabelas não existem ou migration pendente

```bash
DATABASE_URL="..." DIRECT_URL="..." pnpm db:deploy
```

### Prisma P1002 (advisory lock no Neon)

Causa comum: sessão idle no pooler segurando lock. Soluções:

1. Configure `DIRECT_URL` no Railway (host Neon **sem** `-pooler`)
2. Encerre sessões idle no console Neon
3. `pnpm db:deploy:force` (script com retry/lock release) — ver `scripts/db-release-migrate-lock.sh`

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

### Imediato

1. **`git push`** — commit `5edbe93` (data retroativa) e anteriores se ainda não no remoto
2. **`pnpm db:deploy`** em produção — aplicar migrations até `20260626100000_sale_backdate_approval`
3. **`DIRECT_URL`** no Railway — obrigatório para migrations estáveis no Neon
4. **Finalizar Resend** — verificar domínio `thlgasdopovo.com.br` na Resend + DNS Hostinger ([resend-setup.md](resend-setup.md))
5. **Trocar senhas demo** — Minha conta ou recuperação por e-mail
6. **Redirect `www`** — na Vercel, `www.thlgasdopovo.com.br` → `thlgasdopovo.com.br`
7. **Novo APK EAS** — `eas build --profile preview` para entregadores testarem push + GPS

### Refinamentos MVP (concluídos — jun/2026)

- [x] Minha conta — perfil e alteração de senha (`/master/settings`, `/store/[id]/settings`)
- [x] Recuperação de senha por e-mail (Resend + `PasswordResetToken`)
- [x] Edição de usuários e lojas (master)
- [x] Confirmação ao desativar usuário/loja
- [x] Mensagens de erro claras (`apps/web/src/lib/errors.ts`)
- [x] Logo e favicon no login
- [x] Painel master sem seletor de loja na sidebar (apenas `/master/go-to-store`)
- [x] Dashboard master com cards clicáveis para entrar na loja
- [x] Permissões por tela por usuário (`User.permissions`, ver [rbac.md](rbac.md))
- [x] Menu da loja e guard de rota filtrados por permissão
- [x] Vínculo usuário ↔ **múltiplas lojas** (`StoreMultiSelect` com checkboxes)
- [x] Coluna "Lojas" na listagem de usuários do master
- [x] Resumo diário com filtro De/Até e métricas por entregador
- [x] Dashboard master com resumo consolidado de todas as unidades
- [x] Paginação nas listagens principais
- [x] Benefício Gás do Povo + pagamento GDP
- [x] Data retroativa de venda com aprovação gerente
- [x] Push notifications Expo (entregador)

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
| **App entregador** | **MVP entregue** em `apps/mobile` (login, rotas, GPS, push, EAS preview APK). Falta publicação Play Store — ver [playstore-checklist.md](playstore-checklist.md) | Alta |
| **App cliente** | Pedido online, rastreamento, pagamento (Pix/cartão) | Média |
| **WhatsApp** | Notificações e pedidos via API Business | Média |
| **Redis / filas** | Entregas em tempo real, jobs assíncronos (Upstash) | Média |
| **Multi-tenant SaaS** | Onboarding de novas redes, billing por loja | Baixa (já preparado no schema) |

### Melhorias técnicas (pendentes)

- **Testes E2E** — Playwright no fluxo de login, venda e aprovação retroativa
- **Auditoria** — expandir `AuditService` para mais ações
- **Badge pendências** — contador de vendas aguardando aprovação de data no menu
- **Prisma config** — migrar de `package.json#prisma` para `prisma.config.ts`

---

## Próximas fases de infra (longo prazo)

- Ambiente **staging** (`staging.thlgasdopovo.com.br`)
- **CI/CD** completo com GitHub Actions
- **Redis** (Upstash) para filas e real-time
- **Sentry** para erros
- **VPS / Fly.io** quando o volume justificar sair do Railway
