# Deploy e infraestrutura

Guia para colocar o Gas ERP em produção e evoluir a infraestrutura conforme o negócio cresce.

## Status atual (jul/2026)

Deploy MVP **no ar** e validado em uso para a Rede Gás Litoral / THL Gás do Povo.

| Item | Status | Detalhe |
|------|--------|---------|
| Repositório GitHub | ✅ | `lvlparticipacoesltda/gas-erp` |
| Banco PostgreSQL (Neon) | ✅ | 21 migrations aplicadas em produção |
| API (Fly.io GRU) | ✅ | `https://api.thlgasdopovo.com.br` — ver [fly-migration.md](fly-migration.md) |
| API (Railway — legado) | ⏳ | `gas-erpapi-production.up.railway.app` — pausar após 24–48h estáveis no Fly |
| Web (Vercel) | ✅ | Alias `gas-erp-web.vercel.app` |
| Domínio customizado | ✅ | `https://thlgasdopovo.com.br` → Vercel (DNS Hostinger) |
| Subdomínio `api.` | ✅ | `api.thlgasdopovo.com.br` → Fly.io GRU |
| CORS | ✅ | Callback multi-origin; `WEB_URL=https://thlgasdopovo.com.br` |
| Health check | ✅ | `GET /api/v1/health` |
| Login e fluxos MVP | ✅ | Validado pelo cliente |
| CI (GitHub Actions) | ✅ | Build seletivo API/web em PR e push — `.github/workflows/ci.yml` |
| Subdomínio `www` | ⏳ | Redirecionar `www` → apex ou incluir no CORS |

> **Guia de desenvolvimento local e mobile:** [development.md](development.md)

### Commits recentes (main)

| Commit | Descrição |
|--------|-----------|
| `f427a17` | Métricas de entrega renomeadas + tempo total da entrega |
| `4bbf3dd` | Vendas efetivadas contabilizadas corretamente em painéis e relatórios |
| `a2787ab` | Mobile aponta para `api.thlgasdopovo.com.br` (Fly) |
| `123314b` | Deploy da API no Fly.io GRU |
| `51db304` | Otimização de latência + deploy seletivo (Sprint 2) |
| `c2ca6c6` | Ícones e logos da marca no painel web |

### URLs de produção

| Serviço | URL |
|---------|-----|
| **App (login)** | https://thlgasdopovo.com.br/login |
| **API** | https://api.thlgasdopovo.com.br/api/v1 |
| **Health** | https://api.thlgasdopovo.com.br/api/v1/health |
| **API (Fly direto)** | https://gas-erp-api.fly.dev/api/v1 |
| **API (Railway — legado)** | https://gas-erpapi-production.up.railway.app/api/v1 |
| **Vercel (backup)** | https://gas-erp-web.vercel.app |

**Latência medida (jul/2026):** health ~59 ms · login ~171 ms · dashboard master ~71 ms (antes no Railway: ~1–3 s).

### Variáveis configuradas

