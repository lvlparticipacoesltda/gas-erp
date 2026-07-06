import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { FinishPaymentsModal } from '../FinishPaymentsModal';
import { Loading } from '../ui';
import { ActiveRoutePanel, SelectedDeliveryPanel } from './ActiveRoutePanel';
import { DeliveryPickerSheet } from './DeliveryPickerSheet';
import { DriverMap } from './DriverMap';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useRouteNavigation } from '../../hooks/useRouteNavigation';
import { useRoutePreview } from '../../hooks/useRoutePreview';
import { useAuth } from '../../lib/auth';
import { deliveryAddress, updateDeliveryStatus, updateSalePayments } from '../../lib/deliveries';
import { useDeliveriesContext } from '../../lib/deliveries-context';
import { useDelivererAvailability } from '../../lib/deliverer-availability-context';
import { openGoogleMaps, openWaze } from '../../lib/navigation';
import {
  cancelDeliveryRouteOnError,
  startDeliveryRoute,
} from '../../lib/start-delivery-route';
import { stopDeliveryTracking } from '../../lib/location';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';

export function DeliveryMapHome() {
  const insets = useSafeAreaInsets();
  const { deliveryId: deliveryIdParam } = useLocalSearchParams<{ deliveryId?: string }>();
  const { user, organization, logout } = useAuth();
  const { pending, inProgress, loading, refreshing, error, refresh, hasActiveRoute } =
    useDeliveriesContext();
  const { isUnavailable } = useDelivererAvailability();

  const activeDelivery = inProgress[0] ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const { position: driverPosition } = useDriverLocation(!isUnavailable);
  const routeEnabled = Boolean(activeDelivery?.status === 'IN_PROGRESS');
  const previewEnabled = Boolean(selected && !activeDelivery);
  const {
    polyline,
    loading: routeLoading,
    error: routeError,
    etaLabel,
    distanceLabel,
  } = useRouteNavigation(
    activeDelivery?.id ?? null,
    driverPosition,
    routeEnabled,
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
    if (!deliveryIdParam) return;
    const fromParam =
      pending.find((d) => d.id === deliveryIdParam)
      ?? inProgress.find((d) => d.id === deliveryIdParam);
    if (fromParam) setSelected(fromParam);
  }, [deliveryIdParam, pending, inProgress]);

  const mapDestination = useMemo(() => {
    if (activeDelivery?.destination) return activeDelivery.destination;
    if (selected?.destination) return selected.destination;
    return null;
  }, [activeDelivery, selected]);

  const deliveriesOnMap = useMemo(() => {
    const list = [...pending];
    if (activeDelivery?.destination && !list.some((d) => d.id === activeDelivery.id)) {
      list.push(activeDelivery);
    }
    return list;
  }, [pending, activeDelivery]);

  const handleStartRoute = useCallback(async () => {
    if (!selected) return;
    if (hasActiveRoute) {
      Alert.alert(
        'Rota em andamento',
        'Você já tem uma entrega em rota. Conclua-a antes de iniciar outra.',
      );
      return;
    }

    setBusy(true);
    try {
      await startDeliveryRoute(selected);
      await refresh();
      setSelected(null);
    } catch (err) {
      await cancelDeliveryRouteOnError();
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível iniciar a rota.');
    } finally {
      setBusy(false);
    }
  }, [selected, hasActiveRoute, refresh]);

  const handleFinishRoute = useCallback(
    async (
      payments: { storePaymentMethodId: string; amount: number }[],
      unitPrice?: number,
    ) => {
      if (!activeDelivery) return;
      setBusy(true);
      try {
        await updateSalePayments(activeDelivery.sale.id, payments, unitPrice);
        await updateDeliveryStatus(activeDelivery.id, 'DELIVERED');
        await stopDeliveryTracking().catch(() => undefined);
        setPaymentsOpen(false);
        await refresh();
      } catch (err) {
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [activeDelivery, refresh],
  );

  const addressForNav = activeDelivery ? deliveryAddress(activeDelivery) : '';

  return (
    <View style={styles.root}>
      <DriverMap
        driverPosition={driverPosition}
        destination={mapDestination}
        routePolyline={polyline}
        previewPolyline={previewPolyline}
        followDriver={routeEnabled}
        pendingDeliveries={deliveriesOnMap}
        selectedDeliveryId={selected?.id}
        activeDeliveryId={activeDelivery?.id}
        onSelectPendingDelivery={(delivery) => {
          setSelected(delivery);
          setPickerOpen(false);
        }}
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
        <View style={styles.iconButtonPlaceholder} />
      </View>

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

      {!activeDelivery && !selected ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 100 }]}
          onPress={() => setPickerOpen(true)}
        >
          <Ionicons name="list" size={24} color={colors.navy} />
          {pending.length > 0 ? (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{pending.length}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {activeDelivery ? (
        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom }]}>
          <ActiveRoutePanel
            delivery={activeDelivery}
            etaLabel={etaLabel}
            distanceLabel={distanceLabel}
            routeLoading={routeLoading}
            routeError={routeError}
            busy={busy}
            onFinish={() => setPaymentsOpen(true)}
            onOpenGoogleMaps={() => addressForNav && openGoogleMaps(addressForNav)}
            onOpenWaze={() => addressForNav && openWaze(addressForNav)}
          />
        </View>
      ) : selected ? (
        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom }]}>
          <SelectedDeliveryPanel
            delivery={selected}
            busy={busy}
            hasActiveRoute={hasActiveRoute}
            etaLabel={previewEtaLabel}
            distanceLabel={previewDistanceLabel}
            routeLoading={previewLoading}
            routeError={previewError}
            onStart={handleStartRoute}
            onClear={() => setSelected(null)}
          />
        </View>
      ) : (
        <View style={[styles.idleBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable style={styles.connectBtn} onPress={() => setPickerOpen(true)}>
            <Text style={styles.connectText}>
              {pending.length > 0 ? `Ver ${pending.length} entrega(s)` : 'Aguardando entregas'}
            </Text>
          </Pressable>
        </View>
      )}

      <DeliveryPickerSheet
        visible={pickerOpen}
        pending={pending}
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRefresh={refresh}
        onClose={() => setPickerOpen(false)}
        onSelect={setSelected}
      />

      {activeDelivery ? (
        <FinishPaymentsModal
          visible={paymentsOpen}
          saleId={activeDelivery.sale.id}
          storeId={activeDelivery.sale.storeId ?? user?.storeIds[0] ?? ''}
          saleTotal={Number(activeDelivery.sale.total ?? 0)}
          gasDoPovoBenefit={activeDelivery.sale.gasDoPovoBenefit}
          itemQuantity={activeDelivery.sale.items[0]?.quantity ?? 1}
          initialUnitPrice={
            activeDelivery.sale.items[0]?.unitPrice != null
              ? Number(activeDelivery.sale.items[0].unitPrice)
              : undefined
          }
          initialPayments={activeDelivery.sale.payments}
          onClose={() => setPaymentsOpen(false)}
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
  iconButtonPlaceholder: { width: 44 },
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
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fabBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  idleBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
  },
  connectBtn: {
    backgroundColor: '#FACC15',
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  connectText: { fontSize: 17, fontWeight: '800', color: colors.navy },
});
