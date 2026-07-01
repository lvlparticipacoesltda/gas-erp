# Guia de desenvolvimento

Referência rápida para continuar o Gas ERP no monorepo — comandos, diretórios, emulador Android e builds do app entregador.

**Documentação relacionada:** [architecture.md](architecture.md) · [deployment.md](deployment.md) · [api-contracts.md](api-contracts.md) · [playstore-checklist.md](playstore-checklist.md) · [mobile-push-fcm.md](mobile-push-fcm.md) · [new-chat-prompt.md](new-chat-prompt.md) (prompt para continuar em novo chat)

---

## Estrutura do monorepo

```
gas-erp/                          ← raiz (sempre comece aqui para pnpm install)
├── apps/
│   ├── web/                      Painel Next.js (master + loja)
│   ├── api/                      API NestJS
│   └── mobile/                   App entregador (Expo SDK 56)
├── packages/
│   ├── database/                 Prisma schema + migrations + seed
│   └── shared/                   Tipos, Zod, enums, métricas, status unificado
├── patches/                      Patch pnpm (Gradle 9 / foojay no RN)
├── docs/                         Esta documentação
├── .env                          Variáveis locais (não commitar)
└── pnpm-workspace.yaml
```

### Diretórios mais usados

| Caminho | Uso |
|---------|-----|
| `/Users/zeroummobilidade/gas-erp` | Raiz — `pnpm install`, `pnpm dev`, `pnpm db:*` |
| `apps/web` | Painel web Next.js |
| `apps/api` | API NestJS |
| `apps/mobile` | App Expo entregador |
| `packages/database/prisma` | Schema e migrations |
| `packages/shared/src` | Schemas Zod e helpers compartilhados |

---

## Pré-requisitos (Mac)

| Ferramenta | Versão | Observação |
|------------|--------|------------|
| Node.js | 20+ | `node -v` |
| pnpm | 9+ | `pnpm -v` |
| Docker (opcional) | — | Postgres local via `docker compose` |
| Android Studio | recente | Emulador + SDK + JDK embutido |
| EAS CLI | — | `npm install -g eas-cli` (builds na nuvem) |

### Configurar Java e Android SDK (uma vez)

Adicione ao `~/.zshrc`:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
```

Recarregue: `source ~/.zshrc`

Teste: `java -version` e `adb version`

> **Importante:** cada terminal novo precisa dessas variáveis. Sem `JAVA_HOME`, o Gradle falha com "Unable to locate a Java Runtime".

---

## Setup inicial

```bash
cd /Users/zeroummobilidade/gas-erp

pnpm install
cp .env.example .env          # ajuste DATABASE_URL se necessário
pnpm db:generate
pnpm db:deploy                # ou pnpm db:push em dev rápido
pnpm db:seed
```

### Rodar web + API localmente

```bash
cd /Users/zeroummobilidade/gas-erp
pnpm dev
```

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |

### Credenciais demo (seed)

| Papel | E-mail | Senha |
|-------|--------|-------|
| Master | master@gas.com | admin123 |
| Gerente | gerente@gas.com | admin123 |
| Atendente | atendente@gas.com | admin123 |
| Entregador | entregador@gas.com | admin123 |

---

## Banco de dados

```bash
cd /Users/zeroummobilidade/gas-erp

