import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { LatLng } from '@gas-erp/shared';
import type { DriverPosition } from '../../hooks/useDriverLocation';
import { collectDeliveryCoordinates } from '../../hooks/useEnrichedDeliveryDestinations';
import type { Delivery } from '../../types';
import { DriverMarker, useDriverMarkerTracksViewChanges } from './DriverMarker';
import { DeliveryAddressMapMarkers } from './DeliveryAddressMapMarkers';
import {
  buildDriverCamera,
  GoogleStyleRoutePolyline,
} from './map-navigation-styles';
import { RouteCheckpointMarker } from './RouteCheckpointMarker';

export type DriverMapRef = {
  recenter: () => void;
  showAllDeliveries: () => void;
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
  idleFollow?: boolean;
  showDeliveriesOverview?: boolean;
  pendingDeliveries?: Delivery[];
  selectedDeliveryId?: string | null;
  activeDeliveryId?: string | null;
  routeEndLabel?: string | null;
  onSelectPendingDelivery?: (delivery: Delivery) => void;
  onFollowPausedChange?: (paused: boolean) => void;
}>(function DriverMap({
  driverPosition,
  routePolyline,
  previewPolyline = [],
  followDriver,
  idleFollow,
  showDeliveriesOverview,
  pendingDeliveries = [],
  selectedDeliveryId,
  activeDeliveryId,
  routeEndLabel,
  onSelectPendingDelivery,
  onFollowPausedChange,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const followPausedRef = useRef(false);
  const lastHeadingRef = useRef(0);
  const initialCameraDoneRef = useRef(false);
  const previewFitDoneRef = useRef<string | null>(null);
  const deliveriesOverviewFitRef = useRef<string | null>(null);

  const isNavigationMode = Boolean(followDriver);
  const isDriverCentric = Boolean(followDriver || idleFollow);
  const showPreviewOverview = Boolean(
    !isNavigationMode && previewPolyline.length > 1 && selectedDeliveryId,
  );
  const useNavigationMarker = Boolean(
    driverPosition
    && (followDriver || idleFollow || pendingDeliveries.length > 0),
  );
  const cameraMode = isNavigationMode ? 'navigation' : 'idle';

  const driverTracksViewChanges = useDriverMarkerTracksViewChanges(
    driverPosition?.latitude ?? 0,
    driverPosition?.longitude ?? 0,
    driverPosition?.heading ?? null,
  );

  const setFollowPaused = useCallback(
    (paused: boolean) => {
      if (followPausedRef.current === paused) return;
      followPausedRef.current = paused;
      onFollowPausedChange?.(paused);
    },
    [onFollowPausedChange],
  );

  if (driverPosition?.heading != null) {
    lastHeadingRef.current = driverPosition.heading;
  }

  const animateDriverCamera = useCallback(
    (duration = 500) => {
      if (!mapRef.current || !driverPosition || !isDriverCentric) return;
      mapRef.current.animateCamera(
        buildDriverCamera(driverPosition, lastHeadingRef.current, cameraMode),
        { duration },
      );
    },
    [driverPosition, isDriverCentric, cameraMode],
  );

  const activeRouteEnd = useMemo(() => {
    if (routePolyline.length > 1) return routePolyline[routePolyline.length - 1];
    if (!activeDeliveryId) return null;
    return pendingDeliveries.find((d) => d.id === activeDeliveryId)?.destination ?? null;
  }, [routePolyline, activeDeliveryId, pendingDeliveries]);

  const previewRouteEnd = useMemo(() => {
    if (previewPolyline.length > 1) return previewPolyline[previewPolyline.length - 1];
    if (!selectedDeliveryId) return null;
    return pendingDeliveries.find((d) => d.id === selectedDeliveryId)?.destination ?? null;
  }, [previewPolyline, selectedDeliveryId, pendingDeliveries]);

  const fitDeliveriesOverview = useCallback(() => {
    if (!mapRef.current || !driverPosition || pendingDeliveries.length === 0) return;

    const destinationCoords = collectDeliveryCoordinates(
      pendingDeliveries,
      {},
      activeDeliveryId,
      selectedDeliveryId,
      activeRouteEnd,
      previewRouteEnd,
    );
    if (destinationCoords.length === 0) return;

    mapRef.current.fitToCoordinates(
      [driverPosition, ...destinationCoords],
      {
        edgePadding: { top: 120, right: 48, bottom: 220, left: 48 },
        animated: true,
      },
    );
  }, [
    driverPosition,
    pendingDeliveries,
    activeDeliveryId,
    selectedDeliveryId,
    activeRouteEnd,
    previewRouteEnd,
  ]);

  const recenter = useCallback(() => {
    if (!mapRef.current || !driverPosition) return;

    if (showDeliveriesOverview && pendingDeliveries.some((d) => d.destination)) {
      fitDeliveriesOverview();
      return;
    }

    if (isDriverCentric) {
      setFollowPaused(false);
      animateDriverCamera(500);
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
  }, [
    driverPosition,
    showDeliveriesOverview,
    pendingDeliveries,
    isDriverCentric,
    animateDriverCamera,
    setFollowPaused,
    fitDeliveriesOverview,
  ]);

  useImperativeHandle(ref, () => ({
    recenter,
    showAllDeliveries: fitDeliveriesOverview,
  }), [recenter, fitDeliveriesOverview]);

  const deliveriesWithAddressPill = pendingDeliveries;

  function fitPreviewRoute() {
    if (!mapRef.current || !driverPosition || previewPolyline.length < 2) return;

    mapRef.current.fitToCoordinates(
      [driverPosition, ...previewPolyline],
      {
        edgePadding: { top: 120, right: 48, bottom: 220, left: 48 },
        animated: true,
      },
    );
  }

  // Retoma seguimento ao entrar em modo centrado no motorista.
  useEffect(() => {
    if (isDriverCentric) {
      setFollowPaused(false);
    }
  }, [isDriverCentric, setFollowPaused]);

  // Sai do overview de prévia quando a seleção some.
  useEffect(() => {
    if (!selectedDeliveryId) {
      previewFitDoneRef.current = null;
    }
  }, [selectedDeliveryId]);

  // Overview: enquadra motorista + entregas alocadas (pill fica visível mesmo longe).
  useEffect(() => {
    if (!showDeliveriesOverview || !driverPosition) return;

    const destinationCoords = collectDeliveryCoordinates(
      pendingDeliveries,
      {},
      activeDeliveryId,
      selectedDeliveryId,
      activeRouteEnd,
      previewRouteEnd,
    );
    if (destinationCoords.length === 0) return;

    const overviewKey = [
      pendingDeliveries.map((d) => d.id).join(','),
      destinationCoords.length,
    ].join('|');
    if (deliveriesOverviewFitRef.current === overviewKey) return;
    deliveriesOverviewFitRef.current = overviewKey;

    fitDeliveriesOverview();
  }, [
    showDeliveriesOverview,
    driverPosition,
    pendingDeliveries,
    activeDeliveryId,
    selectedDeliveryId,
    activeRouteEnd,
    previewRouteEnd,
    fitDeliveriesOverview,
  ]);

  // Overview da rota de prévia (antes de iniciar) — uma vez por entrega selecionada.
  useEffect(() => {
    if (!showPreviewOverview || !selectedDeliveryId) return;
    if (previewFitDoneRef.current === selectedDeliveryId) return;
    previewFitDoneRef.current = selectedDeliveryId;
    fitPreviewRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreviewOverview, selectedDeliveryId, previewPolyline.length]);

  // Câmera centrada no motorista (rota ativa ou idle estilo Google Maps).
  useEffect(() => {
    if (!isDriverCentric || !driverPosition || followPausedRef.current) return;
    if (showPreviewOverview) return;
    animateDriverCamera(500);
  }, [
    isDriverCentric,
    showPreviewOverview,
    driverPosition?.latitude,
    driverPosition?.longitude,
    driverPosition?.heading,
    animateDriverCamera,
  ]);

  // Primeira centralização quando o GPS fica disponível.
  useEffect(() => {
    if (!driverPosition || initialCameraDoneRef.current) return;
    initialCameraDoneRef.current = true;
    if (showDeliveriesOverview || showPreviewOverview) return;
    if (isDriverCentric) {
      animateDriverCamera(600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPosition?.latitude, driverPosition?.longitude]);

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
      pitchEnabled={isDriverCentric}
      onPanDrag={() => {
        if (isDriverCentric) setFollowPaused(true);
      }}
      onRegionChange={(_region, details) => {
        if (isDriverCentric && details?.isGesture) setFollowPaused(true);
      }}
    >
      {driverPosition ? (
        <Marker
          coordinate={driverPosition}
          anchor={{ x: 0.5, y: 0.5 }}
          flat={Boolean(useNavigationMarker && isDriverCentric && driverPosition.heading != null)}
          rotation={
            useNavigationMarker && isDriverCentric && driverPosition.heading != null
              ? driverPosition.heading
              : 0
          }
          tracksViewChanges={driverTracksViewChanges}
        >
          <DriverMarker variant={useNavigationMarker ? 'navigation' : 'bicycle'} />
        </Marker>
      ) : null}

      <DeliveryAddressMapMarkers
        deliveries={deliveriesWithAddressPill}
        activeId={activeDeliveryId}
        selectedId={selectedDeliveryId}
        activeRouteEnd={activeRouteEnd}
        previewRouteEnd={previewRouteEnd}
        onSelect={onSelectPendingDelivery}
      />

      {previewRouteEnd && !isNavigationMode ? (
        <Marker
          coordinate={previewRouteEnd}
          anchor={{ x: 0.5, y: 1 }}
          zIndex={4}
          tracksViewChanges={false}
          title={routeEndLabel ?? 'Destino'}
          description="Chegada"
        >
          <RouteCheckpointMarker variant="preview" />
        </Marker>
      ) : null}

      {activeRouteEnd && isNavigationMode ? (
        <Marker
          coordinate={activeRouteEnd}
          anchor={{ x: 0.5, y: 1 }}
          zIndex={4}
          tracksViewChanges={false}
          title={routeEndLabel ?? 'Destino'}
          description="Chegada"
        >
          <RouteCheckpointMarker variant="active" />
        </Marker>
      ) : null}

      {previewPolyline.length > 1 ? (
        <GoogleStyleRoutePolyline coordinates={previewPolyline} variant="preview" />
      ) : null}

      {routePolyline.length > 1 ? (
        <GoogleStyleRoutePolyline coordinates={routePolyline} variant="active" />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFill },
});
