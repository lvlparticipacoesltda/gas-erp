import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui';
import { DeliverySaleSummary } from '../DeliverySaleSummary';
import { deliveryAddress } from '../../lib/deliveries';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function ActiveRoutePanel({
  delivery,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
  busy,
  onFinish,
  onOpenGoogleMaps,
  onOpenWaze,
}: {
  delivery: Delivery;
  etaLabel: string | null;
  distanceLabel: string | null;
  routeLoading: boolean;
  routeError: string | null;
  busy: boolean;
  onFinish: () => void;
  onOpenGoogleMaps: () => void;
  onOpenWaze: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const address = deliveryAddress(delivery);

  useEffect(() => {
    const startedAt = delivery.startedAt ? new Date(delivery.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [delivery.startedAt]);

  return (
    <View style={styles.panel}>
      <View style={styles.timerRow}>
        <View style={styles.pulse} />
        <View style={styles.flex}>
          <Text style={styles.customer}>{delivery.sale.customer?.name ?? 'Cliente'}</Text>
          <Text style={styles.timer}>{formatElapsed(elapsed)} em rota</Text>
        </View>
        {distanceLabel || etaLabel ? (
          <View style={styles.meta}>
            {distanceLabel ? <Text style={styles.metaText}>{distanceLabel}</Text> : null}
            {etaLabel ? <Text style={styles.metaText}>{etaLabel}</Text> : null}
          </View>
        ) : null}
      </View>

      {address ? (
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      ) : null}

      <DeliverySaleSummary sale={delivery.sale} />

      {routeLoading ? <Text style={styles.hint}>Calculando rota...</Text> : null}
      {routeError ? (
        <Text style={styles.error}>
          {routeError}
          {'\n'}Use Maps ou Waze abaixo se o endereço estiver correto.
        </Text>
      ) : null}

      <View style={styles.navRow}>
        <Button
          label="Maps"
          variant="secondary"
          icon={<Ionicons name="navigate-outline" size={16} color={colors.text} />}
          onPress={onOpenGoogleMaps}
          style={styles.navBtn}
        />
        <Button
          label="Waze"
          variant="secondary"
          icon={<Ionicons name="car-outline" size={16} color={colors.text} />}
          onPress={onOpenWaze}
          style={styles.navBtn}
        />
      </View>

      <Button label="Concluir entrega" variant="success" onPress={onFinish} loading={busy} />
    </View>
  );
}

export function SelectedDeliveryPanel({
  delivery,
  busy,
  hasActiveRoute,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
  onStart,
  onClear,
}: {
  delivery: Delivery;
  busy: boolean;
  hasActiveRoute: boolean;
  etaLabel?: string | null;
  distanceLabel?: string | null;
  routeLoading?: boolean;
  routeError?: string | null;
  onStart: () => void;
  onClear: () => void;
}) {
  const address = deliveryAddress(delivery);

  return (
    <View style={styles.panel}>
      <View style={styles.timerRow}>
        <Text style={[styles.customer, styles.flex]}>{delivery.sale.customer?.name ?? 'Cliente'}</Text>
        {distanceLabel || etaLabel ? (
          <View style={styles.meta}>
            {distanceLabel ? <Text style={styles.metaText}>{distanceLabel}</Text> : null}
            {etaLabel ? <Text style={styles.metaText}>{etaLabel}</Text> : null}
          </View>
        ) : null}
      </View>
      {address ? (
        <Text style={styles.address} numberOfLines={2}>
          {address}
        </Text>
      ) : null}

      <DeliverySaleSummary sale={delivery.sale} />

      {routeLoading ? <Text style={styles.hint}>Calculando rota...</Text> : null}
      {routeError ? (
        <Text style={styles.error}>
          {routeError}
          {'\n'}Você ainda pode iniciar a rota e navegar pelo Maps/Waze.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Voltar" variant="secondary" onPress={onClear} style={styles.flex} />
        <Button
          label="Iniciar rota"
          onPress={onStart}
          loading={busy}
          disabled={hasActiveRoute}
          style={styles.flex}
        />
      </View>
      {hasActiveRoute ? (
        <Text style={styles.hint}>Conclua a rota atual antes de iniciar outra.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  flex: { flex: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  customer: { fontSize: 17, fontWeight: '800', color: colors.text },
  timer: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  meta: { alignItems: 'flex-end' },
  metaText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  address: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  hint: { fontSize: 12, color: colors.textFaint },
  error: { fontSize: 12, color: colors.danger },
  navRow: { flexDirection: 'row', gap: spacing.sm },
  navBtn: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
