# Prompt para novo chat (continuar desenvolvimento)

Copie o bloco abaixo e cole no início de um novo chat no Cursor. Substitua a seção **Próxima tarefa** pelo que você quiser fazer.

---

```
Estou continuando o Gas ERP — monorepo em /Users/zeroummobilidade/gas-erp (pnpm + Turborepo).

## Stack
- apps/web — Next.js 15 (painel master + loja)
- apps/api — NestJS + Prisma (REST /api/v1 + SSE /realtime)
- apps/mobile — Expo SDK 56 + expo-router (Android: entregador + ponto do atendente)
- packages/shared — tipos, Zod, enums, permissions, sale-*, delivery-metrics, business-day, expense-financials, time-clock-totals, gas-do-povo
- packages/database — Prisma schema + 46 migrations (até 20260806160000_time_clock_justifications)

## Produção
- Web: https://thlgasdopovo.com.br (Vercel)
- API: https://api.thlgasdopovo.com.br/api/v1 (Fly.io GRU, São Paulo)
- Banco: Neon PostgreSQL (sa-east-1) — DATABASE_URL (pooler) + DIRECT_URL (migrations)
- Cliente piloto: Rede Gás Litoral / THL Gás do Povo
- Latência (jul/2026, ainda válida): health ~59 ms · login ~171 ms · dashboard master ~71 ms

## Estado atual (set/2026)

### Web + API (produção)
- Vendas: wizard, CEP, Portaria, GDP, taxa entrega, data retroativa, preço por cliente, pagamentos múltiplos, cupom/recibo
- Master edita itens/valores de venda (`PATCH /sales/:id/items`, `canEditSaleItems`)
- Venda mobile: entregador cria → aprovação na loja (`mobileApproval`)
- Fornecedores + compras (entrada de estoque; trava cheio vs vasilhame vinculado)
- Relatórios: vendas, compras, estoque + CSV; master agrega unidades
- Formas de pagamento + taxas + receita líquida; custo fornecedor + margem
- Clientes por loja + categorias (P13/P20/P45/Gás do Povo) + preço negociado + export XLSX (master)
- Vasilhames emprestados (comodato; não movimenta estoque)
- Gastos da empresa por unidade (`storeId` obrigatório) + resultado por unidade (`GET /results/by-store`)
- Fechamento (loja + consolidado master)
- Escalas diárias, horários semanais, cartão de ponto, atestados/justificativas
- Mapa de entregadores, geocoding, sugestão por proximidade
- Resumo diário De/Até + SSE (`/realtime/store` e `/realtime/org`; fallback polling 60s)
- Notificações master (PORTARIA / cancelamento) com estado de leitura
- Sessões JWT (`UserSession`) + revogar + logout; dispositivos confiáveis (pairing)
- Inativar vs excluir; paginação server-side 20/pág
- RBAC telas: daily-summary, sales, sales.new, customers, vasilhame-loans, products, suppliers, purchases, stock, stock.transfers, deliverers, deliverers.map, schedules, schedules.horarios, time-clock, reports
- Páginas públicas: /privacidade-entregador, /exclusao-conta-entregador

### App mobile (apps/mobile) — "THLGDP Entregador"
- Login DELIVERER ou ATTENDANT
- Entregador: Mapa (react-native-maps + Directions), entregas, venda, histórico, GPS background, push FCM
- Atendente: aba Escala + bater ponto (slots ent1/sai1/ent2/sai2, raio 100 m, selfie)
- Publicado na Google Play (`com.gaserp.entregador`)
- EAS: @lvlparticipacoesltda1/gas-entregador, projectId 165eab5a-801a-45a3-ae81-e0a6ef28e7f3
- google-services.json via EAS secret (não commitado)

### Migrations recentes (após jul/2026)
- 20260722200000_work_schedules_time_clock (+ weeklies, vacation, punch slot, HR fields)
- 20260722120000_notifications
- 20260728150000_user_sessions
- 20260730150000_trusted_devices
- 20260803150000_expenses + 20260804150000_expense_store_required
- 20260806120000_vasilhame_loans
- 20260806160000_time_clock_justifications
Lista completa: docs/development.md

### Próximo foco (roadmap)
- Sprint 1 restante: redirect `www` (opcional)
- Sprint 2 restante: pausar Railway, staging, Redis, Sentry, rotacionar senha Neon
- Sprint 3: badges pendências, E2E, relatórios PDF/Excel
- Fase 2: fiscal, contas a pagar/receber, fluxo de caixa
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
- docs/development.md — comandos, emulador, EAS, migrations
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
- JSON da API aceita até 8mb (foto de ponto em base64)

## Próxima tarefa
[DESCREVA AQUI]

## Contexto extra (opcional)
[Cole erros de log, screenshots, ou decisões da conversa anterior]
```

---

## Dicas

- Se o chat anterior tinha mudanças **não commitadas**, rode `git status` e mencione os arquivos pendentes no prompt.
- Commits recentes de referência: `6c826aa` (export XLSX clientes); `917dfa0` (master edita itens da venda); `14083fb` (vasilhames); `e077e59` (atestados de ponto).
- Para tarefas só no mobile, peça para ler `apps/mobile/app/` e `apps/mobile/src/lib/`.
- Para API/web, peça para ler o módulo em `apps/api/src/modules/` ou `apps/web/src/app/`.
- Escalas/ponto: `apps/api/src/modules/schedules/` + `packages/shared/src/schemas/schedule.ts`
- Gastos/resultado: `expenses/` e `results/` na API; `expense-financials.ts` no shared
- Vasilhames: `packages/shared/src/schemas/vasilhame-loan.ts`
- Vendas retroativas: `packages/shared/src/sale-backdate.ts`
- Vendas mobile: `packages/shared/src/sale-mobile.ts` + `sales.service.ts`
- Entregadores: `apps/web/src/components/deliverers/deliverers-panel.tsx`
- Nav: `apps/web/src/lib/master-nav.ts` e `store-nav.ts`
