import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { requestLocationPermissionsWithDisclosure } from '../lib/location';

export interface DriverPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
}

/**
 * Abaixo desta velocidade o curso do GPS é ruído: parado no semáforo ou
 * empurrando a moto, `coords.heading` oscila e faz a câmera girar sozinha.
 */
const HEADING_MIN_SPEED_MPS = 0.8;

/**
 * Posição do entregador em primeiro plano (mapa home).
 *
 * `navigating` eleva a precisão: `Balanced` (~100 m) basta para mostrar onde ele
 * está no mapa, mas não para turn-by-turn — com essa incerteza o marcador
 * serpenteia entre quadras e a manobra pode ser escolhida pelo passo errado. O
 * rastreamento em segundo plano (`location.ts`) já usa `High` durante a entrega;
 * aqui era o mapa em uso que estava menos preciso que ele.
 */
export function useDriverLocation(enabled = true, navigating = false) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  /** Último rumo confiável — mantido enquanto o entregador está lento demais. */
  const lastHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function resolveHeading(coords: Location.LocationObjectCoords): number | null {
      const speed = coords.speed ?? 0;
      const heading = coords.heading;
      if (heading == null || heading < 0 || speed < HEADING_MIN_SPEED_MPS) {
        return lastHeadingRef.current;
      }
      lastHeadingRef.current = heading;
      return heading;
    }

    async function refreshOnce(highAccuracy = false) {
      const current = await Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
      }).catch(() => null);
      if (!cancelled && current) {
        setPosition({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: resolveHeading(current.coords),
        });
      }
    }

    async function start() {
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status !== 'granted') {
        const permissions = await requestLocationPermissionsWithDisclosure();
        if (cancelled) return;
        if (!permissions.foreground) {
          setPermissionDenied(true);
          // Não inventa coordenada fake — bloquearia "perto do cliente" de forma irreversível.
          setPosition(null);
          return;
        }
      }

      setPermissionDenied(false);
      await refreshOnce();

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: navigating ? Location.Accuracy.High : Location.Accuracy.Balanced,
          timeInterval: navigating ? 1500 : 3000,
          distanceInterval: navigating ? 5 : 8,
        },
        (loc) => {
          setPosition({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: resolveHeading(loc.coords),
          });
        },
      );
    }

    void start();

    // iOS: ao voltar do Maps/Waze o watch costuma estar congelado — força um fix fresco.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refreshOnce(true);
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      watchRef.current?.remove();
      watchRef.current = null;
    };
    // `navigating` reabre o watch com a precisão nova — é troca de modo, não de valor.
  }, [enabled, navigating]);

  return { position, permissionDenied };
}
