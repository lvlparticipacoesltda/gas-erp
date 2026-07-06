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
- packages/database — Prisma schema + migrations (21 migrations até jul/2026)

## Produção
- Web: https://thlgasdopovo.com.br (Vercel)
- API: https://api.thlgasdopovo.com.br/api/v1 (Fly.io GRU, São Paulo)
- Banco: Neon PostgreSQL (sa-east-1) — DATABASE_URL (pooler) + DIRECT_URL (migrations)
- Cliente piloto: Rede Gás Litoral / THL Gás do Povo
- Latência (jul/2026): health ~59 ms · login ~171 ms · dashboard master ~71 ms

## Estado atual (jul/2026)

### Web + API (produção)
- Vendas: wizard 3 passos, CEP, Portaria, GDP, taxa entrega, data retroativa, preço por cliente, pagamentos múltiplos
- Venda mobile: entregador cria no app → aprovação na loja (mobileApproval)
- Fornecedores + compras (notas de entrada de estoque)
- Relatórios: vendas, compras, estoque + exportação CSV
- Formas de pagamento por loja + taxas + receita líquida no resumo
- Custo fornecedor + margem bruta (produtos, resumo, relatório)
- Clientes por loja + preço por cliente
- Mapa de entregadores: presença GPS, disponibilidade, geocoding, sugestão por proximidade
- Resumo diário: filtro De/Até, auto-refresh 15s, métricas por entregador (até aceitar / em rota / total)
- Painéis e relatórios contabilizam vendas efetivadas (DELIVERED/PORTARIA)
- Master: dashboard consolidado, aba Entregadores (/master/deliverers)
- Inativar vs excluir: usuários, lojas, clientes, entregadores
- Paginação server-side (20/pág) nas listas principais
- RBAC com telas: daily-summary, sales, customers, products, suppliers, purchases, stock, deliverers, deliverers.map, reports
- Recuperação de senha (Resend)
- Páginas públicas: /privacidade-entregador, /exclusao-conta-entregador

### App mobile (apps/mobile) — "Gás do Povo Entregador"
- Login DELIVERER, entregas (aguardando/em rota), detalhe, Maps/Waze, histórico
- Aba Venda: criar pedido com múltiplas formas de pagamento → aprovação na loja
- GPS background + presença no mapa + alerta GPS stale
- Push FCM: nova rota, cancelamento, lembrete pendente; som rota_entrega.wav
- **Publicado na Google Play** (jul/2026)
- EAS: @lvlparticipacoesltda1/gas-entregador, projectId 165eab5a-801a-45a3-ae81-e0a6ef28e7f3
- google-services.json via EAS secret (não commitado)

### Migrations recentes
- 20260701120000_deliverer_gps_stale_reminder
- 20260627180000_customer_per_store
- 20260627160000_customer_product_prices
- 20260627140000_store_payment_methods
- 20260627120000_product_supplier_cost

### Próximo foco (roadmap)
- Sprint 1 (restante): redirect `www`
- Sprint 2 (restante): pausar Railway, staging, Redis, Sentry, rotacionar senha Neon
- Sprint 3: badges pendências, E2E, relatórios PDF/Excel
- Fase 2: fiscal, financeiro completo
Ver docs/roadmap.md

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
- docs/roadmap.md — sprints e fases
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
- Migration nova em produção: pnpm db:deploy (com DIRECT_URL no Fly)
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
- Último commit relevante: `f427a17` — métricas de entrega renomeadas + tempo total; `4bbf3dd` — vendas efetivadas em painéis.
- Para tarefas só no mobile, peça para ler `apps/mobile/app/` e `apps/mobile/src/lib/`.
- Para API/web, peça para ler o módulo específico em `apps/api/src/modules/` ou `apps/web/src/app/`.
- Para vendas retroativas: `packages/shared/src/sale-backdate.ts`
- Para vendas mobile: `packages/shared/src/sale-mobile.ts` + `sales.service.ts`
- Para entregadores: `apps/web/src/components/deliverers/deliverers-panel.tsx`
