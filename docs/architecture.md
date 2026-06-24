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

Principais recursos: `auth`, `health`, `stores`, `users`, `customers`, `products`, `stock`, `stock-transfers`, `sales`, `deliverers`, `deliveries`, `dashboard`.

### Produção

| | |
|---|---|
| Base | `https://gas-erpapi-production.up.railway.app/api/v1` |
| Health | `GET /health` (público, sem auth) |

Para deploy, DNS, CORS e roadmap, veja [deployment.md](deployment.md).
