'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRealtimeUrl, isRealtimeHeartbeat, type RealtimeChannel } from '@/lib/realtime';

/** Fallback quando SSE cai ou a aba volta do background. */
export const LIVE_QUERY_FALLBACK_INTERVAL_MS = 60_000;

/** @deprecated Use LIVE_QUERY_FALLBACK_INTERVAL_MS — mantido para compatibilidade. */
export const DASHBOARD_POLL_INTERVAL_MS = LIVE_QUERY_FALLBACK_INTERVAL_MS;

type LoadMode = 'initial' | 'refresh' | 'poll';

/**
 * Busca dados com atualização em tempo real (SSE) ou recarregamento periódico.
 * - `initial` / `refresh`: exibe loading (overlay se já houver dados)
 * - `poll`: atualização silenciosa, sem spinner
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
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
  const loadRef = useRef<(mode: LoadMode) => Promise<void>>(async () => undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (mode: LoadMode) => {
      if (mode !== 'poll') {
        setError('');
        setLoading(true);
      }

      try {
        const result = await fetcher();
        if (!mounted.current) return;
        setData(result);
        hasLoadedOnce.current = true;
      } catch (err) {
        if (!mounted.current) return;
        if (mode !== 'poll') {
          setError(err instanceof Error ? err.message : 'Erro ao carregar');
          if (!hasLoadedOnce.current) setData(null);
        }
      } finally {
        if (!mounted.current) return;
        if (mode !== 'poll') setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps controlam quando refazer a busca
    deps,
  );

  loadRef.current = load;

  const schedulePoll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (!document.hidden) void loadRef.current('poll');
    }, 300);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load(hasLoadedOnce.current ? 'refresh' : 'initial');
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const realtimeKey = realtime
    ? realtime.type === 'store'
      ? `store:${realtime.storeId}`
      : 'org'
    : null;

  useEffect(() => {
    if (!enabled || !realtimeKey) return;

    const realtimeChannel: RealtimeChannel = realtimeKey.startsWith('store:')
      ? { type: 'store', storeId: realtimeKey.slice('store:'.length) }
      : { type: 'org' };

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const connect = () => {
      const url = buildRealtimeUrl(realtimeChannel);
      if (!url) return;

      source?.close();
      source = new EventSource(url);

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as unknown;
          if (isRealtimeHeartbeat(payload)) return;
        } catch {
          // Evento sem JSON — ainda assim refaz a busca.
        }
        schedulePoll();
      };

      source.onopen = () => {
        reconnectAttempts = 0;
      };

      source.onerror = () => {
        source?.close();
        source = null;
        const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempts);
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    const fallbackTimer = setInterval(() => {
      if (!document.hidden) void loadRef.current('poll');
    }, intervalMs);

    const onVisible = () => {
      if (document.hidden) return;
      void loadRef.current('poll');
      if (!source || source.readyState === EventSource.CLOSED) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(fallbackTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, realtimeKey, schedulePoll]);

  useEffect(() => {
    if (!enabled || realtimeKey) return;

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
  }, [enabled, intervalMs, realtimeKey, schedulePoll]);

  return {
    data,
    loading: loading && !hasLoadedOnce.current,
    isRefetching: loading && hasLoadedOnce.current,
    error,
  };
}
