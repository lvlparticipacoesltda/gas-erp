import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { DelivererMe } from '@gas-erp/shared';
import { api } from './api';
import { syncPresenceSharingEnabled, recoverStaleLocationTracking, promptLocationPermissionsAfterLogin } from './location';
import { syncPushTokenWithApi, waitForNotificationPermissionFlow } from './notifications';

/** Intervalo para consultar disponibilidade no painel (disponível / indisponível). */
const AVAILABILITY_SYNC_INTERVAL_MS = 30_000;

interface DelivererAvailabilityContextValue {
  me: DelivererMe | null;
  syncing: boolean;
  /** Indisponível pela loja e sem rota ativa. */
  isUnavailable: boolean;
  refresh: () => Promise<void>;
}

const DelivererAvailabilityContext = createContext<DelivererAvailabilityContextValue | undefined>(
  undefined,
);

/**
 * Consulta status no servidor e liga/desliga envio de GPS conforme disponibilidade.
 * Não exibe diálogo de permissão — isso ocorre uma vez após login.
 */
export async function syncDelivererAvailabilityFromServer(): Promise<DelivererMe> {
  const me = await api<DelivererMe>('/deliverers/me');

  if (!me.sharingLocation && !me.hasActiveRoute) {
    await syncPresenceSharingEnabled(false);
  } else {
    await recoverStaleLocationTracking();
    if (me.sharingLocation) {
      await syncPresenceSharingEnabled(true);
    }
  }

  void syncPushTokenWithApi().catch(() => undefined);
  return me;
}

export function DelivererAvailabilityProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<DelivererMe | null>(null);
  const [syncing, setSyncing] = useState(false);
  const bootstrapDone = useRef(false);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await syncDelivererAvailabilityFromServer();
      setMe(data);
    } catch {
      // Mantém último estado conhecido.
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapDone.current) return;
    bootstrapDone.current = true;

    void (async () => {
      await waitForNotificationPermissionFlow().catch(() => undefined);
      await promptLocationPermissionsAfterLogin();
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, AVAILABILITY_SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const isUnavailable = me != null && me.status === 'OFFLINE' && !me.hasActiveRoute;

  const value = useMemo(
    () => ({ me, syncing, isUnavailable, refresh }),
    [me, syncing, isUnavailable, refresh],
  );

  return (
    <DelivererAvailabilityContext.Provider value={value}>
      {children}
    </DelivererAvailabilityContext.Provider>
  );
}

export function useDelivererAvailability(): DelivererAvailabilityContextValue {
  const ctx = useContext(DelivererAvailabilityContext);
  if (!ctx) {
    throw new Error('useDelivererAvailability deve ser usado dentro de DelivererAvailabilityProvider');
  }
  return ctx;
}
