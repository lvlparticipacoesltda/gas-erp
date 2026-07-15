import { StyleSheet, Text, View } from 'react-native';
import {
  formatWaitTime,
  formatCompletedDeliveryPhases,
  getDeliveryDisplayStatus,
  getElapsedWaitingSeconds,
  getRouteDurationSeconds,
  getWaitTimeSeconds,
} from '@gas-erp/shared';
import { CustomerPhoneLink } from './CustomerPhoneLink';
import { DeliveryNotes } from './DeliveryNotes';
import { Badge, Card } from './ui';
import { DeliverySaleSummary } from './DeliverySaleSummary';
import { deliveryAddress } from '../lib/deliveries';
import { colors, spacing } from '../theme';
import type { Delivery } from '../types';

function waitLabel(delivery: Delivery): string {
  if (delivery.status === 'PENDING') {
    const seconds = delivery.elapsedWaitingSeconds ?? getElapsedWaitingSeconds(delivery.sale.createdAt);
    return `Aguardando há ${formatWaitTime(seconds)}`;
  }
  if (delivery.status === 'IN_PROGRESS') {
    const waitPart =
      delivery.waitTimeSeconds != null
        ? `Esperou ${formatWaitTime(delivery.waitTimeSeconds)} · `
        : '';
    const routeSeconds =
      delivery.elapsedRouteSeconds
      ?? (delivery.startedAt ? getElapsedWaitingSeconds(delivery.startedAt) : null);
    return routeSeconds != null ? `${waitPart}Em rota há ${formatWaitTime(routeSeconds)}` : 'Em rota agora';
  }
  if (delivery.status === 'DELIVERED') {
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

export function DeliveryCard({
  delivery,
  onPress,
  highlighted = false,
}: {
  delivery: Delivery;
  onPress: () => void;
  highlighted?: boolean;
}) {
  const display = getDeliveryDisplayStatus({
    status: delivery.status,
    sale: { status: delivery.sale.status },
  });
  const address = deliveryAddress(delivery);
  const wait = waitLabel(delivery);

  return (
    <Card onPress={onPress} style={[styles.card, highlighted && styles.cardHighlighted]}>
      <View style={styles.header}>
        <Badge label={display.label} tone={display.tone} />
        {wait ? <Text style={styles.wait}>{wait}</Text> : null}
      </View>
      <Text style={styles.customer}>{delivery.sale.customer?.name ?? 'Cliente não identificado'}</Text>
      <CustomerPhoneLink phone={delivery.sale.customer?.phone} />
      {address ? (
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      ) : null}
      <DeliveryNotes notes={delivery.sale.notes} numberOfLines={2} />
      <DeliverySaleSummary sale={delivery.sale} compact />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wait: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  customer: { fontSize: 16, fontWeight: '700', color: colors.text },
  address: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
