import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMyDeliveries } from '../lib/deliveries';
import type { Delivery } from '../types';

const POLL_INTERVAL_MS = 30_000;

interface UseDeliveriesResult {
  deliveries: Delivery[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Carrega as entregas do entregador com polling de 30s e pull-to-refresh. */
export function useDeliveries(): UseDeliveriesResult {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'poll') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const data = await fetchMyDeliveries();
      if (!mounted.current) return;
      setDeliveries(data);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      if (mode !== 'poll') {
        setError(err instanceof Error ? err.message : 'Falha ao carregar entregas.');
      }
    } finally {
      if (!mounted.current) return;
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load('initial');
    const timer = setInterval(() => load('poll'), POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { deliveries, loading, refreshing, error, refresh };
}
