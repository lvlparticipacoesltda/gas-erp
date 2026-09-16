# Guia de desenvolvimento

Referência rápida para continuar o Gas ERP no monorepo — comandos, diretórios, emulador Android e builds do app entregador.

**Documentação relacionada:** [architecture.md](architecture.md) · [deployment.md](deployment.md) · [api-contracts.md](api-contracts.md) · [playstore-checklist.md](playstore-checklist.md) · [mobile-push-fcm.md](mobile-push-fcm.md) · [roadmap.md](roadmap.md) · [new-chat-prompt.md](new-chat-prompt.md) (prompt para continuar em novo chat)

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
| `20260701120000_deliverer_gps_stale_reminder` | Lembrete quando GPS do entregador para de atualizar |
| `20260714010000_store_address_fields` | Endereço estruturado + geo da loja |
| `20260715120000_deliverer_available_store` | Disponibilidade no mapa por unidade (`availableStoreId`) |
| `20260715150000_sale_item_payment_method` | Forma de pagamento por item da venda |
| `20260721120000_product_vasilhame_link` | Vínculo produto cheio ↔ vasilhame |
| `20260722120000_notifications` | Notification + NotificationRead |
| `20260722140000_delivery_optional_deliverer` | Entrega sem entregador alocado |
| `20260722160000_store_cnpj` | CNPJ da loja (cupom) |
| `20260722190000_sale_delivery_coordinates` | Lat/lng de entrega na venda |
| `20260722200000_work_schedules_time_clock` | Escalas + batidas de ponto |
| `20260722210000_user_hr_fields` | CPF/PIS/admissão/cargo |
| `20260723120000_store_legal_name` | Razão social da loja |
| `20260723130000_backfill_gas_do_povo_benefit` | Backfill flag GDP |
| `20260724120000_work_schedule_per_user` | Escala única por org+user+data |
| `20260724180000_customer_categories_p13_p20_p45` | Categorias de cliente |
| `20260728150000_user_sessions` | UserSession (JWT `sid`) |
| `20260729170000_work_schedule_weekly` | Horários semanais |
| `20260729180000_schedule_day_vacation` | Tipo de dia `VACATION` |
| `20260730120000_deliverer_default_store` | Unidade padrão do entregador |
| `20260730150000_trusted_devices` | TrustedDevice + pairing |
| `20260730160000_time_clock_punch_slot` | Slots ent1/sai1/ent2/sai2 |
| `20260730170000_customer_category_gas_do_povo` | Categoria Gás do Povo |
| `20260803150000_expenses` | ExpenseCategory + Expense |
| `20260804150000_expense_store_required` | `storeId` obrigatório na despesa |
| `20260806120000_vasilhame_loans` | VasilhameLoan (comodato) |
| `20260806160000_time_clock_justifications` | Atestados/justificativas de ponto |

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

Produção: https://api.thlgasdopovo.com.br/api/v1

---

## App entregador (`apps/mobile`)

Stack: Expo SDK 56, `expo-router`, JWT em `expo-secure-store`, GPS com `expo-location` + `expo-task-manager`, push via FCM.

### Variáveis

```bash
cd /Users/zeroummobilidade/gas-erp/apps/mobile
cp .env.example .env
```

Default em `.env.example` aponta para **API de produção**. Para API local no emulador use `http://10.0.2.2:3001/api/v1`.

**Mapa in-app (jul/2026):** a tab **Mapa** usa `react-native-maps` + Google Maps SDK. Configure:

```bash
# apps/mobile/.env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...   # Maps SDK for Android (tiles)
```

No servidor (Fly), para roteamento com polyline:

```bash
# .env na raiz / Fly secrets
GOOGLE_MAPS_DIRECTIONS_API_KEY=AIza...    # Directions API
```

Após adicionar `react-native-maps`, é obrigatório **novo dev build** (`npx expo run:android` ou `eas build`). O mapa não funciona no Expo Go com Google Maps.

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

No emulador: abra **THLGDP Entregador**. Pressione **`r`** no Metro para recarregar JS.

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
- Entregador: **Mapa**, **Venda**, **Histórico**, **Escala**
- Atendente: **Escala** + bater ponto (GPS 100 m + selfie)

### Fluxo testado (jul/2026 — mapa; ponto validado ago/2026)

1. Login entregador
2. Tela **Mapa** com posição GPS + botão de entregas (estilo 99)
3. Selecionar entrega aguardando → **Iniciar rota** (mapa in-app com polyline)
4. Reroteamento automático se sair do trajeto (>60 m)
5. **Concluir entrega** → pagamentos → `DELIVERED`
6. Fallback **Google Maps / Waze** disponível durante a rota

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
| `apps/api`, `packages/*`, `Dockerfile`, `fly.toml` | Fly.io (`fly deploy` ou push com hook) |
| `apps/web` | Vercel (web) |
| `packages/database` migration nova | Rodar `pnpm db:deploy` **antes** do deploy da API |
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

## Progresso atual (set/2026)

### Produção (web + API)

| Item | Status |
|------|--------|
| Deploy Vercel + Fly.io GRU + Neon | ✅ |
| 46 migrations em produção | ✅ até `time_clock_justifications` |
| Vendas, estoque, clientes, RBAC | ✅ |
| Escalas, horários, cartão de ponto, atestados | ✅ |
| Gastos por unidade + resultado por unidade | ✅ |
| Vasilhames emprestados | ✅ |
| Sessões + dispositivos confiáveis | ✅ |
| Notificações + SSE (fallback 60s) | ✅ |
| Fechamento loja/master | ✅ |
| Fornecedores, compras, relatórios CSV | ✅ |
| Categorias de cliente + export XLSX | ✅ |
| Master edita itens da venda | ✅ |

### App mobile (`apps/mobile` — THLGDP Entregador)

| Item | Status |
|------|--------|
| Tela **Mapa** + rota in-app (polyline) | ✅ |
| Login DELIVERER / ATTENDANT | ✅ |
| Venda + histórico (entregador) | ✅ |
| Escala + ponto (GPS 100 m + selfie) | ✅ |
| Push FCM + GPS background | ✅ |
| Play Store | ✅ Publicado jul/2026 |

### Commits recentes (referência)

| Commit | Descrição |
|--------|-----------|
| `6c826aa` | Export XLSX da base de clientes (master) |
| `917dfa0` | Master edita itens e valores da venda |
| `e077e59` | Atestados e justificativas de ponto |
| `14083fb` | Controle de vasilhames emprestados |
| `f427a17` | Métricas de entrega + tempo total |
| `a2787ab` | Mobile aponta para API Fly |

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

# === MOBILE — AAB Play Store (com mapa in-app) ===
# Configure antes: eas secret:create -s project -n EXPO_PUBLIC_GOOGLE_MAPS_API_KEY -v AIza...
# Fly: fly secrets set GOOGLE_MAPS_DIRECTIONS_API_KEY=AIza...
cd apps/mobile
eas build -p android --profile production
eas submit -p android --latest

# === ADB ===
adb devices
adb uninstall com.gaserp.entregador
adb logcat | grep -i '\[push\]'
```
