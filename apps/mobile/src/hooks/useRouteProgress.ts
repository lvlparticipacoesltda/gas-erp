import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decodePolyline,
  distanceToPolylineMeters,
  formatDistanceMeters,
  haversineDistanceMeters,
  polylineLengthMeters,
  remainingDistanceMeters,
  type DeliveryRouteResponse,
  type DeliveryRouteStep,
  type LatLng,
} from '@gas-erp/shared';
import { readCachedRoute, writeCachedRoute } from '../lib/offline-cache';
import { logRouteDebug } from '../lib/routing';
import type { DriverPosition } from './useDriverLocation';

const REROUTE_DISTANCE_M = 60;
const REROUTE_DEBOUNCE_MS = 30_000;
/** Fixes seguidos fora da rota exigidos para recalcular. */
const REROUTE_CONFIRM_FIXES = 2;
/** Raio em que a rota é considerada cumprida. */
export const ARRIVAL_RADIUS_M = 40;

export type NextManeuver = {
  /** Índice do passo na rota — desambigua instruções repetidas. */
  stepIndex: number;
  instruction: string;
  maneuver?: string;
  distanceMeters: number;
  distanceLabel: string;
  /** Manobra seguinte — evita errar cruzamento encadeado ("vire e logo depois vire"). */
  then?: { instruction: string; maneuver?: string };
};

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return 'menos de 1 min';
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

/**
 * Determina a próxima manobra a partir da posição do motorista.
 * O motorista está trafegando pelo passo mais próximo; a manobra a anunciar é
 * a do fim desse passo (início do próximo), com a distância até esse ponto.
 */
function computeNextManeuver(
  driver: LatLng,
  steps: DeliveryRouteStep[] | undefined,
): NextManeuver | null {
  if (!steps || steps.length === 0) return null;

  let currentIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = distanceToPolylineMeters(driver, [
      steps[i].startLocation,
      steps[i].endLocation,
    ]);
    if (d < bestDistance) {
      bestDistance = d;
      currentIndex = i;
    }
  }

  const currentStep = steps[currentIndex];
  const upcomingStep = steps[currentIndex + 1] ?? currentStep;
  const followingStep = steps[currentIndex + 2];
  const distanceMeters = haversineDistanceMeters(
    driver.latitude,
    driver.longitude,
    currentStep.endLocation.latitude,
    currentStep.endLocation.longitude,
  );

  return {
    stepIndex: currentIndex + 1,
    instruction: upcomingStep.instruction,
    maneuver: upcomingStep.maneuver,
    distanceMeters,
    distanceLabel: formatDistanceMeters(distanceMeters),
    ...(followingStep
      ? { then: { instruction: followingStep.instruction, maneuver: followingStep.maneuver } }
      : {}),
  };
}

export type RouteProgressOptions = {
  /** Id do alvo (entrega ou loja). Trocar reinicia a rota. */
  targetId: string | null;
  driverPosition: DriverPosition | null;
  enabled: boolean;
  fetchRoute: (targetId: string, lat: number, lng: number) => Promise<DeliveryRouteResponse>;
  /** Traduz o erro cru do fetch em mensagem para o entregador. */
  mapError?: (raw: string) => string;
  debugTag: string;
};

/**
 * Núcleo de navegação compartilhado pela rota de entrega e pela rota até a base.
 *
 * O ponto central é que **distância e tempo restantes são calculados no aparelho**,
 * projetando a posição na polyline que já está em memória. Antes, os dois hooks
 * exibiam `route.distanceMeters` e `route.durationSeconds` — os totais da rota
 * buscada uma única vez —, então o painel repetia o mesmo número a rota inteira
 * enquanto o entregador dirigia certo. Medir localmente resolve isso sem nenhuma
 * requisição nova ao provedor de rotas.
 */
