import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { FinishPaymentsModal } from '../FinishPaymentsModal';
import { Loading } from '../ui';
import { ActiveRoutePanel, SelectedDeliveryPanel } from './ActiveRoutePanel';
import { DeliveryPickerSheet } from './DeliveryPickerSheet';
import { DriverMap, type DriverMapRef } from './DriverMap';
import { ManeuverBanner } from './ManeuverBanner';
import { useDeliveryFinishProximity } from '../../hooks/useDeliveryFinishProximity';
import { useEnrichedDeliveryDestinations } from '../../hooks/useEnrichedDeliveryDestinations';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useRouteNavigation } from '../../hooks/useRouteNavigation';
import { useRoutePreview } from '../../hooks/useRoutePreview';
import { useAuth } from '../../lib/auth';
import { updateDeliveryStatus, updateSalePayments } from '../../lib/deliveries';
import { useDeliveriesContext } from '../../lib/deliveries-context';
import { useDelivererAvailability } from '../../lib/deliverer-availability-context';
import {
  cancelDeliveryRouteOnError,
  startDeliveryRoute,
} from '../../lib/start-delivery-route';
import { focusDeliveryRoute } from '../../lib/switch-delivery-route';
import { getActiveDeliveryId, stopDeliveryTracking } from '../../lib/location';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';

function dedupeDeliveries(deliveries: Delivery[]): Delivery[] {
  const seen = new Set<string>();
  return deliveries.filter((delivery) => {
    if (seen.has(delivery.id)) return false;
    seen.add(delivery.id);
    return true;
  });
}

