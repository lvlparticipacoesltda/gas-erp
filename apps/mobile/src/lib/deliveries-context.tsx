import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useDeliveries } from '../hooks/useDeliveries';
import type { Delivery } from '../types';

interface DeliveriesContextValue {
  deliveries: Delivery[];
  pending: Delivery[];
  inProgress: Delivery[];
  delivered: Delivery[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getById: (id: string) => Delivery | undefined;
  hasActiveRoute: boolean;
}

const DeliveriesContext = createContext<DeliveriesContextValue | undefined>(undefined);

export function DeliveriesProvider({ children }: { children: ReactNode }) {
  const { deliveries, loading, refreshing, error, refresh } = useDeliveries();

  const value = useMemo<DeliveriesContextValue>(() => {
    const pending = deliveries.filter((d) => d.status === 'PENDING');
    const inProgress = deliveries.filter((d) => d.status === 'IN_PROGRESS');
    const delivered = deliveries.filter((d) => d.status === 'DELIVERED');
    return {
      deliveries,
      pending,
      inProgress,
      delivered,
      loading,
      refreshing,
      error,
      refresh,
      getById: (id: string) => deliveries.find((d) => d.id === id),
      hasActiveRoute: inProgress.length > 0,
    };
  }, [deliveries, loading, refreshing, error, refresh]);

  return <DeliveriesContext.Provider value={value}>{children}</DeliveriesContext.Provider>;
}

export function useDeliveriesContext(): DeliveriesContextValue {
  const ctx = useContext(DeliveriesContext);
  if (!ctx) throw new Error('useDeliveriesContext deve ser usado dentro de DeliveriesProvider');
  return ctx;
}
