import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { LatLng } from '@gas-erp/shared';
import type { DriverPosition } from '../../hooks/useDriverLocation';
import type { Delivery } from '../../types';
import { DriverMarker, useDriverMarkerTracksViewChanges } from './DriverMarker';
import { PendingDeliveryMarkers } from './PendingDeliveryMarkers';

export type DriverMapRef = {
  recenter: () => void;
};

const DEFAULT_REGION: Region = {
  latitude: -23.9608,
  longitude: -46.3336,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export const DriverMap = forwardRef<DriverMapRef, {
  driverPosition: DriverPosition | null;
  routePolyline: LatLng[];
  previewPolyline?: LatLng[];
  followDriver?: boolean;
  pendingDeliveries?: Delivery[];
  selectedDeliveryId?: string | null;
  activeDeliveryId?: string | null;
  onSelectPendingDelivery?: (delivery: Delivery) => void;
}>(function DriverMap({
  driverPosition,
  routePolyline,
  previewPolyline = [],
  followDriver,
  pendingDeliveries = [],
  selectedDeliveryId,
  activeDeliveryId,
  onSelectPendingDelivery,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const driverTracksViewChanges = useDriverMarkerTracksViewChanges(
    driverPosition?.latitude ?? 0,
    driverPosition?.longitude ?? 0,
    driverPosition?.heading ?? null,
  );

  const recenter = useCallback(() => {
    if (!mapRef.current || !driverPosition) return;

    if (followDriver && routePolyline.length > 1) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: driverPosition.latitude,
            longitude: driverPosition.longitude,
          },
          pitch: 0,
          zoom: 16,
        },
        { duration: 500 },
      );
      return;
    }

    mapRef.current.animateToRegion(
      {
        latitude: driverPosition.latitude,
        longitude: driverPosition.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500,
    );
  }, [driverPosition, followDriver, routePolyline.length]);

  useImperativeHandle(ref, () => ({ recenter }), [recenter]);

  const pendingWithCoords = pendingDeliveries.filter((d) => d.destination != null);

  useEffect(() => {
    if (!mapRef.current || !driverPosition) return;

    if (followDriver && routePolyline.length > 1) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: driverPosition.latitude,
            longitude: driverPosition.longitude,
          },
          pitch: 0,
          zoom: 16,
        },
        { duration: 800 },
      );
      return;
    }

    const coords: LatLng[] = [];
    if (driverPosition) coords.push(driverPosition);
    if (previewPolyline.length > 1) {
      coords.push(...previewPolyline);
    } else {
      for (const delivery of pendingWithCoords) {
        if (delivery.destination) coords.push(delivery.destination);
      }
    }
    if (coords.length === 0) return;

    if (coords.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: coords[0].latitude,
          longitude: coords[0].longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600,
      );
      return;
    }

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 48, bottom: 220, left: 48 },
      animated: true,
    });
  }, [
    driverPosition?.latitude,
    driverPosition?.longitude,
    routePolyline.length,
    previewPolyline.length,
    selectedDeliveryId,
    followDriver,
    pendingWithCoords.length,
  ]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={DEFAULT_REGION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled
      pitchEnabled={false}
    >
      {driverPosition ? (
        <Marker
          coordinate={driverPosition}
          anchor={{ x: 0.5, y: 0.5 }}
          flat={Boolean(followDriver && driverPosition.heading != null)}
          rotation={
            followDriver && driverPosition.heading != null
              ? driverPosition.heading
              : 0
          }
          tracksViewChanges={driverTracksViewChanges}
        >
          <DriverMarker />
        </Marker>
      ) : null}

      <PendingDeliveryMarkers
        deliveries={pendingWithCoords}
        driverPosition={driverPosition}
        selectedId={selectedDeliveryId}
        highlightedId={activeDeliveryId}
        onSelect={onSelectPendingDelivery}
      />

      {previewPolyline.length > 1 ? (
        <Polyline
          coordinates={previewPolyline}
          strokeColor="#60A5FA"
          strokeWidth={4}
          lineDashPattern={[10, 8]}
        />
      ) : null}

      {routePolyline.length > 1 ? (
        <Polyline
          coordinates={routePolyline}
          strokeColor="#2563EB"
          strokeWidth={5}
        />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFill },
});