export function DeliveryMapHome() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fabSize = screenWidth * 0.14;
  const fabIconSize = screenWidth * 0.065;
  const { deliveryId: deliveryIdParam } = useLocalSearchParams<{ deliveryId?: string }>();
  const { user, organization, logout } = useAuth();
  const { pending, inProgress, loading, refreshing, error, refresh, getById } =
    useDeliveriesContext();
  const { isUnavailable } = useDelivererAvailability();

  const [navigationDeliveryId, setNavigationDeliveryId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsMinimized, setPaymentsMinimized] = useState(false);
  const mapRef = useRef<DriverMapRef>(null);
  const navigationSyncedRef = useRef(false);

  const actionableDeliveries = useMemo(
    () => dedupeDeliveries([...inProgress, ...pending]),
    [inProgress, pending],
  );

  const navigationDelivery = useMemo(() => {
    if (navigationDeliveryId) {
      const focused = getById(navigationDeliveryId);
      if (focused?.status === 'IN_PROGRESS') return focused;
    }
    return inProgress[0] ?? null;
  }, [navigationDeliveryId, inProgress, getById]);

  const { position: driverPosition } = useDriverLocation(!isUnavailable);
  const routeEnabled = Boolean(navigationDelivery?.status === 'IN_PROGRESS' && !selected);
  const previewEnabled = Boolean(selected && selected.status === 'PENDING');
  const {
    polyline,
    loading: routeLoading,
    error: routeError,
    etaLabel,
    distanceLabel,
    nextManeuver,
  } = useRouteNavigation(
    navigationDelivery?.id ?? null,
    driverPosition,
    routeEnabled,
  );

  const routeDestination = useMemo(() => {
    if (polyline.length === 0) return null;
    return polyline[polyline.length - 1];
  }, [polyline]);

  const { canFinish, finishHint } = useDeliveryFinishProximity(
    navigationDelivery,
    driverPosition,
    routeDestination,
  );

  const {
    polyline: previewPolyline,
    loading: previewLoading,
    error: previewError,
    etaLabel: previewEtaLabel,
    distanceLabel: previewDistanceLabel,
  } = useRoutePreview(
    selected?.id ?? null,
    driverPosition,
    previewEnabled,
  );

  useEffect(() => {
    if (navigationSyncedRef.current) return;
    if (inProgress.length === 0) {
      setNavigationDeliveryId(null);
      navigationSyncedRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      const storedId = await getActiveDeliveryId();
      if (cancelled) return;

      const stored = storedId ? inProgress.find((d) => d.id === storedId) : null;
      setNavigationDeliveryId(stored?.id ?? inProgress[0]?.id ?? null);
      navigationSyncedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [inProgress]);

  useEffect(() => {
    if (!navigationDeliveryId) return;
    const stillActive = inProgress.some((d) => d.id === navigationDeliveryId);
    if (!stillActive && inProgress[0]) {
      setNavigationDeliveryId(inProgress[0].id);
    } else if (!stillActive) {
      setNavigationDeliveryId(null);
    }
  }, [inProgress, navigationDeliveryId]);

  useEffect(() => {
    if (!deliveryIdParam) return;
    const fromParam =
      pending.find((d) => d.id === deliveryIdParam)
      ?? inProgress.find((d) => d.id === deliveryIdParam);
    if (
      fromParam
      && (fromParam.status === 'PENDING' || fromParam.status === 'IN_PROGRESS')
    ) {
      if (fromParam.status === 'IN_PROGRESS') {
        setNavigationDeliveryId(fromParam.id);
        setSelected(null);
      } else {
        setSelected(fromParam);
      }
    }
  }, [deliveryIdParam, pending, inProgress]);

  const deliveriesOnMap = useMemo(
    () => dedupeDeliveries([...pending, ...inProgress]),
    [pending, inProgress],
  );
  const enrichedDeliveriesOnMap = useEnrichedDeliveryDestinations(
    deliveriesOnMap,
    driverPosition,
  );
  const showDeliveriesOverview =
    !routeEnabled && enrichedDeliveriesOnMap.length > 0 && !selected;

  const handleSelectDelivery = useCallback(
    async (delivery: Delivery) => {
      if (delivery.status === 'IN_PROGRESS') {
        if (delivery.id === navigationDelivery?.id) {
          setSelected(null);
          return;
        }

        setBusy(true);
        try {
          await focusDeliveryRoute(delivery);
          setNavigationDeliveryId(delivery.id);
          setSelected(null);
        } catch (err) {
          Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível trocar a rota.');
        } finally {
          setBusy(false);
        }
        return;
      }

      setSelected(delivery);
    },
    [navigationDelivery?.id],
  );

  const handleStartRoute = useCallback(async () => {
    if (!selected) return;

    setBusy(true);
    try {
      await startDeliveryRoute(selected);
      await refresh();
      setNavigationDeliveryId(selected.id);
      setSelected(null);
    } catch (err) {
      await cancelDeliveryRouteOnError();
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível iniciar a rota.');
    } finally {
      setBusy(false);
    }
  }, [selected, refresh]);

  const handleFinishRoute = useCallback(
    async (
      payments: { storePaymentMethodId: string; amount: number }[],
      unitPrice?: number,
    ) => {
      if (!navigationDelivery) return;
      setBusy(true);
      try {
        await updateSalePayments(navigationDelivery.sale.id, payments, unitPrice);
        await updateDeliveryStatus(navigationDelivery.id, 'DELIVERED');
        await stopDeliveryTracking().catch(() => undefined);
        setPaymentsOpen(false);
        setNavigationDeliveryId(null);
        setSelected(null);
        navigationSyncedRef.current = false;
        await refresh();
      } catch (err) {
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [navigationDelivery, refresh],
  );

  const showActivePanel =
    navigationDelivery?.status === 'IN_PROGRESS'
    && !selected
    && !(paymentsOpen && !paymentsMinimized);
  const showSelectedPanel = Boolean(selected);
  const showBottomPanel = showActivePanel || showSelectedPanel;
  const fabCount = actionableDeliveries.length;

  return (
    <View style={styles.root}>
      <DriverMap
        ref={mapRef}
        driverPosition={driverPosition}
        routePolyline={polyline}
        previewPolyline={previewPolyline}
        followDriver={routeEnabled}
        idleFollow={
          !routeEnabled
          && !isUnavailable
          && Boolean(driverPosition)
          && actionableDeliveries.length === 0
        }
        showDeliveriesOverview={showDeliveriesOverview}
        pendingDeliveries={enrichedDeliveriesOnMap}
        selectedDeliveryId={selected?.id}
        activeDeliveryId={navigationDelivery?.id}
        routeEndLabel={
          navigationDelivery?.sale.customer?.name
          ?? selected?.sale.customer?.name
          ?? null
        }
        onSelectPendingDelivery={handleSelectDelivery}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={logout} style={styles.iconButton} hitSlop={8}>
          <Ionicons name="log-out-outline" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.topCenter}>
          {organization?.name ? (
            <Text style={styles.org} numberOfLines={1}>
              {organization.name}
            </Text>
          ) : null}
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? 'entregador'}</Text>
        </View>
        <View style={styles.iconButtonPlaceholder}>
          {driverPosition && !isUnavailable ? (
            <Pressable
              onPress={() => mapRef.current?.recenter()}
              style={styles.iconButton}
              hitSlop={8}
              accessibilityLabel="Ver entregas e sua posição no mapa"
            >
              <Ionicons name="locate" size={22} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {routeEnabled && nextManeuver ? (
        <ManeuverBanner maneuver={nextManeuver} topInset={insets.top + 64} />
      ) : null}

      {isUnavailable ? (
        <View style={[styles.banner, { top: insets.top + 64 }]}>
          <Text style={styles.bannerTitle}>Você está indisponível</Text>
          <Text style={styles.bannerText}>O compartilhamento de localização está pausado.</Text>
        </View>
      ) : null}

      {loading && !driverPosition ? (
        <View style={styles.loadingOverlay}>
          <Loading label="Carregando mapa..." />
        </View>
      ) : null}

      {!isUnavailable && fabCount > 0 ? (
        <Pressable
          style={[
            styles.fab,
            {
              width: fabSize,
              height: fabSize,
              borderRadius: fabSize / 2,
              bottom: showBottomPanel ? 148 : '3%',
            },
          ]}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Ver lista de entregas"
        >
          <Ionicons name="list" size={fabIconSize} color={colors.navy} />
          {fabCount > 0 ? (
            <View
              style={[
                styles.fabBadge,
                {
                  minWidth: fabSize * 0.36,
                  height: fabSize * 0.36,
                  borderRadius: fabSize * 0.18,
                },
              ]}
            >
              <Text style={[styles.fabBadgeText, { fontSize: fabSize * 0.2 }]}>{fabCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {showActivePanel && navigationDelivery ? (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <ActiveRoutePanel
            delivery={navigationDelivery}
            etaLabel={etaLabel}
            distanceLabel={distanceLabel}
            routeLoading={routeLoading}
            routeError={routeError}
            busy={busy}
            canFinish={canFinish}
            finishHint={finishHint}
            onFinish={() => setPaymentsOpen(true)}
          />
        </View>
      ) : showSelectedPanel && selected ? (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <SelectedDeliveryPanel
            delivery={selected}
            busy={busy}
            switchingRoute={Boolean(navigationDelivery)}
            etaLabel={previewEtaLabel}
            distanceLabel={previewDistanceLabel}
            routeLoading={previewLoading}
            routeError={previewError}
            onStart={handleStartRoute}
            onClear={() => setSelected(null)}
          />
        </View>
      ) : null}

      <DeliveryPickerSheet
        visible={pickerOpen}
        inProgress={inProgress}
        pending={pending}
        activeId={navigationDelivery?.id}
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRefresh={refresh}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectDelivery}
      />

      {navigationDelivery ? (
        <FinishPaymentsModal
          visible={paymentsOpen}
          saleId={navigationDelivery.sale.id}
          storeId={navigationDelivery.sale.storeId ?? user?.storeIds[0] ?? ''}
          saleTotal={Number(navigationDelivery.sale.total ?? 0)}
          gasDoPovoBenefit={navigationDelivery.sale.gasDoPovoBenefit}
          itemQuantity={navigationDelivery.sale.items[0]?.quantity ?? 1}
          itemCount={navigationDelivery.sale.items.length}
          initialUnitPrice={
            navigationDelivery.sale.items[0]?.unitPrice != null
              ? Number(navigationDelivery.sale.items[0].unitPrice)
              : undefined
          }
          initialPayments={navigationDelivery.sale.payments}
          onClose={() => {
            setPaymentsOpen(false);
            setPaymentsMinimized(false);
          }}
          onMinimizedChange={setPaymentsMinimized}
          onConfirm={handleFinishRoute}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  topCenter: { flex: 1, alignItems: 'center' },
  org: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greeting: { fontSize: 16, fontWeight: '800', color: colors.text },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconButtonPlaceholder: { width: 44, alignItems: 'center', justifyContent: 'center' },
  banner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  bannerText: { marginTop: 4, fontSize: 12, color: '#B45309' },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 238, 232, 0.6)',
  },
  fab: {
    position: 'absolute',
    right: '4%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FACC15',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 16,
  },
  fabBadge: {
    position: 'absolute',
    top: '-8%',
    right: '-8%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: '8%',
    backgroundColor: colors.primary,
  },
  fabBadgeText: { fontWeight: '800', color: '#FFF' },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
});
