'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Intervalo padrão de atualização ao vivo do dashboard/resumo. */
export const DASHBOARD_POLL_INTERVAL_MS = 15_000;

type LoadMode = 'initial' | 'refresh' | 'poll';

/**
 * Busca dados com recarregamento periódico em background.
 * - `initial` / `refresh`: exibe loading (overlay se já houver dados)
 * - `poll`: atualização silenciosa, sem spinner
 */
export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean; intervalMs?: number } = {},
) {
  const { enabled = true, intervalMs = DASHBOARD_POLL_INTERVAL_MS } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const hasLoadedOnce = useRef(false);

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

  useEffect(() => {
    mounted.current = true;
    void load(hasLoadedOnce.current ? 'refresh' : 'initial');
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) return;

    const poll = () => {
      if (document.hidden) return;
      void load('poll');
    };

    const timer = setInterval(poll, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void load('poll');
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, load]);

  return {
    data,
    loading: loading && !hasLoadedOnce.current,
    isRefetching: loading && hasLoadedOnce.current,
    error,
  };
}
