import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { requestLocationPermissionsWithDisclosure } from '../lib/location';

export interface DriverPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
}

/** Posição do entregador em primeiro plano (mapa home). */
export function useDriverLocation(enabled = true) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function refreshOnce(highAccuracy = false) {
      const current = await Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
      }).catch(() => null);
      if (!cancelled && current) {
        setPosition({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading,
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
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 8,
        },
        (loc) => {
          setPosition({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: loc.coords.heading,
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
  }, [enabled]);

  return { position, permissionDenied };
}
