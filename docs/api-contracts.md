# API Contracts

Schemas Zod em `packages/shared/src/schemas/`.

## Auth
- `POST /auth/login` — `{ email, password }`
- `GET /auth/me` — usuário autenticado
- `PATCH /auth/me` — `{ name?, email?, phone? }` — atualizar próprio perfil
- `POST /auth/change-password` — `{ currentPassword, newPassword }`
- `POST /auth/forgot-password` — `{ email }` — envia link por e-mail (Resend)
- `POST /auth/reset-password` — `{ token, newPassword }`

## Deliveries (mobile prep)
- `GET /deliveries/my` — entregas do entregador logado
- `POST /deliveries/:id/tracking` — `{ latitude, longitude, accuracy? }`
- `GET /deliveries/:id/tracking` — histórico GPS
- `PATCH /deliveries/:id/status` — `{ status: IN_PROGRESS | DELIVERED | CANCELLED }`

## Sales
- `POST /sales` — criar venda confirmada com itens e pagamentos
- `PATCH /sales/:id/status` — atualizar status

Ver controllers em `apps/api/src/modules/` para lista completa.
