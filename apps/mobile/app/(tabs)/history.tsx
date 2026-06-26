import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Loading, StateMessage } from '@/components/ui';
import { DeliveryCard } from '@/components/DeliveryCard';
import {
  filterHistoryByPeriod,
  historyReferenceDate,
  type HistoryPeriod,
} from '@/lib/deliveries';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { colors, radius, spacing } from '@/theme';

type StatusFilter = 'all' | 'DELIVERED' | 'CANCELLED';

const PERIOD_OPTIONS: { key: HistoryPeriod; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'all', label: 'Todos' },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'DELIVERED', label: 'Entregue' },
  { key: 'CANCELLED', label: 'Cancelado' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const { deliveries, loading, refreshing, error, refresh } = useDeliveriesContext();
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [status, setStatus] = useState<StatusFilter>('all');

  const historyDeliveries = useMemo(() => {
    const completed = deliveries.filter(
      (d) => d.status === 'DELIVERED' || d.status === 'CANCELLED',
    );
    const byPeriod = filterHistoryByPeriod(completed, period);
    const byStatus =
      status === 'all' ? byPeriod : byPeriod.filter((d) => d.status === status);
    return byStatus.sort((a, b) => {
      const at = new Date(historyReferenceDate(a)).getTime();
      const bt = new Date(historyReferenceDate(b)).getTime();
      return bt - at;
    });
  }, [deliveries, period, status]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Histórico de rotas</Text>
        <Text style={styles.subtitle}>
          {historyDeliveries.length} corrida{historyDeliveries.length === 1 ? '' : 's'}
          {period !== 'all' ? ` · ${periodLabel}` : ''}
        </Text>
      </View>

      <View style={styles.filters}>
        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.key}
              label={opt.label}
              active={period === opt.key}
              onPress={() => setPeriod(opt.key)}
            />
          ))}
        </View>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <SegmentButton
              key={opt.key}
              label={opt.label}
              active={status === opt.key}
              onPress={() => setStatus(opt.key)}
            />
          ))}
        </View>
      </View>

      {loading ? (
        <Loading label="Carregando histórico..." />
      ) : (
        <FlatList
          data={historyDeliveries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <DeliveryCard delivery={item} onPress={() => router.push(`/delivery/${item.id}`)} />
          )}
          ListEmptyComponent={
            error ? (
              <StateMessage emoji="⚠️" title="Não foi possível carregar" subtitle={error} />
            ) : (
              <StateMessage
                emoji="📭"
                title="Nenhuma corrida neste filtro"
                subtitle="Ajuste o período ou o status, ou puxe para atualizar."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  filters: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: '#FFFFFF' },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
