import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatCompletedDeliveryPhases,
  getDeliveryDisplayStatus,
} from '@gas-erp/shared';
import { CustomerPhoneLink } from '@/components/CustomerPhoneLink';
import { DeliveryNotes } from '@/components/DeliveryNotes';
import { DeliverySaleSummary } from '@/components/DeliverySaleSummary';
import { DestinationMarker } from '@/components/map/DestinationMarker';
import { useDriverMarkerTracksViewChanges } from '@/components/map/DriverMarker';
import { Badge, Loading } from '@/components/ui';
import { deliveryAddress, fetchDeliveryTracking } from '@/lib/deliveries';
import { colors, radius, spacing } from '@/theme';
import type { Delivery, DeliveryDestination, TrackingPoint } from '@/types';

const DEFAULT_REGION: Region = {
  latitude: -23.9608,
  longitude: -46.3336,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

function regionForCoordinate(coordinate: DeliveryDestination): Region {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };
}

function timingLabel(delivery: Delivery): string {
  if (delivery.status === 'DELIVERED') {
    return formatCompletedDeliveryPhases({
      waitTimeSeconds: delivery.waitTimeSeconds,
      routeDurationSeconds: delivery.routeDurationSeconds,
      saleCreatedAt: delivery.sale.createdAt,
      deliveryStartedAt: delivery.startedAt,
      deliveryCompletedAt: delivery.completedAt,
    });
  }
  if (delivery.status === 'CANCELLED' && delivery.startedAt) {
    return formatCompletedDeliveryPhases({
      waitTimeSeconds: delivery.waitTimeSeconds,
      routeDurationSeconds: delivery.routeDurationSeconds,
      saleCreatedAt: delivery.sale.createdAt,
      deliveryStartedAt: delivery.startedAt,
      deliveryCompletedAt: delivery.completedAt,
    });
  }
  return '';
}

export function DeliveryHistoryDetail({ delivery }: { delivery: Delivery }) {
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const mapHeight = screenHeight * 0.4;
  const mapRef = useRef<MapView>(null);

  const [trackingPoints, setTrackingPoints] = useState<TrackingPoint[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const display = getDeliveryDisplayStatus({
    status: delivery.status,
    sale: { status: delivery.sale.status },
  });
  const address = deliveryAddress(delivery);
  const timing = timingLabel(delivery);
  const mapDestination = delivery.destination ?? null;

  const initialRegion = useMemo(
    () => (mapDestination ? regionForCoordinate(mapDestination) : DEFAULT_REGION),
    [mapDestination?.latitude, mapDestination?.longitude],
  );

  const routeCoords = useMemo(
    () =>
      trackingPoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [trackingPoints],
  );

  useEffect(() => {
    let cancelled = false;
    setTrackingLoading(true);
    setTrackingError(null);
    fetchDeliveryTracking(delivery.id)
      .then((points) => {
        if (!cancelled) setTrackingPoints(points);
      })
      .catch((err) => {
        if (!cancelled) {
          setTrackingPoints([]);
          setTrackingError(
            err instanceof Error ? err.message : 'Não foi possível carregar o percurso',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTrackingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [delivery.id]);

  useEffect(() => {
    if (!mapRef.current || trackingLoading) return;

    const coords = [...routeCoords];
    if (mapDestination) {
      coords.push(mapDestination);
    }
    if (coords.length === 0) return;

    if (coords.length === 1) {
      mapRef.current.animateToRegion(regionForCoordinate(coords[0]), 400);
      return;
    }

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [routeCoords, mapDestination, trackingLoading]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalhe da corrida</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled
          pitchEnabled={false}
          scrollEnabled
          zoomEnabled
        >
          {routeCoords.length > 1 ? (
            <Polyline
              coordinates={routeCoords}
              strokeColor={colors.primary}
              strokeWidth={4}
            />
          ) : null}

          {mapDestination ? (
            <HistoryDestinationMarker coordinate={mapDestination} />
          ) : null}
        </MapView>

        {trackingLoading ? (
          <View style={styles.mapOverlay}>
            <Loading label="Carregando percurso..." />
          </View>
        ) : null}

        {!trackingLoading && routeCoords.length === 0 ? (
          <View style={styles.mapNotice} pointerEvents="none">
            <Text style={styles.mapNoticeText}>
              {trackingError
                ?? (!mapDestination
                  ? 'Percurso e destino não registrados'
                  : 'Percurso não registrado')}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.meta}>
          <Badge label={display.label} tone={display.tone} />
          {timing ? <Text style={styles.timing}>{timing}</Text> : null}
        </View>

        <Text style={styles.customer}>
          {delivery.sale.customer?.name ?? 'Cliente não identificado'}
        </Text>

        <CustomerPhoneLink phone={delivery.sale.customer?.phone} />

        {address ? (
          <Text style={styles.address}>{address}</Text>
        ) : null}

        <DeliveryNotes notes={delivery.sale.notes} />

        <DeliverySaleSummary sale={delivery.sale} />
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryDestinationMarker({ coordinate }: { coordinate: DeliveryDestination }) {
  const tracksViewChanges = useDriverMarkerTracksViewChanges(
    coordinate.latitude,
    coordinate.longitude,
    null,
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      title="Destino"
    >
      <DestinationMarker emphasized />
    </Marker>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  headerSpacer: { width: 40 },
  mapWrap: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  map: { ...StyleSheet.absoluteFill },
  mapOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(244, 238, 232, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  mapNotice: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapNoticeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timing: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'right',
  },
  customer: { fontSize: 18, fontWeight: '800', color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
});
