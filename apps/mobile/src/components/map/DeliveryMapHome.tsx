import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { FinishPaymentsModal } from '../FinishPaymentsModal';
import { Loading } from '../ui';
import { ActiveRoutePanel, SelectedDeliveryPanel } from './ActiveRoutePanel';
import { DeliveryPickerSheet } from './DeliveryPickerSheet';
import { DriverMap, type DriverMapRef } from './DriverMap';
import { ManeuverBanner } from './ManeuverBanner';
import { StoreHomePickerSheet } from './StoreHomePickerSheet';
import { StoreHomeRoutePanel } from './StoreHomeRoutePanel';
import { useDeliveryFinishProximity } from '../../hooks/useDeliveryFinishProximity';
import { useEnrichedDeliveryDestinations } from '../../hooks/useEnrichedDeliveryDestinations';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useRouteNavigation } from '../../hooks/useRouteNavigation';
import { useRoutePreview } from '../../hooks/useRoutePreview';
import { useStoreHomeNavigation } from '../../hooks/useStoreHomeNavigation';
import { useVoiceGuidance } from '../../hooks/useVoiceGuidance';
import { useAuth } from '../../lib/auth';
import { deliveryAddress, buildNavigationAddress, updateDeliveryStatus, updateSalePayments } from '../../lib/deliveries';
import { useDeliveriesContext } from '../../lib/deliveries-context';
import { useDelivererAvailability } from '../../lib/deliverer-availability-context';
import {
  cancelDeliveryRouteOnError,
  startDeliveryRoute,
} from '../../lib/start-delivery-route';
import { focusDeliveryRoute } from '../../lib/switch-delivery-route';
import { getActiveDeliveryId, stopDeliveryTracking } from '../../lib/location';
import { clearCachedRoute } from '../../lib/offline-cache';
import { openGoogleMaps, openWaze } from '../../lib/navigation';
import { assertStoreNavigable, fetchMyStores, toStoreDestination } from '../../lib/store-home';
import { makeStyles, radius, spacing, useColors } from '../../theme';
import type { Delivery } from '../../types';
import type { DelivererMeStore } from '@gas-erp/shared';

/** Tag própria: evita que outro ponto do app libere a tela no meio da rota. */
const KEEP_AWAKE_TAG = 'delivery-navigation';

function dedupeDeliveries(deliveries: Delivery[]): Delivery[] {
  const seen = new Set<string>();
  return deliveries.filter((delivery) => {
    if (seen.has(delivery.id)) return false;
    seen.add(delivery.id);
    return true;
  });
}

