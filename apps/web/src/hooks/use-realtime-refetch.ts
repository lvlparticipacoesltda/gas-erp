'use client';

import { useEffect, useRef } from 'react';
import { buildRealtimeUrl, isRealtimeHeartbeat, type RealtimeChannel } from '@/lib/realtime';

/** Escuta SSE da loja/org e dispara refetch quando há mudança real. */
export function useRealtimeRefetch(
  channel: RealtimeChannel | null,
  onRefetch: () => void,
  enabled = true,
) {
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  const channelKey = channel
    ? channel.type === 'store'
      ? `store:${channel.storeId}`
      : 'org'
    : null;

  useEffect(() => {
    if (!enabled || !channel || !channelKey) return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!document.hidden) onRefetchRef.current();
      }, 300);
    };

    const connect = () => {
      const url = buildRealtimeUrl(channel);
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
        scheduleRefetch();
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

    const onVisible = () => {
      if (document.hidden) return;
      onRefetchRef.current();
      if (!source || source.readyState === EventSource.CLOSED) connect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, channel, channelKey]);
}
