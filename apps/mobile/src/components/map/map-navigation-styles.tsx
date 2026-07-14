import { Fragment } from 'react';
import { Polyline } from 'react-native-maps';
import type { LatLng } from '@gas-erp/shared';

type RoutePolylineVariant = 'active' | 'preview';

const ROUTE_STYLES: Record<
  RoutePolylineVariant,
  { casingWidth: number; routeWidth: number; routeColor: string }
> = {
  active: { casingWidth: 10, routeWidth: 6, routeColor: '#1A73E8' },
  preview: { casingWidth: 9, routeWidth: 5, routeColor: '#4285F4' },
};

export function GoogleStyleRoutePolyline({
  coordinates,
  variant = 'active',
}: {
  coordinates: LatLng[];
  variant?: RoutePolylineVariant;
}) {
  if (coordinates.length < 2) return null;

  const style = ROUTE_STYLES[variant];

  return (
    <Fragment>
      <Polyline
        coordinates={coordinates}
        strokeColor="#FFFFFF"
        strokeWidth={style.casingWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={variant === 'active' ? 1 : 0}
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={style.routeColor}
        strokeWidth={style.routeWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={variant === 'active' ? 2 : 1}
      />
    </Fragment>
  );
}

export const NAV_CAMERA_ZOOM = 17;
export const NAV_CAMERA_PITCH = 50;
export const IDLE_CAMERA_ZOOM = 16;
export const IDLE_CAMERA_PITCH = 45;

export function buildDriverCamera(
  position: { latitude: number; longitude: number; heading?: number | null },
  headingFallback: number,
  mode: 'navigation' | 'idle',
) {
  return {
    center: {
      latitude: position.latitude,
      longitude: position.longitude,
    },
    heading: position.heading ?? headingFallback,
    pitch: mode === 'navigation' ? NAV_CAMERA_PITCH : IDLE_CAMERA_PITCH,
    zoom: mode === 'navigation' ? NAV_CAMERA_ZOOM : IDLE_CAMERA_ZOOM,
  };
}
