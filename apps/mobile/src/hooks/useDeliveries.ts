import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { fetchMyDeliveries } from '../lib/deliveries';
import { readCachedDeliveries, writeCachedDeliveries } from '../lib/offline-cache';
import type { Delivery } from '../types';

const POLL_INTERVAL_MS = 30_000;

interface UseDeliveriesResult {
  deliveries: Delivery[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Lista veio do disco e ainda não foi confirmada pela rede. */
  fromCache: boolean;
  refresh: () => Promise<void>;
}

/** Carrega as entregas do entregador com polling de 30s e pull-to-refresh. */
export function useDeliveries(): UseDeliveriesResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'poll') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const data = await fetchMyDeliveries();
        if (!mounted.current) return;
        setDeliveries(data);
        setFromCache(false);
        setError(null);
        if (userId) void writeCachedDeliveries(userId, data);
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
    },
    [userId],
  );

  // Hidrata do disco antes da rede responder: em zona morta, a tela abre com a
  // última fila conhecida em vez de vazia. Qualquer resposta da rede sobrescreve.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readCachedDeliveries(userId).then((cached) => {
      if (cancelled || !cached || cached.length === 0) return;
      setDeliveries((current) => {
        if (current.length > 0) return current;
        setFromCache(true);
        setLoading(false);
        return cached;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  return { deliveries, loading, refreshing, error, fromCache, refresh };
}
