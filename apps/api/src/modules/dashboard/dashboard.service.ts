import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@gas-erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
import { PAYMENT_METHOD_LABELS } from '@gas-erp/shared';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async masterOverview(user: AuthUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId, active: true },
    });

    const storeStats = await Promise.all(
      stores.map(async (store) => {
        const [salesToday, activeDeliveries, lowStock] = await Promise.all([
          this.prisma.sale.aggregate({
            where: {
              storeId: store.id,
              createdAt: { gte: today, lt: tomorrow },
              status: { not: SaleStatus.CANCELLED },
            },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.delivery.count({
            where: {
              sale: { storeId: store.id },
              status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
          }),
          this.prisma.stockBalance.count({
            where: { storeId: store.id, available: { lte: 10 } },
          }),
        ]);
        return {
          store,
          salesCount: salesToday._count,
          salesTotal: salesToday._sum.total ?? 0,
          activeDeliveries,
          lowStockItems: lowStock,
        };
      }),
    );

    return { stores: storeStats };
  }

  async storeDashboard(user: AuthUser, storeId: string, date?: string) {
    assertStoreAccess(user, storeId);
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const sales = await this.prisma.sale.findMany({
      where: {
        storeId,
        createdAt: { gte: day, lt: nextDay },
        status: { not: SaleStatus.CANCELLED },
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    const paymentsByMethod: Record<string, number> = {};
    let revenue = 0;
    const productsSold: Record<string, { name: string; qty: number; total: number }> = {};

    for (const sale of sales) {
      revenue += Number(sale.total);
      for (const payment of sale.payments) {
        const label = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
        paymentsByMethod[label] = (paymentsByMethod[label] ?? 0) + Number(payment.amount);
      }
      for (const item of sale.items) {
        const key = item.productId;
        if (!productsSold[key]) {
          productsSold[key] = { name: item.product.name, qty: 0, total: 0 };
        }
        productsSold[key].qty += item.quantity;
        productsSold[key].total += Number(item.total);
      }
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { storeId, createdAt: { gte: day, lt: nextDay } },
      include: { product: true },
    });

    const deliveries = await this.prisma.delivery.findMany({
      where: { sale: { storeId, createdAt: { gte: day, lt: nextDay } } },
      include: { sale: true },
    });

    const pendingDeliveries = deliveries.filter((d) => d.status === 'PENDING').length;
    const completedDeliveries = deliveries.filter((d) => d.status === 'DELIVERED').length;

    return {
      date: day.toISOString().slice(0, 10),
      revenue,
      paymentsByMethod,
      productsSold: Object.values(productsSold),
      stockMovements: movements.length,
      deliveries: { pending: pendingDeliveries, completed: completedDeliveries },
      salesCount: sales.length,
    };
  }
}
