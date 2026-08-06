import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomerPhoneLink } from '../CustomerPhoneLink';
import { DeliveryNotes } from '../DeliveryNotes';
import { Button } from '../ui';
import { DeliverySaleSummary } from '../DeliverySaleSummary';
import { deliveryAddress } from '../../lib/deliveries';
import { makeStyles, radius, spacing, useColors } from '../../theme';
import type { Delivery } from '../../types';

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Complemento e ponto de referência são o que resolve os últimos 30 metros —
 * achar o apartamento, o portão, a entrada certa. Vinham concatenados na string
 * do endereço, truncada em duas linhas dentro da seção recolhida: exatamente a
 * informação mais útil na chegada era a mais escondida.
 */
function ArrivalDetails({ delivery }: { delivery: Delivery }) {
  const styles = useStyles();
  const colors = useColors();
  const complement = delivery.sale.deliveryComplement?.trim();
  const landmark = delivery.sale.deliveryLandmark?.trim();
  if (!complement && !landmark) return null;

  return (
    <View style={styles.arrivalDetails}>
      {complement ? (
        <View style={styles.arrivalRow}>
          <Ionicons name="business-outline" size={16} color={colors.text} />
          <Text style={styles.arrivalText}>{complement}</Text>
        </View>
      ) : null}
      {landmark ? (
        <View style={styles.arrivalRow}>
          <Ionicons name="eye-outline" size={16} color={colors.text} />
          <Text style={styles.arrivalText}>{landmark}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ActiveRoutePanel({
  delivery,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
  busy,
  canFinish,
  finishHint,
  arrived,
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
  canFinish: boolean;
  finishHint?: string | null;
  arrived?: boolean;
  onFinish: () => void;
  onOpenGoogleMaps: () => void;
  onOpenWaze: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const address = deliveryAddress(delivery);

  useEffect(() => {
    const startedAt = delivery.startedAt ? new Date(delivery.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [delivery.startedAt]);

  return (
    <View style={[styles.compactPanel, arrived && styles.compactPanelArrived]}>
      {arrived ? (
        <View style={styles.arrivalBanner}>
          <Ionicons name="flag" size={16} color={colors.successText} />
          <Text style={styles.arrivalTitle}>Você chegou</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        accessibilityLabel={expanded ? 'Recolher detalhes da entrega' : 'Expandir detalhes da entrega'}
      >
        <View style={[styles.pulse, arrived && styles.pulseArrived]} />
        <View style={styles.flex}>
          <Text style={styles.customer} numberOfLines={1}>
            {delivery.sale.customer?.name ?? 'Cliente'}
          </Text>
          <Text style={styles.timer}>{formatElapsed(elapsed)} em rota</Text>
        </View>
        {/* Distância e ETA são o que mais se consulta em movimento: ficam
            maiores que o nome do cliente, e não menores como antes. */}
        {distanceLabel || etaLabel ? (
          <View style={styles.meta}>
            {distanceLabel ? <Text style={styles.metaStrong}>{distanceLabel}</Text> : null}
            {etaLabel ? <Text style={styles.metaText}>{etaLabel}</Text> : null}
          </View>
        ) : null}
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-up'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Na chegada, complemento e referência sobem para fora da seção
          recolhível: é quando eles valem mais e quando ninguém vai expandir. */}
      {arrived ? <ArrivalDetails delivery={delivery} /> : null}

      {expanded ? (
        <View style={styles.details}>
          {address ? (
            <Text style={styles.address} numberOfLines={2}>
              {address}
            </Text>
          ) : null}

          {!arrived ? <ArrivalDetails delivery={delivery} /> : null}

          <CustomerPhoneLink phone={delivery.sale.customer?.phone} />

          <DeliveryNotes notes={delivery.sale.notes} />

          <DeliverySaleSummary sale={delivery.sale} />

          {routeLoading ? <Text style={styles.hint}>Calculando rota...</Text> : null}
          {routeError ? <Text style={styles.error}>{routeError}</Text> : null}
        </View>
      ) : (
        <DeliveryNotes notes={delivery.sale.notes} numberOfLines={2} />
      )}

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

      {finishHint ? <Text style={styles.hint}>{finishHint}</Text> : null}

      <Button
        label="Concluir entrega"
        variant="success"
        onPress={onFinish}
        loading={busy}
        disabled={!canFinish}
      />
    </View>
  );
}

export function SelectedDeliveryPanel({
  delivery,
  busy,
  switchingRoute,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
  onStart,
  onClear,
}: {
  delivery: Delivery;
  busy: boolean;
  switchingRoute?: boolean;
  etaLabel?: string | null;
  distanceLabel?: string | null;
  routeLoading?: boolean;
  routeError?: string | null;
  onStart: () => void;
  onClear: () => void;
}) {
  const styles = useStyles();
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

      <CustomerPhoneLink phone={delivery.sale.customer?.phone} />

      <DeliveryNotes notes={delivery.sale.notes} />

      <DeliverySaleSummary sale={delivery.sale} />

      {routeLoading ? <Text style={styles.hint}>Calculando rota...</Text> : null}
      {routeError ? <Text style={styles.error}>{routeError}</Text> : null}
      <View style={styles.actions}>
        <Button label="Voltar" variant="secondary" onPress={onClear} style={styles.flex} />
        <Button
          label={switchingRoute ? 'Trocar rota' : 'Iniciar rota'}
          onPress={onStart}
          loading={busy}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  compactPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  details: { gap: spacing.md },
  flex: { flex: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  customer: { fontSize: 15, fontWeight: '800', color: colors.text },
  timer: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  meta: { alignItems: 'flex-end' },
  metaStrong: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  metaText: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  compactPanelArrived: { borderTopColor: colors.success, borderTopWidth: 3 },
  pulseArrived: { backgroundColor: colors.primary },
  arrivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  arrivalTitle: { fontSize: 15, fontWeight: '800', color: colors.successText },
  arrivalDetails: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrivalText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  hint: { fontSize: 12, color: colors.textFaint },
  error: { fontSize: 12, color: colors.danger },
  navRow: { flexDirection: 'row', gap: spacing.sm },
  navBtn: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
}));