export function DeliveryMapHome() {
  const styles = useStyles();
  const colors = useColors();
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
  const [homeBusy, setHomeBusy] = useState(false);
  const [homeStores, setHomeStores] = useState<DelivererMeStore[]>([]);
  const [homePickerOpen, setHomePickerOpen] = useState(false);
  const [homeStore, setHomeStore] = useState<DelivererMeStore | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
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

  const homeMode = Boolean(homeStore);
  const routeEnabled = Boolean(
    !homeMode && navigationDelivery?.status === 'IN_PROGRESS' && !selected,
  );
  const navigationFollow = routeEnabled || homeMode;
  // Precisão alta só enquanto navega: turn-by-turn não se sustenta com ~100 m
  // de incerteza, mas manter o GPS nesse modo o dia todo torra a bateria.
  const { position: driverPosition } = useDriverLocation(!isUnavailable, navigationFollow);
  // A tela apagando a cada 30 s inviabiliza o uso no suporte da moto — mas só
  // durante a rota: fora dela, manter o aparelho aceso torraria a bateria do
  // turno inteiro. `useKeepAwake` não serve aqui porque vale enquanto a tela
  // existir, e o mapa é a tela inicial do app.
  useEffect(() => {
    if (!navigationFollow) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [navigationFollow]);

  const previewEnabled = Boolean(!homeMode && selected && selected.status === 'PENDING');
  const {
    polyline: deliveryPolyline,
    loading: routeLoading,
    error: routeError,
    etaLabel,
    distanceLabel,
    nextManeuver: deliveryManeuver,
    arrived: deliveryArrived,
  } = useRouteNavigation(
    navigationDelivery?.id ?? null,
    driverPosition,
    routeEnabled,
  );

  const {
    polyline: homePolyline,
    loading: homeRouteLoading,
    error: homeRouteError,
    etaLabel: homeEtaLabel,
    distanceLabel: homeDistanceLabel,
    nextManeuver: homeManeuver,
    arrived: homeArrived,
  } = useStoreHomeNavigation(
    homeStore?.id ?? null,
    driverPosition,
    homeMode,
  );

  const polyline = homeMode ? homePolyline : deliveryPolyline;
  const nextManeuver = homeMode ? homeManeuver : deliveryManeuver;
  const arrived = homeMode ? homeArrived : deliveryArrived;

  const { muted: voiceMuted, toggleMuted: toggleVoice } = useVoiceGuidance({
    maneuver: nextManeuver,
    arrived,
    enabled: navigationFollow,
  });

  /** Seguimento pausado por gesto — sem sinalizar isso, a câmera parece travada. */
  const [followPaused, setFollowPaused] = useState(false);

  const routeDestination = useMemo(() => {
    if (polyline.length === 0) return null;
    return polyline[polyline.length - 1];
  }, [polyline]);

  const { canFinish, needsConfirmAway, finishHint } = useDeliveryFinishProximity(
    homeMode ? null : navigationDelivery,
    driverPosition,
    routeDestination,
  );

  const handleRequestFinish = useCallback(() => {
    if (!canFinish) return;
    if (!needsConfirmAway) {
      setPaymentsOpen(true);
      return;
    }
    Alert.alert(
      'Confirmar conclusão',
      finishHint
        ?? 'Não foi possível confirmar que você está perto do endereço. Deseja concluir a entrega mesmo assim?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Concluir', onPress: () => setPaymentsOpen(true) },
      ],
    );
  }, [canFinish, needsConfirmAway, finishHint]);

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
    !navigationFollow && enrichedDeliveriesOnMap.length > 0 && !selected;

  const activateHomeStore = useCallback((store: DelivererMeStore) => {
    if (!assertStoreNavigable(store)) return;
    setSelected(null);
    setHomePickerOpen(false);
    setHomeStore(store);
  }, []);

  const clearHomeMode = useCallback(() => {
    setHomeStore(null);
  }, []);

  const handleSelectDelivery = useCallback(
    async (delivery: Delivery) => {
      clearHomeMode();

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
    [navigationDelivery?.id, clearHomeMode],
  );

  const handleStartRoute = useCallback(async () => {
    if (!selected) return;

    setBusy(true);
    try {
      clearHomeMode();
      await startDeliveryRoute(selected);
      await refresh();
      setNavigationDeliveryId(selected.id);
      setSelected(null);
    } catch (err) {
      await cancelDeliveryRouteOnError();
      // Em campo, "Erro / OK" não diz se foi internet, permissão ou pedido já
      // pego por outro — e sem ação de repetir o entregador liga para a loja.
      Alert.alert(
        'Não foi possível iniciar a rota',
        err instanceof Error ? err.message : 'Verifique sua conexão e tente novamente.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Tentar de novo', onPress: () => void handleStartRoute() },
        ],
      );
    } finally {
      setBusy(false);
    }
  }, [selected, refresh, clearHomeMode]);

  const handleFinishRoute = useCallback(
    async (payload: {
      payments: { storePaymentMethodId: string; amount: number }[];
      itemUnitPrices?: { id: string; unitPrice: number }[];
      itemPayments?: { id: string; storePaymentMethodId: string }[];
      deliveryFeeStorePaymentMethodId?: string | null;
    }) => {
      if (!navigationDelivery) return;
      setBusy(true);
      try {
        await updateSalePayments(navigationDelivery.sale.id, payload.payments, {
          itemUnitPrices: payload.itemUnitPrices,
          itemPayments: payload.itemPayments,
          deliveryFeeStorePaymentMethodId: payload.deliveryFeeStorePaymentMethodId,
        });
        await updateDeliveryStatus(navigationDelivery.id, 'DELIVERED');
        await stopDeliveryTracking().catch(() => undefined);
        // Entrega concluída: a rota salva não serve mais e não deve reaparecer.
        await clearCachedRoute(navigationDelivery.id);
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

  const showHomePanel = homeMode;
  const showActivePanel =
    !homeMode
    && navigationDelivery?.status === 'IN_PROGRESS'
    && !selected
    && !paymentsOpen;
  const showSelectedPanel = Boolean(!homeMode && selected);
  const fabCount = actionableDeliveries.length;
  /** Posição fixa dos FABs — não muda ao ativar Home / painéis. */
  const fabBottom = 210;

  const openDeliveryExternalNav = useCallback(
    (app: 'maps' | 'waze') => {
      if (!navigationDelivery) return;
      const address =
        buildNavigationAddress(navigationDelivery.sale)
        || deliveryAddress(navigationDelivery);
      // Sempre preferir o texto do endereço cadastrado. Coordenadas do Nominatim
      // frequentemente erram o número da casa (ex.: 20 → pin no 1320).
      const dest = {
        address,
        latitude: null as number | null,
        longitude: null as number | null,
      };
      if (app === 'maps') void openGoogleMaps(dest);
      else void openWaze(dest);
    },
    [navigationDelivery],
  );

  const openHomeExternalNav = useCallback(
    (app: 'maps' | 'waze') => {
      if (!homeStore) return;
      const dest = toStoreDestination(homeStore);
      if (app === 'maps') void openGoogleMaps(dest);
      else void openWaze(dest);
    },
    [homeStore],
  );

  /**
   * O logout fica no canto onde o polegar esbarra ao segurar o aparelho, e sair
   * derruba o rastreamento no meio da rota. Confirmação é barata perto disso.
   */
  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sair da conta',
      navigationDelivery
        ? 'Você está com uma entrega em rota. Sair encerra o rastreamento.'
        : 'Deseja encerrar a sessão neste aparelho?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => void logout() },
      ],
    );
  }, [logout, navigationDelivery]);

  const handleNavigateHome = useCallback(async () => {
    if (homeBusy) return;

    if (homeStore) {
      clearHomeMode();
      return;
    }

    setHomeBusy(true);
    try {
      const stores = await fetchMyStores();
      if (stores.length === 0) {
        Alert.alert(
          'Nenhuma loja',
          'Você não está vinculado a nenhuma unidade. Contate a loja ou o master.',
        );
        return;
      }
      if (stores.length === 1) {
        activateHomeStore(stores[0]);
        return;
      }
      setHomeStores(stores);
      setHomePickerOpen(true);
    } catch (err) {
      Alert.alert(
        'Erro',
        err instanceof Error ? err.message : 'Não foi possível carregar as lojas.',
      );
    } finally {
      setHomeBusy(false);
    }
  }, [homeBusy, homeStore, clearHomeMode, activateHomeStore]);

  return (
    <View style={styles.root}>
      <DriverMap
        ref={mapRef}
        driverPosition={driverPosition}
        routePolyline={polyline}
        previewPolyline={previewPolyline}
        followDriver={navigationFollow}
        idleFollow={
          !navigationFollow
          && !isUnavailable
          && Boolean(driverPosition)
          && actionableDeliveries.length === 0
        }
        showDeliveriesOverview={showDeliveriesOverview}
        pendingDeliveries={enrichedDeliveriesOnMap}
        selectedDeliveryId={selected?.id}
        activeDeliveryId={homeMode ? null : navigationDelivery?.id}
        routeEndLabel={
          homeMode
            ? homeStore?.name ?? 'Base'
            : navigationDelivery?.sale.customer?.name
              ?? selected?.sale.customer?.name
              ?? null
        }
        onSelectPendingDelivery={handleSelectDelivery}
        onFollowPausedChange={setFollowPaused}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topSide}>
        <Pressable
          onPress={handleLogout}
          style={styles.iconButton}
          hitSlop={8}
          accessibilityLabel="Sair da conta"
        >
          <Ionicons name="log-out-outline" size={22} color={colors.text} />
        </Pressable>
        </View>
        <View style={styles.topCenter}>
          {organization?.name ? (
            <Text style={styles.org} numberOfLines={1}>
              {organization.name}
            </Text>
          ) : null}
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? 'entregador'}</Text>
        </View>
        <View style={[styles.topSide, styles.topSideRight]}>
          {navigationFollow ? (
            <Pressable
              onPress={toggleVoice}
              style={styles.iconButton}
              hitSlop={8}
              accessibilityLabel={voiceMuted ? 'Ativar guiagem por voz' : 'Silenciar guiagem por voz'}
              accessibilityState={{ selected: !voiceMuted }}
            >
              <Ionicons
                name={voiceMuted ? 'volume-mute' : 'volume-high'}
                size={22}
                color={voiceMuted ? colors.textMuted : colors.primaryDark}
              />
            </Pressable>
          ) : null}
          {driverPosition && !isUnavailable ? (
            <Pressable
              onPress={() => mapRef.current?.recenter()}
              style={styles.iconButton}
              hitSlop={8}
              accessibilityLabel="Ver entregas e sua posição no mapa"
            >
              <Ionicons name="locate" size={22} color={colors.primaryDark} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {navigationFollow && nextManeuver ? (
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

      <Pressable
        style={[
          styles.homeFab,
          homeMode && styles.homeFabActive,
          {
            width: fabSize,
            height: fabSize,
            borderRadius: fabSize / 2,
            bottom: fabBottom,
            opacity: homeBusy ? 0.7 : 1,
          },
        ]}
        onPress={() => void handleNavigateHome()}
        disabled={homeBusy}
        accessibilityLabel={homeMode ? 'Sair da rota até a base' : 'Traçar rota até a loja'}
        accessibilityState={{ selected: homeMode }}
      >
        <Ionicons
          name="home"
          size={fabIconSize}
          color={homeMode ? colors.primaryText : colors.navy}
        />
        {homeMode ? (
          <View style={styles.homeFabDot} />
        ) : null}
      </Pressable>

      {!isUnavailable && fabCount > 0 ? (
        <Pressable
          style={[
            styles.fab,
            {
              width: fabSize,
              height: fabSize,
              borderRadius: fabSize / 2,
              bottom: fabBottom,
            },
          ]}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Ver lista de entregas"
        >
          <Ionicons name="list" size={fabIconSize} color="#1C140C" />
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

      {/* Arrastar o mapa pausa o seguimento. Sem dizer isso, o entregador fica
          esperando a câmera voltar sozinha; o chip fica na zona do polegar,
          não no ícone pequeno do topo. */}
      {followPaused && navigationFollow && driverPosition ? (
        <Pressable
          style={[styles.recenterChip, { bottom: fabBottom + fabSize + spacing.md }]}
          onPress={() => mapRef.current?.recenter()}
          accessibilityLabel="Voltar a seguir sua posição"
        >
          <Ionicons name="navigate" size={16} color={colors.primaryText} />
          <Text style={styles.recenterText}>Recentralizar</Text>
        </Pressable>
      ) : null}

      {/* Sem entregas, a tela ficava muda: nada confirmava que o app estava
          funcionando e que a loja o enxerga como disponível. */}
      {!loading && !isUnavailable && actionableDeliveries.length === 0 && !homeMode ? (
        <View style={[styles.emptyCard, { bottom: fabBottom - 120 }]} pointerEvents="none">
          <Text style={styles.emptyTitle}>Nenhuma entrega no momento</Text>
          <Text style={styles.emptyText}>
            Você está disponível — a loja verá sua posição ao despachar um pedido.
          </Text>
        </View>
      ) : null}

      {showHomePanel && homeStore ? (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <StoreHomeRoutePanel
            storeName={homeStore.name}
            etaLabel={homeEtaLabel}
            distanceLabel={homeDistanceLabel}
            routeLoading={homeRouteLoading}
            routeError={homeRouteError}
            onOpenGoogleMaps={() => openHomeExternalNav('maps')}
            onOpenWaze={() => openHomeExternalNav('waze')}
          />
        </View>
      ) : showActivePanel && navigationDelivery ? (
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
            arrived={arrived}
            onFinish={handleRequestFinish}
            onOpenGoogleMaps={() => openDeliveryExternalNav('maps')}
            onOpenWaze={() => openDeliveryExternalNav('waze')}
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

      <StoreHomePickerSheet
        visible={homePickerOpen}
        stores={homeStores}
        onClose={() => setHomePickerOpen(false)}
        onSelect={activateHomeStore}
      />

      {navigationDelivery ? (
        <FinishPaymentsModal
          visible={paymentsOpen}
          saleId={navigationDelivery.sale.id}
          storeId={navigationDelivery.sale.storeId ?? user?.storeIds[0] ?? ''}
          saleTotal={Number(navigationDelivery.sale.total ?? 0)}
          deliveryFee={Number(navigationDelivery.sale.deliveryFee ?? 0)}
          gasDoPovoBenefit={navigationDelivery.sale.gasDoPovoBenefit}
          initialPayments={navigationDelivery.sale.payments}
          items={navigationDelivery.sale.items.map((item) => ({
            id: item.id,
            label: item.product.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice ?? 0),
            storePaymentMethodId: item.storePaymentMethodId,
            productType: item.product.productType,
          }))}
          deliveryFeeStorePaymentMethodId={
            navigationDelivery.sale.deliveryFeeStorePaymentMethodId
          }
          onClose={() => {
            setPaymentsOpen(false);
          }}
          onConfirm={handleFinishRoute}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  /**
   * Laterais de largura fixa e igual — dois botões de 44 mais o intervalo.
   *
   * Com `flex: 1` só no centro, a saudação era empurrada para a esquerda porque a
   * direita ficou mais larga que a esquerda ao ganhar o botão de voz. Pior: o
   * botão só existe em navegação, então o título saltaria de lugar ao iniciar a
   * rota. Fixando as duas laterais, o centro é o centro da tela em qualquer estado.
   */
  topSide: {
    width: 44 * 2 + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topSideRight: { justifyContent: 'flex-end' },
  recenterChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 18,
  },
  recenterText: { fontSize: 15, fontWeight: '800', color: colors.primaryText },
  emptyCard: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyText: { marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  banner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: colors.warningText },
  bannerText: { marginTop: 4, fontSize: 12, color: colors.warningText },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  fab: {
    position: 'absolute',
    right: '4%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fab,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 16,
  },
  homeFab: {
    position: 'absolute',
    left: '4%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 16,
  },
  homeFabActive: {
    backgroundColor: colors.primary,
    borderColor: '#FFFFFF',
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  homeFabDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
}));
