import { StyleSheet, Text, View } from 'react-native';
import {
  formatWaitTime,
  getDeliveryDisplayStatus,
  getElapsedWaitingSeconds,
} from '@gas-erp/shared';
import { Badge, Card } from './ui';
import { deliveryAddress } from '../lib/deliveries';
import { colors, spacing } from '../theme';
import type { Delivery } from '../types';

function itemsSummary(delivery: Delivery): string {
  return delivery.sale.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
}

function waitLabel(delivery: Delivery): string {
  if (delivery.status === 'PENDING') {
    const seconds = delivery.elapsedWaitingSeconds ?? getElapsedWaitingSeconds(delivery.sale.createdAt);
    return `Aguardando há ${formatWaitTime(seconds)}`;
  }
  if (delivery.status === 'IN_PROGRESS') {
    return 'Em rota agora';
  }
  if (delivery.status === 'DELIVERED' && delivery.waitTimeSeconds != null) {
    return `Espera até a rota: ${formatWaitTime(delivery.waitTimeSeconds)}`;
  }
  return '';
}

export function DeliveryCard({
  delivery,
  onPress,
}: {
  delivery: Delivery;
  onPress: () => void;
}) {
  const display = getDeliveryDisplayStatus({
    status: delivery.status,
    sale: { status: delivery.sale.status },
  });
  const address = deliveryAddress(delivery);
  const wait = waitLabel(delivery);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Badge label={display.label} tone={display.tone} />
        {wait ? <Text style={styles.wait}>{wait}</Text> : null}
      </View>
      <Text style={styles.customer}>{delivery.sale.customer?.name ?? 'Cliente não identificado'}</Text>
      {address ? (
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      ) : null}
      <Text style={styles.items} numberOfLines={2}>
        {itemsSummary(delivery)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wait: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  customer: { fontSize: 16, fontWeight: '700', color: colors.text },
  address: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  items: { fontSize: 13, color: colors.textFaint },
});
