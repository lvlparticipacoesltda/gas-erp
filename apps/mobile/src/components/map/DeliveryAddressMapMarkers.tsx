import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Marker } from 'react-native-maps';
import type { LatLng } from '@gas-erp/shared';
import { shortDeliveryAddress } from '../../lib/deliveries';
import { colors, radius, spacing } from '../../theme';
import type { Delivery, DeliveryDestination } from '../../types';

export function DeliveryAddressPill({
  delivery,
  active,
  onPress,
}: {
  delivery: Delivery;
  active: boolean;
  onPress: () => void;
}) {
  const inRoute = delivery.status === 'IN_PROGRESS';
  const customerName = delivery.sale.customer?.name?.split(' ')[0] ?? 'Cliente';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityLabel={`Entrega para ${customerName}: ${shortDeliveryAddress(delivery)}`}
    >
      <View style={[styles.iconWrap, inRoute && styles.iconWrapActive]}>
        <Ionicons
          name={inRoute ? 'navigate' : 'location'}
          size={16}
          color={inRoute ? '#FFFFFF' : colors.primary}
        />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.customer} numberOfLines={1}>
          {customerName}
          {inRoute ? ' · em rota' : ''}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {shortDeliveryAddress(delivery)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function resolveMarkerCoordinate(
  delivery: Delivery,
  activeDeliveryId: string | null | undefined,
  selectedDeliveryId: string | null | undefined,
  activeRouteEnd: LatLng | null,
  previewRouteEnd: LatLng | null,
  extraCoordinates: Record<string, LatLng>,
): DeliveryDestination | null {
  if (delivery.id === activeDeliveryId && activeRouteEnd) return activeRouteEnd;
  if (delivery.id === selectedDeliveryId && previewRouteEnd) return previewRouteEnd;
  return delivery.destination ?? extraCoordinates[delivery.id] ?? null;
}

export function DeliveryAddressMapMarkers({
  deliveries,
  activeId,
  selectedId,
  activeRouteEnd,
  previewRouteEnd,
  extraCoordinates = {},
  onSelect,
}: {
  deliveries: Delivery[];
  activeId?: string | null;
  selectedId?: string | null;
  activeRouteEnd?: LatLng | null;
  previewRouteEnd?: LatLng | null;
  extraCoordinates?: Record<string, LatLng>;
  onSelect?: (delivery: Delivery) => void;
}) {
  return (
    <>
      {deliveries.map((delivery) => {
        const coordinate = resolveMarkerCoordinate(
          delivery,
          activeId,
          selectedId,
          activeRouteEnd ?? null,
          previewRouteEnd ?? null,
          extraCoordinates,
        );
        if (!coordinate) return null;

        const active = delivery.id === activeId || delivery.id === selectedId;

        return (
          <Marker
            key={`address-pill-${delivery.id}`}
            coordinate={coordinate}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={active ? 6 : 5}
            tracksViewChanges
            onPress={() => onSelect?.(delivery)}
          >
            <View style={styles.markerWrap} collapsable={false}>
              <DeliveryAddressPill
                delivery={delivery}
                active={active}
                onPress={() => onSelect?.(delivery)}
              />
              <View style={[styles.tail, active && styles.tailActive]} />
            </View>
          </Marker>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  markerWrap: {
    alignItems: 'center',
    maxWidth: 280,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 280,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  pillActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.success,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  customer: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  address: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.border,
  },
  tailActive: {
    borderTopColor: colors.primary,
  },
});