pnpm db:generate    # Regenera Prisma Client após mudar schema
pnpm db:migrate     # Nova migration em dev (interativo)
pnpm db:deploy      # Aplica migrations em produção/Neon
pnpm db:seed        # Dados demo (bloqueado se NODE_ENV=production)
pnpm db:studio      # Prisma Studio
```

### Migrations aplicadas

| Migration | Descrição |
|-----------|-----------|
| `20250624000000_init` | Schema inicial |
| `20250624140000_password_reset_tokens` | Reset de senha |
| `20250624180000_user_permissions` | Permissões por tela |
| `20260625120000_deliverer_multi_store` | Entregador N:N com unidades (`DelivererStore`) |
| `20260625140000_deliverer_push_token` | Token Expo Push |
| `20260625160000_sync_deliverer_stores` | Backfill `DelivererStore` |
| `20260625180000_sale_status_portaria` | Status `PORTARIA` |
| `20260625180001_backfill_sale_status_portaria` | Backfill portaria |
| `20260625200000_gas_do_povo_benefit_and_delivery_fee` | Benefício Gás do Povo + taxa entrega |
| `20260625210000_payment_method_gdp` | Pagamento `GDP` |
| `20260626100000_sale_backdate_approval` | Data da venda + aprovação retroativa |
| `20260626130000_supplier` | Fornecedores (PJ/PF) |
| `20260626140000_purchase_invoice` | Notas de compra + entrada de estoque |
| `20260626150000_deliverer_presence` | Posição GPS e bateria no entregador (mapa) |
| `20260626180000_sale_mobile_approval` | Venda pelo app + `SaleMobileApprovalLog` |
| `20260627000000_delivery_pending_reminder` | Lembrete push de entrega pendente |
| `20260627120000_product_supplier_cost` | Custo fornecedor + `unitCost` na venda |
| `20260627140000_store_payment_methods` | Formas de pagamento por loja + taxas |
| `20260627160000_customer_product_prices` | Preço negociado por cliente/produto/loja |
| `20260627180000_customer_per_store` | Clientes vinculados a loja específica |

### Neon / Railway

- `DATABASE_URL` — pooler (uso da API em runtime)
- `DIRECT_URL` — host **sem** `-pooler` (migrations Prisma)
- Se `db:deploy` falhar com **P1002** (advisory lock), use `pnpm db:deploy:force` ou libere lock idle no Neon — ver [deployment.md](deployment.md)

---

## Painel web (`apps/web`)

```bash
cd /Users/zeroummobilidade/gas-erp
pnpm --filter @gas-erp/web dev
# ou na raiz: pnpm dev (sobe web + api)
```

Build de produção local:

```bash
pnpm --filter @gas-erp/web build
```

Tela inicial da loja: `/store/[storeId]/daily-summary` (rota `/dashboard` redireciona).

---

## API (`apps/api`)

```bash
pnpm --filter @gas-erp/api dev
pnpm --filter @gas-erp/api build
```

Produção: https://gas-erpapi-production.up.railway.app/api/v1

---

## App entregador (`apps/mobile`)

Stack: Expo SDK 56, `expo-router`, JWT em `expo-secure-store`, GPS com `expo-location` + `expo-task-manager`, push via FCM.

### Variáveis

```bash
cd /Users/zeroummobilidade/gas-erp/apps/mobile
cp .env.example .env
```

Default em `.env.example` aponta para **API de produção**. Para API local no emulador use `http://10.0.2.2:3001/api/v1`.

Push em APK exige FCM — ver [mobile-push-fcm.md](mobile-push-fcm.md).

### Modo 1 — Dev build no emulador (recomendado para debug)

**Pré-requisito:** emulador aberto no Android Studio (Device Manager → ▶).

**Primeira vez** (compila nativo ~15–20 min):

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd /Users/zeroummobilidade/gas-erp/apps/mobile
npx expo run:android
```

**Dia a dia** (sem recompilar, mais rápido):

```bash
# Terminal 1 — Metro
cd /Users/zeroummobilidade/gas-erp/apps/mobile
npx expo start --dev-client

# Se o APK já existe, só instalar de novo:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

No emulador: abra **Gás do Povo Entregador**. Pressione **`r`** no Metro para recarregar JS.

### Modo 2 — APK preview (EAS, sem Metro)

```bash
cd /Users/zeroummobilidade/gas-erp/apps/mobile

npx eas login          # uma vez
npx eas init           # uma vez (projectId no app.json)

npx eas build -p android --profile preview    # APK interno
npx eas build -p android --profile production # AAB Play Store
```

### Login no app

- Apenas usuários com papel **`DELIVERER`**
- Use `entregador@gas.com` / `admin123` (seed)
- Abas: **Entregas**, **Venda** (criar pedido), **Histórico**

### Fluxo testado (jun/2026)

1. Login entregador
2. Lista **Aguardando** / **Em rota** (`GET /deliveries/my`)
3. Clicar entrega → detalhe (endereço, itens, Maps/Waze)
4. **Iniciar rota** → API `IN_PROGRESS` → Maps → GPS
5. **Concluir entrega** → `DELIVERED`
6. **Nova venda** na aba Venda → aprovação na loja web

