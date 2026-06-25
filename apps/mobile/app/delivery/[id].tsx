import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatWaitTime,
  getDeliveryDisplayStatus,
  getElapsedWaitingSeconds,
  PAYMENT_METHOD_LABELS,
} from '@gas-erp/shared';
import { Badge, Button, Card, Loading, StateMessage } from '@/components/ui';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { deliveryAddress, updateDeliveryStatus } from '@/lib/deliveries';
import { hasBackgroundPermission, startDeliveryTracking, stopDeliveryTracking } from '@/lib/location';
import { callPhone, openGoogleMaps, openWaze } from '@/lib/navigation';
import { colors, radius, spacing } from '@/theme';
import type { Delivery } from '@/types';

/**
 * Divulgação destacada (prominent disclosure) exigida pela política da Google Play
 * para uso de localização em segundo plano. Deve aparecer ANTES do prompt do sistema.
 */
function confirmLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Uso da sua localização',
      'Durante uma rota ativa, o app coleta sua localização — inclusive com o app fechado ou em segundo plano — para compartilhar o trajeto da entrega com a loja em tempo real. A coleta para automaticamente quando você conclui a entrega.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Permitir', style: 'default', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, refresh, hasActiveRoute, loading } = useDeliveriesContext();
  const [busy, setBusy] = useState(false);

  const delivery = id ? getById(id) : undefined;

  if (!delivery) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Entrega' }} />
        {loading ? (
          <Loading label="Carregando entrega..." />
        ) : (
          <StateMessage
            emoji="🔍"
            title="Entrega não encontrada"
            subtitle="Ela pode já ter sido concluída ou reatribuída."
          >
            <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
          </StateMessage>
        )}
      </SafeAreaView>
    );
  }

  const address = deliveryAddress(delivery);
  const display = getDeliveryDisplayStatus({
    status: delivery.status,
    sale: { status: delivery.sale.status },
  });

  async function startRoute() {
    if (!delivery) return;
    if (hasActiveRoute) {
      Alert.alert(
        'Rota em andamento',
        'Você já tem uma entrega em rota. Conclua-a antes de iniciar outra.',
      );
      return;
    }

    // Divulgação destacada exigida pela Google Play antes de coletar localização
    // em segundo plano. Só é mostrada enquanto a permissão não foi concedida.
    if (!(await hasBackgroundPermission())) {
      const consent = await confirmLocationDisclosure();
      if (!consent) return;
    }

    setBusy(true);
    try {
      const permissions = await startDeliveryTracking(delivery.id);
      if (!permissions.foreground) {
        Alert.alert(
          'Localização necessária',
          'Permita o acesso à localização para iniciar a rota e compartilhar seu trajeto.',
        );
        await stopDeliveryTracking().catch(() => undefined);
        return;
      }
      if (!permissions.background) {
        Alert.alert(
          'Localização em segundo plano',
          'Para o melhor acompanhamento, permita a localização "o tempo todo" nas configurações. A rota seguirá funcionando com o app aberto.',
        );
      }
      await updateDeliveryStatus(delivery.id, 'IN_PROGRESS');
      await refresh();
      if (address) await openGoogleMaps(address);
    } catch (err) {
      await stopDeliveryTracking().catch(() => undefined);
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível iniciar a rota.');
    } finally {
      setBusy(false);
    }
  }

  function confirmFinish() {
    Alert.alert('Concluir entrega', 'Confirmar que a entrega foi realizada?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Concluir', style: 'default', onPress: finishRoute },
    ]);
  }

  async function finishRoute() {
    if (!delivery) return;
    setBusy(true);
    try {
      await updateDeliveryStatus(delivery.id, 'DELIVERED');
      await stopDeliveryTracking().catch(() => undefined);
      await refresh();
      router.back();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: delivery.sale.customer?.name ?? 'Entrega' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {delivery.status === 'IN_PROGRESS' ? <ActiveRouteTimer delivery={delivery} /> : null}

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Badge label={display.label} tone={display.tone} />
            <Text style={styles.waitTime}>{waitText(delivery)}</Text>
          </View>
          <Text style={styles.customer}>
            {delivery.sale.customer?.name ?? 'Cliente não identificado'}
          </Text>
          {delivery.sale.customer?.phone ? (
            <Button
              label={delivery.sale.customer.phone}
              variant="secondary"
              icon={<Ionicons name="call-outline" size={18} color={colors.text} />}
              onPress={() => callPhone(delivery.sale.customer!.phone!)}
              style={styles.phoneButton}
            />
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Endereço</Text>
          <Text style={styles.bodyText}>{address || 'Endereço não informado'}</Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Itens</Text>
          {delivery.sale.items?.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <Text style={styles.itemName}>{item.product.name}</Text>
            </View>
          ))}
          {delivery.sale.payments && delivery.sale.payments.length > 0 ? (
            <Text style={styles.payment}>
              Pagamento:{' '}
              {delivery.sale.payments
                .map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method)
                .join(', ')}
            </Text>
          ) : null}
        </Card>

        {delivery.sale.notes ? (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Observação</Text>
            <Text style={styles.bodyText}>{delivery.sale.notes}</Text>
          </Card>
        ) : null}

        {delivery.status !== 'DELIVERED' && address ? (
          <View style={styles.navButtons}>
            <Button
              label="Google Maps"
              variant="secondary"
              icon={<Ionicons name="navigate-outline" size={18} color={colors.text} />}
              onPress={() => openGoogleMaps(address)}
              style={styles.flex}
            />
            <Button
              label="Waze"
              variant="secondary"
              icon={<Ionicons name="car-outline" size={18} color={colors.text} />}
              onPress={() => openWaze(address)}
              style={styles.flex}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {delivery.status === 'PENDING' ? (
          <Button label="Iniciar rota" onPress={startRoute} loading={busy} />
        ) : null}
        {delivery.status === 'IN_PROGRESS' ? (
          <Button label="Concluir entrega" variant="success" onPress={confirmFinish} loading={busy} />
        ) : null}
        {delivery.status === 'DELIVERED' ? (
          <View style={styles.doneBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
            <Text style={styles.doneText}>Entrega concluída</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function waitText(delivery: Delivery): string {
  if (delivery.status === 'PENDING') {
    const seconds = delivery.elapsedWaitingSeconds ?? getElapsedWaitingSeconds(delivery.sale.createdAt);
    return `Aguardando há ${formatWaitTime(seconds)}`;
  }
  if (delivery.waitTimeSeconds != null) {
    return `Espera até a rota: ${formatWaitTime(delivery.waitTimeSeconds)}`;
  }
  return '';
}

function ActiveRouteTimer({ delivery }: { delivery: Delivery }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = delivery.startedAt ? new Date(delivery.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [delivery.startedAt]);

  return (
    <View style={styles.timerCard}>
      <View style={styles.pulse} />
      <Text style={styles.timerLabel}>Rota em andamento</Text>
      <Text style={styles.timerValue}>{formatElapsed(elapsed)}</Text>
      <Text style={styles.timerHint}>Localização sendo compartilhada com a loja</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  waitTime: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  customer: { fontSize: 20, fontWeight: '800', color: colors.text },
  phoneButton: { marginTop: spacing.sm },
  bodyText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  itemQty: { fontSize: 15, fontWeight: '800', color: colors.primary, minWidth: 34 },
  itemName: { fontSize: 15, color: colors.text, flex: 1 },
  payment: { marginTop: spacing.sm, fontSize: 13, color: colors.textMuted },
  navButtons: { flexDirection: 'row', gap: spacing.md },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
  },
  doneText: { fontSize: 15, fontWeight: '700', color: colors.successText },
  timerCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pulse: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    marginBottom: spacing.sm,
  },
  timerLabel: { fontSize: 13, fontWeight: '600', color: '#CBD5E1', textTransform: 'uppercase' },
  timerValue: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  timerHint: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
});
