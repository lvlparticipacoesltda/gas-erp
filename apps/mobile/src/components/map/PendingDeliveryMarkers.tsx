import { StyleSheet, Text, View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import {
  formatDistanceMeters,
  formatWaitTime,
  getElapsedWaitingSeconds,
  haversineDistanceMeters,
} from '@gas-erp/shared';
import {
  formatSaleItemsSummary,
  formatSalePaymentsSummary,
} from '../DeliverySaleSummary';
import { deliveryAddress } from '../../lib/deliveries';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';
import type { DriverPosition } from '../../hooks/useDriverLocation';

function formatCurrency(value: number | string | null | undefined): string {
  const n = value == null ? 0 : typeof value === 'number' ? value : Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PendingDeliveryMarkers({
  deliveries,
  driverPosition,
  selectedId,
  highlightedId,
  onSelect,
}: {
  deliveries: Delivery[];
  driverPosition: DriverPosition | null;
  selectedId?: string | null;
  /** Entrega em rota — pin destacado no mapa. */
  highlightedId?: string | null;
  onSelect?: (delivery: Delivery) => void;
}) {
  return (
    <>
      {deliveries.map((delivery) => {
        const dest = delivery.destination;
        if (!dest) return null;

        const isSelected = delivery.id === selectedId;
        const isHighlighted = delivery.id === highlightedId;
        const waitSeconds =
          delivery.elapsedWaitingSeconds
          ?? getElapsedWaitingSeconds(delivery.sale.createdAt ?? delivery.createdAt);
        const distanceMeters = driverPosition
          ? haversineDistanceMeters(
              driverPosition.latitude,
              driverPosition.longitude,
              dest.latitude,
              dest.longitude,
            )
          : null;
        const customerName = delivery.sale.customer?.name ?? 'Cliente';
        const address = deliveryAddress(delivery);
        const pinColor = isHighlighted ? '#16A34A' : isSelected ? '#DC2626' : '#FB5E13';

        return (
          <Marker
            key={delivery.id}
            coordinate={dest}
            pinColor={pinColor}
            onPress={() => onSelect?.(delivery)}
            title={customerName}
            description={`${formatWaitTime(waitSeconds)} · ${distanceMeters != null ? formatDistanceMeters(distanceMeters) : '—'}`}
          >
            <Callout tooltip onPress={() => onSelect?.(delivery)}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{customerName}</Text>
                <Text style={styles.calloutMeta}>
                  Criada há {formatWaitTime(waitSeconds)}
                  {distanceMeters != null ? ` · ${formatDistanceMeters(distanceMeters)}` : ''}
                </Text>
                <Text style={styles.calloutItems} numberOfLines={2}>
                  {formatSaleItemsSummary(delivery.sale)}
                </Text>
                <Text style={styles.calloutPayment} numberOfLines={1}>
                  Pagamento: {formatSalePaymentsSummary(delivery.sale)}
                </Text>
                <Text style={styles.calloutTotal}>
                  {formatCurrency(delivery.sale.total)}
                </Text>
                {address ? (
                  <Text style={styles.calloutAddress} numberOfLines={3}>
                    {address}
                  </Text>
                ) : null}
                <Text style={styles.calloutAction}>Toque para ver detalhes</Text>
              </View>
            </Callout>
          </Marker>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  callout: {
    minWidth: 220,
    maxWidth: 280,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  calloutTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  calloutMeta: { fontSize: 12, fontWeight: '600', color: colors.primary },
  calloutItems: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  calloutPayment: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  calloutTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
  calloutAddress: { fontSize: 11, color: colors.textFaint, marginTop: 4, lineHeight: 15 },
  calloutAction: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 6,
  },
});
