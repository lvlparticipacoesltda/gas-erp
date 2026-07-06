import { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { LatLng } from '@gas-erp/shared';
import type { DriverPosition } from '../../hooks/useDriverLocation';
import type { Delivery, DeliveryDestination } from '../../types';
import { PendingDeliveryMarkers } from './PendingDeliveryMarkers';

const DEFAULT_REGION: Region = {
  latitude: -23.9608,
  longitude: -46.3336,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export function DriverMap({
  driverPosition,
  destination,
  routePolyline,
  previewPolyline = [],
  followDriver,
  pendingDeliveries = [],
  selectedDeliveryId,
  activeDeliveryId,
  onSelectPendingDelivery,
}: {
  driverPosition: DriverPosition | null;
  destination?: DeliveryDestination | null;
  routePolyline: LatLng[];
  previewPolyline?: LatLng[];
  followDriver?: boolean;
  pendingDeliveries?: Delivery[];
  selectedDeliveryId?: string | null;
  activeDeliveryId?: string | null;
  onSelectPendingDelivery?: (delivery: Delivery) => void;
}) {
  const mapRef = useRef<MapView>(null);

  const pendingWithCoords = pendingDeliveries.filter((d) => d.destination != null);
  const showSeparateDestination =
    destination
    && !pendingWithCoords.some(
      (d) =>
        d.id === activeDeliveryId
        && d.destination?.latitude === destination.latitude
        && d.destination?.longitude === destination.longitude,
    );

  useEffect(() => {
    if (!mapRef.current || !driverPosition) return;

    if (followDriver && routePolyline.length > 1) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: driverPosition.latitude,
            longitude: driverPosition.longitude,
          },
          heading: driverPosition.heading ?? 0,
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
      if (destination && showSeparateDestination) coords.push(destination);
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
    destination?.latitude,
    destination?.longitude,
    routePolyline.length,
    previewPolyline.length,
    selectedDeliveryId,
    followDriver,
    pendingWithCoords.length,
    showSeparateDestination,
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
      rotateEnabled={!followDriver}
    >
      {driverPosition ? (
        <Marker
          coordinate={driverPosition}
          title="Você"
          pinColor="#2563EB"
        />
      ) : null}

      <PendingDeliveryMarkers
        deliveries={pendingWithCoords}
        driverPosition={driverPosition}
        selectedId={selectedDeliveryId}
        highlightedId={activeDeliveryId}
        onSelect={onSelectPendingDelivery}
      />

      {showSeparateDestination && destination ? (
        <Marker
          coordinate={destination}
          title="Destino"
          pinColor="#16A34A"
        />
      ) : null}

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
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFill },
});
