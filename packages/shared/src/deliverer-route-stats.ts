import { getRouteDurationSeconds, getTotalDeliveryTimeSeconds, getWaitTimeSeconds } from './delivery-metrics';

export const SLOW_DELIVERY_THRESHOLD_SECONDS = 900;

export type DelivererRouteStatsRow = {
  delivererId: string;
  delivererName: string;
  /** Rotas concluídas (status DELIVERED). */
  completedCount: number;
  /** Rotas atribuídas e canceladas antes da conclusão. */
  cancelledCount: number;
  avgWaitTimeSeconds: number | null;
  avgRouteDurationSeconds: number | null;
  avgTotalDeliveryTimeSeconds: number | null;
};

export type SlowDeliveryRow = {
  saleId: string;
  customerName: string;
  delivererName: string;
  waitTimeSeconds: number | null;
  routeDurationSeconds: number | null;
  totalDeliveryTimeSeconds: number | null;
  storeName?: string;
};

export type DeliveryPipelineCounts = {
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
};

export type DeliveryForRouteStats = {
  status: string;
  delivererId: string;
  delivererName: string;
  saleId: string;
  saleCreatedAt: Date | string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  customerName?: string;
  storeName?: string;
};

function averageSeconds(values: number[]): number | null {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

/** Agrega contagens de pipeline, métricas globais, lentas e por entregador. */
export function aggregateDelivererRouteStats(
  deliveries: DeliveryForRouteStats[],
  options?: { slowThresholdSeconds?: number },
): {
  counts: DeliveryPipelineCounts;
  avgWaitTimeSeconds: number | null;
  maxWaitTimeSeconds: number | null;
  avgRouteDurationSeconds: number | null;
  maxRouteDurationSeconds: number | null;
  avgTotalDeliveryTimeSeconds: number | null;
  maxTotalDeliveryTimeSeconds: number | null;
  slowDeliveries: SlowDeliveryRow[];
  byDeliverer: DelivererRouteStatsRow[];
} {
  const slowThreshold = options?.slowThresholdSeconds ?? SLOW_DELIVERY_THRESHOLD_SECONDS;

  const counts: DeliveryPipelineCounts = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  };

  const globalWaitTimes: number[] = [];
  const globalRouteTimes: number[] = [];
  const globalTotalTimes: number[] = [];
  const slowDeliveries: SlowDeliveryRow[] = [];
  const delivererMap = new Map<
    string,
    {
      delivererName: string;
      completedCount: number;
      cancelledCount: number;
      waitTimes: number[];
      routeTimes: number[];
      totalTimes: number[];
    }
  >();

  for (const delivery of deliveries) {
    switch (delivery.status) {
      case 'PENDING':
        counts.pending += 1;
        break;
      case 'IN_PROGRESS':
        counts.inProgress += 1;
        break;
      case 'DELIVERED':
        counts.completed += 1;
        break;
      case 'CANCELLED':
        counts.cancelled += 1;
        break;
      default:
        break;
    }

    const stats = delivererMap.get(delivery.delivererId) ?? {
      delivererName: delivery.delivererName,
      completedCount: 0,
      cancelledCount: 0,
      waitTimes: [],
      routeTimes: [],
      totalTimes: [],
    };

    if (delivery.status === 'DELIVERED') {
      stats.completedCount += 1;
      const waitTimeSeconds = getWaitTimeSeconds(delivery.saleCreatedAt, delivery.startedAt);
      const routeDurationSeconds = getRouteDurationSeconds(
        delivery.startedAt,
        delivery.completedAt,
      );
      if (waitTimeSeconds != null) {
        stats.waitTimes.push(waitTimeSeconds);
        globalWaitTimes.push(waitTimeSeconds);
      }
      if (routeDurationSeconds != null) {
        stats.routeTimes.push(routeDurationSeconds);
        globalRouteTimes.push(routeDurationSeconds);
      }
      const totalDeliveryTimeSeconds = getTotalDeliveryTimeSeconds(
        waitTimeSeconds,
        routeDurationSeconds,
      );
      if (totalDeliveryTimeSeconds != null) {
        stats.totalTimes.push(totalDeliveryTimeSeconds);
        globalTotalTimes.push(totalDeliveryTimeSeconds);
      }

      const isSlowWait = waitTimeSeconds != null && waitTimeSeconds > slowThreshold;
      const isSlowRoute =
        routeDurationSeconds != null && routeDurationSeconds > slowThreshold;
      if (isSlowWait || isSlowRoute) {
        slowDeliveries.push({
          saleId: delivery.saleId,
          customerName: delivery.customerName ?? 'Cliente avulso',
          delivererName: delivery.delivererName,
          waitTimeSeconds,
          routeDurationSeconds,
          totalDeliveryTimeSeconds,
          ...(delivery.storeName ? { storeName: delivery.storeName } : {}),
        });
      }
    } else if (delivery.status === 'CANCELLED') {
      stats.cancelledCount += 1;
    }

    delivererMap.set(delivery.delivererId, stats);
  }

  const byDeliverer = Array.from(delivererMap.entries())
    .map(([delivererId, stats]) => ({
      delivererId,
      delivererName: stats.delivererName,
      completedCount: stats.completedCount,
      cancelledCount: stats.cancelledCount,
      avgWaitTimeSeconds: averageSeconds(stats.waitTimes),
      avgRouteDurationSeconds: averageSeconds(stats.routeTimes),
      avgTotalDeliveryTimeSeconds: averageSeconds(stats.totalTimes),
    }))
    .filter((row) => row.completedCount > 0 || row.cancelledCount > 0)
    .sort(
      (a, b) =>
        b.completedCount - a.completedCount ||
        b.cancelledCount - a.cancelledCount ||
        a.delivererName.localeCompare(b.delivererName, 'pt-BR'),
    );

  slowDeliveries.sort((a, b) => {
    const aMax = Math.max(a.waitTimeSeconds ?? 0, a.routeDurationSeconds ?? 0);
    const bMax = Math.max(b.waitTimeSeconds ?? 0, b.routeDurationSeconds ?? 0);
    return bMax - aMax;
  });

  return {
    counts,
    avgWaitTimeSeconds: averageSeconds(globalWaitTimes),
    maxWaitTimeSeconds: globalWaitTimes.length ? Math.max(...globalWaitTimes) : null,
    avgRouteDurationSeconds: averageSeconds(globalRouteTimes),
    maxRouteDurationSeconds: globalRouteTimes.length ? Math.max(...globalRouteTimes) : null,
    avgTotalDeliveryTimeSeconds: averageSeconds(globalTotalTimes),
    maxTotalDeliveryTimeSeconds: globalTotalTimes.length ? Math.max(...globalTotalTimes) : null,
    slowDeliveries,
    byDeliverer,
  };
}
