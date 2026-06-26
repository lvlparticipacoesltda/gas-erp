# Guia de desenvolvimento

Referência rápida para continuar o Gas ERP no monorepo — comandos, diretórios, emulador Android e builds do app entregador.

**Documentação relacionada:** [architecture.md](architecture.md) · [deployment.md](deployment.md) · [api-contracts.md](api-contracts.md) · [playstore-checklist.md](playstore-checklist.md) · [new-chat-prompt.md](new-chat-prompt.md) (prompt para continuar em novo chat)

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

---

## API (`apps/api`)

```bash
pnpm --filter @gas-erp/api dev
pnpm --filter @gas-erp/api build
```

Produção: https://gas-erpapi-production.up.railway.app/api/v1

---

## App entregador (`apps/mobile`)

Stack: Expo SDK 56, `expo-router`, JWT em `expo-secure-store`, GPS com `expo-location` + `expo-task-manager`.

### Variáveis

```bash
cd /Users/zeroummobilidade/gas-erp/apps/mobile
cp .env.example .env
```

Default em `.env.example` aponta para **API de produção**. Para API local no emulador use `http://10.0.2.2:3001/api/v1` (alias do host no emulador Android).

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

No emulador: abra **Gas Entregador**. Pressione **`r`** no Metro para recarregar JS.

> **Dev build precisa do Metro rodando.** Erro "Unable to load script" = Metro parado ou emulador sem rede com o Mac. Solução: `npx expo start --dev-client` + RELOAD.

### Modo 2 — APK preview (EAS, sem Metro)

Para testar no celular dos entregadores ou validar GPS sem depender do Mac:

```bash
cd /Users/zeroummobilidade/gas-erp/apps/mobile

npx eas login          # uma vez
npx eas init           # uma vez (projectId no app.json)

npx eas build -p android --profile preview    # APK interno
npx eas build -p android --profile production # AAB Play Store
```

Após o build, baixe o APK pelo link do [expo.dev](https://expo.dev). Instale com:

```bash
adb install -r ~/Downloads/seu-apk.apk
```

Se der `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, desinstale o app anterior (assinaturas diferentes):

```bash
adb uninstall com.gaserp.entregador
```

### Login no app

- Apenas usuários com papel **`DELIVERER`**
- Use `entregador@gas.com` / `admin123` (seed) ou entregador cadastrado no painel
- O nome da **organização** aparece no topo após login

### Fluxo testado (jun/2026)

1. Login entregador
2. Lista **Aguardando** / **Em rota** (`GET /deliveries/my`)
3. Clicar entrega → tela de detalhe (endereço, itens, Maps/Waze)
4. **Iniciar rota** → API `IN_PROGRESS` → abre Google Maps → GPS opcional
5. **Concluir entrega** → `DELIVERED`

Criar entrega de teste: painel web → nova venda com entrega + entregador atribuído.

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

**Não commitar:** `.env`, `.pnpm-store/`, `apps/mobile/android/build/`, `node_modules/`

**Commitar:** `patches/` (fix Gradle 9), código fonte, `pnpm-lock.yaml`

---

## Troubleshooting mobile

### "Unable to locate a Java Runtime"

Configure `JAVA_HOME` (seção pré-requisitos) no terminal atual ou no `~/.zshrc`.

### Gradle: `IBM_SEMERU` / `JvmVendorSpec`

Incompatibilidade Gradle 9 + plugin antigo do React Native. O repo já inclui patch em `patches/@react-native__gradle-plugin@0.85.3.patch`. Rode `pnpm install` na raiz.

### Metro: `Cannot find module 'babel-preset-expo'`

`babel-preset-expo` deve estar em `apps/mobile/package.json` (dependência direta). Já corrigido no repo.

### EAS bundle: `@gas-erp/shared` dist não encontrado

O pacote shared expõe `"react-native": "./src/index.ts"` para o Metro usar source direto no build EAS. Hook `eas-build-post-install` compila shared como fallback.

### "Unable to load script" (tela vermelha)

Dev build sem Metro. Rode `npx expo start --dev-client` e RELOAD. Ou use APK `preview` do EAS.

### App crasha ao "Iniciar rota"

Corrigido: GPS em background só ativa com permissão "o tempo todo"; rota na API antes do GPS; limpeza de tracking órfão na abertura. Rebuild dev ou novo APK EAS.

### Conflito de assinatura ao instalar

```bash
adb uninstall com.gaserp.entregador
```

### Ver logs no emulador

```bash
adb logcat ReactNativeJS:V AndroidRuntime:E *:S
```

---

## Progresso atual (jun/2026)

### Produção (web + API)

| Item | Status |
|------|--------|
| Deploy Vercel + Railway + Neon | ✅ |
| Domínio thlgasdopovo.com.br | ✅ |
| Vendas, estoque, clientes, RBAC | ✅ |
| Wizard de venda + sidebar entregas | ✅ |
| Status unificado venda/entrega | ✅ |
| Métrica tempo até rota (dashboard) | ✅ |
| Entregador N:N unidades (`DelivererStore`) | ✅ migration pendente em prod se não rodou `db:deploy` |

### App entregador (`apps/mobile`)

| Item | Status |
|------|--------|
| Login DELIVERER + listas + detalhe | ✅ Testado emulador |
| Iniciar rota / Maps / concluir | ✅ Testado emulador |
| GPS background (com permissão "sempre") | ✅ Implementado; testar em dispositivo real |
| Branding por organização no header | ✅ |
| Divulgação destacada GPS (Play Store) | ✅ |
| Build EAS preview (APK) | ✅ Funcionando |
| Build dev local (`expo run:android`) | ✅ Funcionando |
| Publicação Play Store (AAB) | ⏳ Ver [playstore-checklist.md](playstore-checklist.md) |
| Push notifications | ⏳ Fase 2 |

### Próximos passos sugeridos

1. Rodar `pnpm db:deploy` em produção se migration `deliverer_multi_store` ainda não aplicada
2. Gerar APK preview atualizado (`eas build --profile preview`) para entregadores
3. Testar fluxo completo web → app em dispositivo físico
4. Política de privacidade pública + formulário Play Store ([privacy-policy.md](privacy-policy.md))
5. CI/CD (GitHub Actions), staging, módulo fiscal

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
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb logcat ReactNativeJS:V AndroidRuntime:E *:S
```
