# Prompt para novo chat (continuar desenvolvimento)

Copie o bloco abaixo e cole no início de um novo chat no Cursor. Substitua a seção **Próxima tarefa** pelo que você quiser fazer.

---

```
Estou continuando o Gas ERP — monorepo em /Users/zeroummobilidade/gas-erp (pnpm + Turborepo).

## Stack
- apps/web — Next.js 15 (painel master + loja)
- apps/api — NestJS + Prisma (REST /api/v1)
- apps/mobile — Expo SDK 56 + expo-router (app entregador Android)
- packages/shared — tipos, Zod, enums, sale-display, delivery-metrics, business-day, sale-backdate
- packages/database — Prisma schema + migrations (11 migrations até jun/2026)

## Produção
- Web: https://thlgasdopovo.com.br (Vercel)
- API: https://gas-erpapi-production.up.railway.app/api/v1 (Railway)
- Banco: Neon PostgreSQL (sa-east-1) — DATABASE_URL (pooler) + DIRECT_URL (migrations)
- Cliente piloto: Rede Gás Litoral / THL Gás do Povo

## Estado atual (jun/2026)

### Web + API (produção)
- Vendas: wizard 3 passos, CEP automático, cadastro rápido cliente, canal Portaria, benefício Gás do Povo (GDP), taxa entrega
- Data retroativa: atendente lança dia anterior → PENDING; gerente aprova/rejeita; log SaleBackdateLog; dashboard usa saleDate
- Resumo diário: filtro De/Até, loading overlay, métricas por entregador, entregas lentas
- Master: dashboard com cards por unidade + resumo consolidado de todas as lojas
- Paginação server-side (20/pág): vendas, clientes, produtos, estoque, usuários master
- Sidebar entregas + status unificado (getSaleDisplayStatus)
- Métricas espera/rota (delivery-metrics.ts); IN_PROGRESS só pelo entregador (loja 403)
- Entregador N:N unidades (DelivererStore); push Expo (nova entrega / cancelamento)
- RBAC, multi-loja por usuário, recuperação de senha (Resend)

### App mobile (apps/mobile)
- Login DELIVERER, listas Aguardando/Em rota, detalhe, Maps/Waze, histórico
- Iniciar rota → API IN_PROGRESS → Maps → GPS opcional em background
- Push: nova entrega e cancelamento (expo-notifications)
- Branding: nome da organização no header
- DeliveriesProvider no app/_layout.tsx; GPS seguro com permissão "o tempo todo"
- EAS: @lvlparticipacoesltda1/gas-entregador, projectId 165eab5a-801a-45a3-ae81-e0a6ef28e7f3
- Perfis: preview (APK), production (AAB)

### Migrations recentes
- 20260625210000_payment_method_gdp
- 20260626100000_sale_backdate_approval (saleDate, backdateApproval, SaleBackdateLog)

### Dev local Android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd apps/mobile && npx expo run:android        # primeira vez
npx expo start --dev-client                  # Metro (obrigatório no dev build)
adb uninstall com.gaserp.entregador          # conflito de assinatura APK

### Credenciais demo
entregador@gas.com / admin123 (DELIVERER)
master@gas.com / admin123 (ORG_MASTER)
gerente@gas.com / admin123 (STORE_MANAGER)
atendente@gas.com / admin123 (ATTENDANT)

## Documentação (leia antes de alterar)
- docs/development.md — comandos, emulador, EAS, troubleshooting, progresso
- docs/deployment.md — infra, variáveis, DIRECT_URL, deploy
- docs/architecture.md — modelo de dados, dia operacional, data retroativa
- docs/api-contracts.md — endpoints REST
- docs/rbac.md — papéis e canManageSales
- docs/playstore-checklist.md — publicação Android
- docs/privacy-policy.md — texto para Play Store

## Convenções
- Não usar .npmrc hoisted (quebra Next.js)
- Não commitar .env, apps/mobile/android/build/, .pnpm-store/
- Commits só quando eu pedir; quando pedir, mande git add/commit/push completos
- Migration nova em produção: pnpm db:deploy (com DIRECT_URL no Railway)
- Mobile em produção: novo eas build (não é automático no git push)
- Dia operacional: America/Sao_Paulo (packages/shared/src/business-day.ts)

## Próxima tarefa
[DESCREVA AQUI — ex.: "badge de pendências de data retroativa no menu", "publicar AAB na Play Store", "módulo fiscal", "corrigir bug X"]

## Contexto extra (opcional)
[Cole erros de log, screenshots, ou decisões da conversa anterior]
```

---

## Dicas

- Se o chat anterior tinha mudanças **não commitadas**, rode `git status` e mencione os arquivos pendentes no prompt.
- Último commit relevante: `5edbe93` — data retroativa com aprovação de gerente.
- Para tarefas só no mobile, peça para ler `apps/mobile/app/` e `apps/mobile/src/lib/`.
- Para API/web, peça para ler o módulo específico em `apps/api/src/modules/` ou `apps/web/src/app/`.
- Para vendas retroativas: `packages/shared/src/sale-backdate.ts` + `apps/api/src/modules/sales/sales.service.ts`.
