# Prompt para novo chat (continuar desenvolvimento)

Copie o bloco abaixo e cole no início de um novo chat no Cursor. Substitua a seção **Próxima tarefa** pelo que você quiser fazer.

---

```
Estou continuando o Gas ERP — monorepo em /Users/zeroummobilidade/gas-erp (pnpm + Turborepo).

## Stack
- apps/web — Next.js 15 (painel master + loja)
- apps/api — NestJS + Prisma (REST /api/v1)
- apps/mobile — Expo SDK 56 + expo-router (app entregador Android)
- packages/shared — tipos, Zod, enums, sale-display, delivery-metrics, business-day, sale-backdate, sale-mobile
- packages/database — Prisma schema + migrations (20 migrations até jun/2026)

## Produção
- Web: https://thlgasdopovo.com.br (Vercel)
- API: https://gas-erpapi-production.up.railway.app/api/v1 (Railway)
- Banco: Neon PostgreSQL (sa-east-1) — DATABASE_URL (pooler) + DIRECT_URL (migrations)
- Cliente piloto: Rede Gás Litoral / THL Gás do Povo

## Estado atual (jun/2026)

### Web + API (produção)
- Vendas: wizard 3 passos, CEP, Portaria, GDP, taxa entrega, data retroativa, preço por cliente
- Venda mobile: entregador cria no app → aprovação na loja (mobileApproval)
- Fornecedores + compras (notas de entrada de estoque)
- Relatórios: vendas, compras, estoque + exportação CSV
- Formas de pagamento por loja + taxas + receita líquida no resumo
- Custo fornecedor + margem bruta (produtos, resumo, relatório)
- Clientes por loja (não mais por organização inteira)
- Mapa de entregadores: presença GPS, disponibilidade, auto-refresh 15s
- Resumo diário: filtro De/Até, auto-refresh 15s, métricas por entregador
- Master: dashboard consolidado de todas as lojas
- Paginação server-side (20/pág) nas listas principais
- RBAC com telas: daily-summary, sales, customers, products, suppliers, purchases, stock, deliverers, deliverers.map, reports
- Recuperação de senha (Resend)

### App mobile (apps/mobile) — "Gás do Povo Entregador"
- Login DELIVERER, entregas (aguardando/em rota), detalhe, Maps/Waze, histórico
- Aba Venda: criar pedido → aprovação na loja
- GPS background + presença no mapa (POST /deliverers/me/position)
- Push FCM: nova rota, cancelamento, lembrete pendente; som rota_entrega.wav
- EAS: @lvlparticipacoesltda1/gas-entregador, projectId 165eab5a-801a-45a3-ae81-e0a6ef28e7f3
- google-services.json via EAS secret (não commitado)

### Migrations recentes
- 20260627180000_customer_per_store
- 20260627160000_customer_product_prices
- 20260627140000_store_payment_methods
- 20260627120000_product_supplier_cost
- 20260626180000_sale_mobile_approval
- 20260626150000_deliverer_presence

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
- docs/development.md — comandos, emulador, EAS, troubleshooting
- docs/deployment.md — infra, variáveis, DIRECT_URL, deploy
- docs/architecture.md — modelo de dados, módulos
- docs/api-contracts.md — endpoints REST
- docs/rbac.md — papéis e permissões
- docs/mobile-push-fcm.md — FCM para push em APK
- docs/playstore-checklist.md — publicação Android
- docs/privacy-policy.md — texto para Play Store

## Convenções
- Não usar .npmrc hoisted (quebra Next.js)
- Não commitar .env, google-services.json, .pnpm-store/, apps/mobile/android/build/
- Commits só quando eu pedir
- Migration nova em produção: pnpm db:deploy (com DIRECT_URL no Railway)
- Mobile em produção: novo eas build (não é automático no git push)
- Dia operacional: America/Sao_Paulo, offset UTC-3 fixo (business-day.ts)

## Próxima tarefa
[DESCREVA AQUI]

## Contexto extra (opcional)
[Cole erros de log, screenshots, ou decisões da conversa anterior]
```

---

## Dicas

- Se o chat anterior tinha mudanças **não commitadas**, rode `git status` e mencione os arquivos pendentes no prompt.
- Último commit relevante: `82fe86e` — fix cancelamento de venda entregue.
- Para tarefas só no mobile, peça para ler `apps/mobile/app/` e `apps/mobile/src/lib/`.
- Para API/web, peça para ler o módulo específico em `apps/api/src/modules/` ou `apps/web/src/app/`.
- Para vendas retroativas: `packages/shared/src/sale-backdate.ts`
- Para vendas mobile: `packages/shared/src/sale-mobile.ts` + `sales.service.ts`
