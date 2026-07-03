# Migração da API — Railway → Fly.io (GRU)

Colocar a API em **São Paulo** (Fly.io `gru`), ao lado do Neon **sa-east-1**, para reduzir latência B (requests de ~1–3s para metas de <200ms–1,5s).

**Relacionado:** [infrastructure-plan.md](infrastructure-plan.md) · [deployment.md](deployment.md)

---

## O que muda

| Antes | Depois |
|-------|--------|
| API no Railway (provavelmente EUA) | API no Fly.io **GRU** (São Paulo) |
| `*.up.railway.app` | `gas-erp-api.fly.dev` + opcional `api.thlgasdopovo.com.br` |
| Web na Vercel | **Sem mudança** |
| Neon PostgreSQL | **Sem mudança** |

Arquivos no repositório:

| Arquivo | Função |
|---------|--------|
| `Dockerfile` | Build monorepo (turbo prune + NestJS) |
| `fly.toml` | Região GRU, health check, 1 máquina sempre ligada |
| `scripts/fly-deploy.sh` | Atalho `fly deploy` |
| `scripts/release-migrate.sh` | Migration condicional (Railway + Fly) |

---

## Pré-requisitos

1. Conta [Fly.io](https://fly.io) (cartão para app always-on ~US$ 5–7/mês)
2. `flyctl` instalado:

```bash
curl -L https://fly.io/install.sh | sh
# ou: brew install flyctl
```

3. Login:

```bash
fly auth login
```

4. Variáveis atuais do **Railway** anotadas (copiar do painel Railway → Variables)

---

## Passo 1 — Criar app Fly (primeira vez)

Na raiz do monorepo:

```bash
cd /Users/zeroummobilidade/gas-erp

# Usa fly.toml existente; não faz deploy ainda
fly launch --copy-config --no-deploy
```

- Confirme **region: gru** (São Paulo)
- Se perguntar nome do app, `gas-erp-api` (ou ajuste `app` em `fly.toml`)
- **Não** crie Postgres no Fly — usamos Neon

---

## Passo 2 — Secrets (mesmas do Railway)

```bash
fly secrets set \
  DATABASE_URL='postgresql://...@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&connection_limit=10&pool_timeout=20' \
  DIRECT_URL='postgresql://...@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require' \
  JWT_SECRET='...' \
  JWT_EXPIRES_IN='7d' \
  WEB_URL='https://thlgasdopovo.com.br' \
  RESEND_API_KEY='re_...' \
  EMAIL_FROM='Gas ERP <noreply@thlgasdopovo.com.br>'
```

> Use os **mesmos valores** do Railway. `WEB_URL` sem aspas e sem `/` no final.

Opcional (observabilidade):

```bash
fly secrets set SLOW_REQUEST_MS=1000
```

---

## Passo 3 — Primeiro deploy

```bash
bash scripts/fly-deploy.sh
# ou: fly deploy
```

O Fly roda `release_command` → `scripts/fly-release.sh` → migrations se pendentes.

Acompanhe:

```bash
fly logs
fly status
```

Teste:

```bash
curl -s "https://gas-erp-api.fly.dev/api/v1/health"
# {"status":"ok","database":"ok",...}
```

Benchmark:

```bash
API_BASE=https://gas-erp-api.fly.dev/api/v1 pnpm benchmark:api
```

Compare com Railway. Expectativa: `/health` **< 300 ms**, `/dashboard/master` **< 1,5 s**.

---

## Passo 4 — Domínio customizado (recomendado)

### 4.1 Certificado Fly

```bash
fly certs add api.thlgasdopovo.com.br
```

Anote os registros DNS que o Fly mostrar (CNAME ou A/AAAA).

### 4.2 DNS (Hostinger)

| Tipo | Nome | Valor |
|------|------|-------|
| CNAME | `api` | valor indicado pelo `fly certs add` |

Aguarde propagação (~5–30 min):

```bash
fly certs show api.thlgasdopovo.com.br
```

### 4.3 Atualizar Vercel

**Environment Variables** → produção:

```
NEXT_PUBLIC_API_URL=https://api.thlgasdopovo.com.br/api/v1
```

**Redeploy** na Vercel (variável `NEXT_PUBLIC_*` exige rebuild).

### 4.4 Validar CORS

`WEB_URL` no Fly deve incluir `https://thlgasdopovo.com.br`. Se usar `www`:

```bash
fly secrets set WEB_URL='https://thlgasdopovo.com.br,https://www.thlgasdopovo.com.br'
```

---

## Passo 5 — Cutover (trocar tráfego)

Ordem segura:

1. Fly respondendo OK em `gas-erp-api.fly.dev`
2. Domínio `api.` apontando para Fly e certificado válido
3. Vercel com `NEXT_PUBLIC_API_URL` novo + redeploy
4. Testar login, venda, dashboard, app entregador (usa mesma URL da API)
5. Benchmark final: `API_BASE=https://api.thlgasdopovo.com.br/api/v1 pnpm benchmark:api`
6. **Manter Railway 24–48h** como fallback
7. Desligar serviço Railway quando estável

### App mobile

Se o APK usa URL fixa de produção, verifique `apps/mobile/.env` / `EXPO_PUBLIC_API_URL`. Com domínio `api.thlgasdopovo.com.br`, **não precisa** novo build se já apontava para esse host. Se ainda usa `*.railway.app`, gere novo build EAS após cutover.

---

## Passo 6 — Desativar Railway (opcional)

1. Railway → serviço API → Settings → remover deploy automático ou pausar
2. Manter variáveis anotadas em local seguro
3. Atualizar docs/README com URL final

---

## Comandos do dia a dia

```bash
fly deploy                    # novo deploy (push + fly deploy, ou CI futuro)
fly logs                      # logs ao vivo
fly status                    # máquinas e health
fly ssh console               # shell na VM
fly secrets list              # nomes das secrets (não valores)
pnpm benchmark:api            # latência (defina API_BASE)
```

Atalho:

```bash
bash scripts/fly-deploy.sh
```

---

## Configuração importante (latência)

No `fly.toml` já configurado:

- `primary_region = 'gru'` — São Paulo
- `min_machines_running = 1` — evita cold start (~1s no /health)
- `auto_stop_machines = 'off'` — máquina sempre ligada

Se precisar reduzir custo em ambiente de teste, pode ligar `auto_stop_machines` — latência do primeiro request aumenta.

---

## Troubleshooting

### Deploy falha no release_command (migration)

```bash
fly logs --release
```

Confirme `DATABASE_URL` (pooler) e `DIRECT_URL` (sem pooler) iguais ao Railway.

### Health 502 / app não sobe

```bash
fly logs
```

Verifique `PORT=8080` e se `node apps/api/dist/main.js` iniciou.

### CORS no browser

- `WEB_URL` no Fly = URL exata do front
- Redeploy Fly após alterar secret

### Build Docker lento

Normal na 1ª vez (~5–8 min). Fly usa cache de layers nas próximas.

### Comparar com Railway

```bash
API_BASE=https://gas-erpapi-production.up.railway.app/api/v1 pnpm benchmark:api
API_BASE=https://gas-erp-api.fly.dev/api/v1 pnpm benchmark:api
```

---

## Rollback

Se algo der errado após cutover na Vercel:

1. Reverter `NEXT_PUBLIC_API_URL` para URL Railway
2. Redeploy Vercel
3. Railway ainda deve estar no ar se não desligou

---

## CI (futuro)

Deploy Fly pode ser automatizado com `fly deploy --remote-only` no GitHub Actions usando `FLY_API_TOKEN`. Por ora, deploy manual após merge em `main`.