export function useRouteProgress({
  targetId,
  driverPosition,
  enabled,
  fetchRoute,
  mapError,
  debugTag,
}: RouteProgressOptions) {
  const [route, setRoute] = useState<DeliveryRouteResponse | null>(null);
  /**
   * Totais da rota salva em disco. Ficam separados de `route` porque o cache não
   * guarda tudo que `DeliveryRouteResponse` exige (bounds, passos) — fingir o
   * tipo inteiro esconderia que as manobras não existem offline.
   */
  const [cachedTotals, setCachedTotals] = useState<
    { distanceMeters: number; durationSeconds: number } | null
  >(null);
  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRerouteAt = useRef(0);
  const fetchingRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const prevTargetIdRef = useRef<string | null>(null);
  const offRouteFixesRef = useRef(0);

  useEffect(() => {
    if (targetId !== prevTargetIdRef.current) {
      prevTargetIdRef.current = targetId;
      initialLoadedRef.current = false;
      offRouteFixesRef.current = 0;
      setRoute(null);
      setCachedTotals(null);
      setPolyline([]);
      setError(null);
    }
  }, [targetId]);

  const loadRoute = useCallback(
    async (origin: DriverPosition, force = false) => {
      if (!targetId || fetchingRef.current) return;
      if (!force && Date.now() - lastRerouteAt.current < REROUTE_DEBOUNCE_MS) return;

      fetchingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchRoute(targetId, origin.latitude, origin.longitude);
        const decoded = decodePolyline(result.encodedPolyline);
        setRoute(result);
        setPolyline(decoded);
        lastRerouteAt.current = Date.now();
        offRouteFixesRef.current = 0;
        void writeCachedRoute(targetId, {
          encodedPolyline: result.encodedPolyline,
          polyline: decoded,
          distanceMeters: result.distanceMeters,
          durationSeconds: result.durationSeconds,
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Erro ao carregar rota';
        const message = mapError ? mapError(raw) : raw;
        logRouteDebug(debugTag, { targetId, message: raw });
        setError(message);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [targetId, fetchRoute, mapError, debugTag],
  );

  useEffect(() => {
    if (!enabled || !targetId || !driverPosition || initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    void loadRoute(driverPosition, true);
  }, [enabled, targetId, driverPosition, loadRoute]);

  /**
   * Rota salva entra em cena enquanto a rede não responde. Sem isso, perder o
   * sinal no meio da rota apaga a linha do mapa e o entregador fica sem
   * referência exatamente onde mais precisa dela — e o progresso continua sendo
   * calculado localmente sobre essa polyline, sem depender de conexão.
   */
  useEffect(() => {
    if (!enabled || !targetId) return;
    let cancelled = false;
    void readCachedRoute(targetId).then((cached) => {
      if (cancelled || !cached) return;
      setPolyline((current) => (current.length > 0 ? current : cached.polyline));
      setCachedTotals((current) =>
        current ?? {
          distanceMeters: cached.distanceMeters,
          durationSeconds: cached.durationSeconds,
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, targetId]);

  // Recalcula só depois de confirmar o desvio em fixes seguidos: um salto isolado
  // de GPS não deve gastar uma requisição de rota.
  useEffect(() => {
    if (!enabled || !targetId || !driverPosition || polyline.length < 2) return;

    const dist = distanceToPolylineMeters(driverPosition, polyline);
    if (dist <= REROUTE_DISTANCE_M) {
      offRouteFixesRef.current = 0;
      return;
    }

    offRouteFixesRef.current += 1;
    if (offRouteFixesRef.current >= REROUTE_CONFIRM_FIXES) {
      void loadRoute(driverPosition);
    }
  }, [
    enabled,
    targetId,
    driverPosition?.latitude,
    driverPosition?.longitude,
    polyline,
    loadRoute,
  ]);

  /** Comprimento da polyline em mãos — denominador do progresso. */
  const totalMeters = useMemo(() => polylineLengthMeters(polyline), [polyline]);

  const remainingMeters = useMemo(() => {
    if (!driverPosition || polyline.length < 2) return null;
    return remainingDistanceMeters(driverPosition, polyline);
  }, [driverPosition?.latitude, driverPosition?.longitude, polyline]);

  /**
   * Tempo restante proporcional ao trecho que falta. Não é ETA com trânsito —
   * seria preciso pagar o SKU avançado do provedor —, mas decresce e é coerente
   * com a distância mostrada ao lado.
   */
  const totals = route ?? cachedTotals;

  const remainingSeconds = useMemo(() => {
    if (!totals || remainingMeters == null || totalMeters <= 0) return null;
    const ratio = Math.max(0, Math.min(1, remainingMeters / totalMeters));
    return totals.durationSeconds * ratio;
  }, [totals, remainingMeters, totalMeters]);

  const arrived = remainingMeters != null && remainingMeters <= ARRIVAL_RADIUS_M;

  const nextManeuver = useMemo(() => {
    if (!enabled || !driverPosition || !route?.steps) return null;
    return computeNextManeuver(driverPosition, route.steps);
  }, [enabled, driverPosition?.latitude, driverPosition?.longitude, route?.steps]);

  return {
    route,
    polyline,
    loading,
    error,
    remainingMeters,
    arrived,
    // Sem posição ainda, cai no total da rota — melhor que travessão no primeiro frame.
    etaLabel:
      remainingSeconds != null
        ? formatDuration(remainingSeconds)
        : totals
          ? formatDuration(totals.durationSeconds)
          : null,
    distanceLabel:
      remainingMeters != null
        ? formatDistanceMeters(remainingMeters)
        : totals
          ? formatDistanceMeters(totals.distanceMeters)
          : null,
    nextManeuver,
    refreshRoute: () => {
      if (driverPosition) void loadRoute(driverPosition, true);
    },
  };
}