---

## Git — commit e deploy

```bash
cd /Users/zeroummobilidade/gas-erp

git status
git add -A                    # ou arquivos específicos
git commit -m "tipo(escopo): descrição"
git push
```

| O que mudou | O que redeploya automaticamente |
|-------------|----------------------------------|
| `apps/api`, `packages/*` | Railway (API) |
| `apps/web` | Vercel (web) |
| `packages/database` migration nova | Rodar `pnpm db:deploy` **antes** do push da API |
| `apps/mobile` | Novo `eas build` (não é automático no push) |

**Não commitar:** `.env`, `google-services.json`, `.pnpm-store/`, `apps/mobile/android/build/`, `node_modules/`

**Commitar:** `patches/` (fix Gradle 9), código fonte, `pnpm-lock.yaml`

---

## Troubleshooting mobile

Ver seção completa em versões anteriores deste doc. Principais:

- **Java Runtime** — configure `JAVA_HOME`
- **Gradle IBM_SEMERU** — patch em `patches/@react-native__gradle-plugin@0.85.3.patch`
- **Push sem token** — configure FCM ([mobile-push-fcm.md](mobile-push-fcm.md))
- **Unable to load script** — Metro parado; rode `npx expo start --dev-client`

---

## Progresso atual (jun/2026)

### Produção (web + API)

| Item | Status |
|------|--------|
| Deploy Vercel + Railway + Neon | ✅ |
| Domínio thlgasdopovo.com.br | ✅ |
| Vendas, estoque, clientes, RBAC | ✅ |
| Fornecedores + compras (notas de entrada) | ✅ |
| Relatórios (vendas, compras, estoque) + CSV | ✅ |
| Formas de pagamento + taxas + receita líquida | ✅ |
| Custo fornecedor + margem bruta | ✅ |
| Clientes por loja + preço por cliente | ✅ |
| Mapa de entregadores (presença GPS) | ✅ |
| Venda mobile com aprovação na loja | ✅ |
| Wizard de venda + Portaria + GDP | ✅ |
| Data retroativa com aprovação gerente | ✅ |
| Resumo diário De/Até + auto-refresh 15s | ✅ |
| Dashboard master consolidado | ✅ |
| Paginação server-side (20/pág) | ✅ |
| Entregador N:N unidades | ✅ |
| Push FCM (nova rota / cancelamento / lembrete) | ✅ |

### App entregador (`apps/mobile`)

| Item | Status |
|------|--------|
| Login DELIVERER + entregas + detalhe | ✅ |
| Iniciar rota / Maps / concluir | ✅ |
| GPS background + presença no mapa | ✅ |
| Push FCM + som customizado | ✅ |
| Criar venda (aba Venda) | ✅ |
| Build EAS preview (APK) | ✅ |
| Publicação Play Store (AAB) | ⏳ Ver [playstore-checklist.md](playstore-checklist.md) |

### Commits recentes (referência)

| Commit | Descrição |
|--------|-----------|
| `82fe86e` | Fix botão cancelar venda entregue |
| `43d33b9` | Clientes por loja (não mais por organização) |
| `317226e` | Preço por cliente/produto |
| `54c4e83` | Formas de pagamento + taxas + receita líquida |
| `6711585` | Custo fornecedor + margem bruta |
| `42fc24d` | Presença em background + alocação sem trava |
| `2cf01ee` | Relatório de vendas CSV |
| `7151fd5` | Paginação web + push FCM |

---

## Comandos de referência (copiar/colar)

```bash
# === RAIZ ===
cd /Users/zeroummobilidade/gas-erp
pnpm install && pnpm dev

# === BANCO ===
pnpm db:deploy && pnpm db:seed

# === MOBILE — emulador (dev) ===
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$HOME/Library/Android/sdk/platform-tools:$PATH"
cd apps/mobile
npx expo start --dev-client

# === MOBILE — APK nuvem ===
cd apps/mobile
eas build -p android --profile preview

# === MOBILE — AAB Play Store ===
eas build -p android --profile production
eas submit -p android --latest

# === ADB ===
adb devices
adb uninstall com.gaserp.entregador
adb logcat | grep -i '\[push\]'
```
