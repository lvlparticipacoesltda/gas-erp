# Arquitetura

Ver plano completo em `.cursor/plans/`. Resumo:

- **Organization** = tenant (SaaS-ready)
- **Store** = unidade física
- **User** + **UserStore** = RBAC por loja
- **StockBalance** por loja; **StockTransfer** entre lojas
- **Sale** → baixa estoque; cancelamento repõe
- **Delivery** + **DeliveryTrackingPoint** para GPS (fase mobile)

## API

Base URL: `/api/v1`

Principais recursos: `auth`, `stores`, `users`, `customers`, `products`, `stock`, `stock-transfers`, `sales`, `deliverers`, `deliveries`, `dashboard`.

## Produção

Para deploy do MVP (Neon + Railway + Vercel) e evolução da infraestrutura, veja [deployment.md](deployment.md).
