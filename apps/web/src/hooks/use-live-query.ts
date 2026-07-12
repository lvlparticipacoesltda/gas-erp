'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import type { RealtimeChannel } from '@/lib/realtime';

/** Fallback quando SSE cai ou a aba volta do background. */
export const LIVE_QUERY_FALLBACK_INTERVAL_MS = 60_000;

/** @deprecated Use LIVE_QUERY_FALLBACK_INTERVAL_MS — mantido para compatibilidade. */
export const DASHBOARD_POLL_INTERVAL_MS = LIVE_QUERY_FALLBACK_INTERVAL_MS;

type LoadMode = 'initial' | 'refresh' | 'poll';

/**
 * Busca dados com atualização em tempo real (SSE) ou recarregamento periódico.
 * - `initial` / `refresh`: exibe loading e descarta dados antigos ao mudar filtros
 * - `poll`: atualização silenciosa, sem spinner
 */
export function useLiveQuery<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: {
    enabled?: boolean;
    intervalMs?: number;
    realtime?: RealtimeChannel;
  } = {},
) {
  const { enabled = true, intervalMs = LIVE_QUERY_FALLBACK_INTERVAL_MS, realtime } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const hasLoadedOnce = useRef(false);
  const loadGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const depsKey = JSON.stringify(deps);
  const depsKeyRef = useRef(depsKey);

  const load = useCallback(
    async (mode: LoadMode) => {
      let generation = loadGeneration.current;

      if (mode !== 'poll') {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        generation = ++loadGeneration.current;
        setError('');

        if (depsKeyRef.current !== depsKey || !hasLoadedOnce.current) {
          setData(null);
        }
        depsKeyRef.current = depsKey;
        setLoading(true);
      }

      try {
        const signal = mode !== 'poll' ? abortRef.current?.signal : undefined;
        const result = await fetcher(signal);
        if (!mounted.current) return;
        if (mode !== 'poll' && generation !== loadGeneration.current) return;
        setData(result);
        hasLoadedOnce.current = true;
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (mode !== 'poll' && generation !== loadGeneration.current) return;
        if (mode !== 'poll') {
          setError(err instanceof Error ? err.message : 'Erro ao carregar');
          if (!hasLoadedOnce.current) setData(null);
        }
      } finally {
        if (!mounted.current) return;
        if (mode !== 'poll' && generation === loadGeneration.current) {
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps controlam quando refazer a busca
    [depsKey, fetcher],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    mounted.current = true;
    void load(hasLoadedOnce.current ? 'refresh' : 'initial');
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const realtimeChannel: RealtimeChannel | null = realtime ?? null;

  useRealtimeRefetch(
    realtimeChannel,
    () => {
      void loadRef.current('poll');
    },
    enabled && Boolean(realtimeChannel),
  );

  useEffect(() => {
    if (!enabled || realtimeChannel) return;

    const poll = () => {
      if (document.hidden) return;
      void loadRef.current('poll');
    };

    const timer = setInterval(poll, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void loadRef.current('poll');
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, realtimeChannel]);

  useEffect(() => {
    if (!enabled || !realtimeChannel) return;

    const timer = setInterval(() => {
      if (!document.hidden) void loadRef.current('poll');
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs, realtimeChannel]);

  return {
    data,
    loading: loading && !hasLoadedOnce.current,
    isRefetching: loading && hasLoadedOnce.current,
    error,
  };
}
