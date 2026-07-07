import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { requestLocationPermissionsWithDisclosure } from '../lib/location';

export interface DriverPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
}

const DEFAULT_POSITION: DriverPosition = {
  latitude: -23.9608,
  longitude: -46.3336,
  heading: null,
};

/** Posição do entregador em primeiro plano (mapa home). */
export function useDriverLocation(enabled = true) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status !== 'granted') {
        const permissions = await requestLocationPermissionsWithDisclosure();
        if (cancelled) return;
        if (!permissions.foreground) {
          setPermissionDenied(true);
          setPosition(DEFAULT_POSITION);
          return;
        }
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (!cancelled && current) {
        setPosition({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading,
        });
      }

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

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [enabled]);

  return { position, permissionDenied };
}