| Variável | Onde | Valor atual |
|----------|------|-------------|
| `DATABASE_URL` | Fly | Neon pooler (`sslmode=require`) |
| `DIRECT_URL` | Fly | Neon sem `-pooler` (migrations) |
| `JWT_SECRET` | Fly | gerado (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Fly | `7d` |
| `WEB_URL` | Fly | `https://thlgasdopovo.com.br` |
| `NODE_ENV` | Fly | `production` |
| `RESEND_API_KEY` | Fly | chave Resend (recuperação de senha) |
| `EMAIL_FROM` | Fly | `Gas ERP <noreply@thlgasdopovo.com.br>` |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://api.thlgasdopovo.com.br/api/v1` |

### Arquitetura em produção (atual)

```
Usuários
   │
   ▼
thlgasdopovo.com.br  ──►  Hostinger DNS  ──►  Vercel (Next.js)
   │
   │  NEXT_PUBLIC_API_URL
   ▼
api.thlgasdopovo.com.br  ──►  Fly.io GRU (NestJS, apps/api)
   │
   ▼
Neon PostgreSQL (sa-east-1)
```

---

## Estratégia por fase

| Fase | Cenário | Sugestão |
|------|---------|----------|
| **Agora** | MVP real, 1 rede, poucas lojas | **Vercel + Fly.io GRU + Neon** — API e banco no Brasil |
| **Crescimento** | Mais lojas, GPS tempo real, filas | Manter web na Vercel; + Redis (Upstash sa-east-1), staging, Sentry |
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
api.SEUDOMINIO  ──►  Fly.io GRU (NestJS apps/api)
   │
   ▼
Neon PostgreSQL
```

Hoje o domínio raiz (`thlgasdopovo.com.br`) aponta para a Vercel e `api.thlgasdopovo.com.br` aponta para o Fly.io GRU.

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
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` ou perfil EAS | URL base da API **incluindo `/api/v1`**. Default: `https://api.thlgasdopovo.com.br/api/v1` |

> Variáveis `EXPO_PUBLIC_*` são embutidas no bundle em build/start. Ao mudar o valor, reinicie o `expo start` ou gere um novo build EAS.

`.env` local (ver [`apps/mobile/.env.example`](../apps/mobile/.env.example)):

```env
# Default aponta para produção (Fly.io GRU)
EXPO_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1
# Descomente para API local:
# EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
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
- Conta [Fly.io](https://fly.io) (API — região GRU)
- Conta [Vercel](https://vercel.com) (Web)
- Domínio próprio com acesso ao DNS
- Node.js 20+ e pnpm 9+ no Mac (para migrations/seed locais)

> Railway ainda pode existir como fallback legado; novos deploys da API devem usar Fly.io — ver [fly-migration.md](fly-migration.md).

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
| `DATABASE_URL` | Fly | `postgresql://...@ep-xxx-pooler.neon.tech/...?sslmode=require` |
| `DIRECT_URL` | Fly | `postgresql://...@ep-xxx.neon.tech/...?sslmode=require` (sem pooler) |
| `JWT_SECRET` | Fly | string longa aleatória (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Fly | `7d` |
| `WEB_URL` | Fly | `https://thlgasdopovo.com.br` |
| `NODE_ENV` | Fly | `production` |
| `RESEND_API_KEY` | Fly | chave da [Resend](https://resend.com) (recuperação de senha) |
| `EMAIL_FROM` | Fly | `Gas ERP <noreply@thlgasdopovo.com.br>` (domínio verificado na Resend) |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://api.thlgasdopovo.com.br/api/v1` |

Fly injeta `PORT` automaticamente via `fly.toml` (`8080`). Railway (legado) usava `PORT` ou `API_PORT`.

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

### Fase B — API no Fly.io (GRU)

Guia completo: **[fly-migration.md](fly-migration.md)**

Resumo:

1. `fly auth login` e `fly launch --copy-config --no-deploy` (região **gru**)
2. `fly secrets set` com as mesmas variáveis do Neon/JWT/Resend + `fly secrets deploy`
3. `bash scripts/fly-deploy.sh` (ou `fly deploy`)
4. `fly certs add api.thlgasdopovo.com.br` + CNAME no DNS
5. Vercel: `NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1` + redeploy
6. Validar health, login, dashboard; pausar Railway quando estável

### Fase B (legado) — API no Railway

<details>
<summary>Instruções históricas — Railway (substituído pelo Fly.io em jul/2026)</summary>

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → selecione `gas-erp`.
2. O arquivo [`railway.toml`](../railway.toml) na raiz define build, migrations (`releaseCommand`) e start do monorepo.
3. Configure `DATABASE_URL`, `JWT_SECRET`, `WEB_URL`, etc.
4. URL legada: `https://gas-erpapi-production.up.railway.app`

</details>

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
3. **Fly** → `WEB_URL=https://thlgasdopovo.com.br` (sem aspas, sem `/` no final).
4. **Vercel** → `NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1` + redeploy.

> **Importante:** variáveis `NEXT_PUBLIC_*` são embutidas no build do Next.js. Sempre **redeploy** na Vercel após alterá-las.

#### Configuração com subdomínios (opcional, recomendado depois)

No painel DNS da **Hostinger**:

| Subdomínio | Tipo | Destino |
|------------|------|---------|
| `@` (raiz) | A / CNAME | valor indicado pela Vercel |
| `www` | CNAME | `cname.vercel-dns.com` (ou redirect na Vercel) |
| `api` | CNAME | valor indicado pelo `fly certs add` (Fly.io GRU) |

Depois:

1. **Vercel** → Domains → `thlgasdopovo.com.br` e/ou `app.thlgasdopovo.com.br`
2. **Fly** → Settings → Certificates → `api.thlgasdopovo.com.br`
3. Atualize variáveis:
   - Fly: `WEB_URL=https://thlgasdopovo.com.br`
   - Vercel: `NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1`
4. Redeploy API (Fly) e Web (Vercel)

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
- [x] E-mail de recuperação de senha entregue (Resend + DNS verificados)

### Fase F — Segurança pós-MVP

- [x] Trocar senha do usuário master e demais contas demo
- [x] Não rodar `pnpm db:seed` em produção (`NODE_ENV=production` bloqueia)
- [ ] Confirmar `JWT_SECRET` único e não versionado no git
- [x] HTTPS ativo no app (`thlgasdopovo.com.br`)
- [x] HTTPS no domínio customizado da API (`api.thlgasdopovo.com.br` → Fly.io)

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
| Fly.io GRU | Hobby (~1 máquina) | ~US$ 5–7/mês |
| Domínio .com.br | — | ~R$ 40/ano |

---

## Próximos passos

Roadmap detalhado com sprints: **[roadmap.md](roadmap.md)**

### Sprint 1 — Publicação mobile e segurança

**Status:** 🟡 Quase concluído — falta apenas redirect `www` (1.7).

- [x] **21 migrations** em produção (`20260701120000_deliverer_gps_stale_reminder`)
- [x] **`DIRECT_URL`** no Railway (migrations estáveis no Neon)
- [x] **Senhas demo** trocadas em produção
- [x] **Build AAB produção** (`eas build --profile production`)
- [x] **Play Store** — vídeo GPS + Data safety + declaração background location
- [x] **App publicado** na Google Play (jul/2026)
- [ ] **Redirect `www`** — na Vercel, `www.thlgasdopovo.com.br` → `thlgasdopovo.com.br`

Ver [playstore-checklist.md](playstore-checklist.md) · [roadmap.md](roadmap.md)

### Sprint 2 — Infraestrutura

**Status:** 🟡 Bloco principal concluído (API Fly GRU, CI, deploy seletivo). Pendências menores abaixo.

| Passo | Status | Descrição |
|-------|--------|-----------|
| API no Fly.io GRU | ✅ | `api.thlgasdopovo.com.br` — ver [fly-migration.md](fly-migration.md) |
| CI GitHub Actions | ✅ | `.github/workflows/ci.yml` — build seletivo API/web |
| Deploy seletivo Vercel | ✅ | `scripts/vercel-should-build.sh` |
| Migration condicional | ✅ | `scripts/release-migrate.sh` / `fly-release.sh` |
| Pausar Railway | ⏳ | Após 24–48h estáveis no Fly |
| Ambiente staging | ⏳ | Branch `staging` + Neon branch |
| Upstash Redis (cache dashboard) | ⏳ | TTL 10s |
| Sentry + uptime `/health` | ⏳ | Observabilidade |
| Rotacionar senha Neon | ⏳ | Prioridade segurança |

### Sprint 3 — Refinamentos operacionais

- Badge de pendências (vendas retroativas + mobile aguardando aprovação)
- Testes E2E Playwright (login → venda → aprovação)
- Relatórios PDF/Excel além de CSV
- Expandir `AuditService` para exclusões e ações críticas
- Revalidar checklist pós-deploy (venda → estoque → resumo diário)

### Refinamentos MVP (concluídos — jun/jul/2026)

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
- [x] Fornecedores + compras (notas de entrada)
- [x] Relatórios + exportação CSV
- [x] Formas de pagamento por loja + taxas
- [x] Custo fornecedor + margem bruta
- [x] Clientes por loja + preço por cliente
- [x] Mapa de entregadores (presença GPS)
- [x] Venda pelo app entregador com aprovação na loja
- [x] Auto-refresh 15s no resumo diário e dashboard master
- [x] Pagamentos múltiplos + geocoding + sugestão de entregador por proximidade
- [x] Inativar vs excluir (usuários, lojas, clientes, entregadores)
- [x] Aba entregadores no painel master (`/master/deliverers`)
- [x] Páginas públicas privacidade e exclusão de conta (Play Store)
- [x] GPS stale + alerta quando posição do entregador para
- [x] Métricas entregador: rotas realizadas vs canceladas
- [x] Resend + domínio verificado (recuperação de senha)

### Infraestrutura (Sprint 2 — ver [roadmap.md](roadmap.md))

| Passo | Status | Descrição |
|-------|--------|-----------|
| API Fly.io GRU + `api.` | ✅ | Cutover concluído jul/2026 |
| CI GitHub Actions | ✅ | Build em PR e push |
| Pausar Railway | ⏳ | Fallback legado |
| Staging + Redis + Sentry | ⏳ | Opcional |

### Produto — Fase 2 (implementações)

| Módulo | Descrição | Prioridade |
|--------|-----------|------------|
| **Fiscal** | NFC-e/NF-e via `FiscalProvider` (stub já existe em `packages/shared`) | Alta |
| **Financeiro** | Contas a pagar/receber, fluxo de caixa | Alta |
| **Relatórios** | Exportação PDF/Excel, filtros avançados | Média |
| **App entregador** | Publicado na Google Play — `com.gaserp.entregador` | ✅ |
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
- **VPS / Fly.io** — API já está no Fly.io GRU; Railway pode ser desligado
