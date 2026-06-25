import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Loading, StateMessage } from '@/components/ui';
import { DeliveryCard } from '@/components/DeliveryCard';
import { isToday } from '@/lib/deliveries';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { colors, spacing } from '@/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const { delivered, loading, refreshing, error, refresh } = useDeliveriesContext();

  const todayDelivered = delivered
    .filter((d) => isToday(d.completedAt ?? d.startedAt ?? d.createdAt))
    .sort((a, b) => {
      const at = new Date(a.completedAt ?? a.createdAt).getTime();
      const bt = new Date(b.completedAt ?? b.createdAt).getTime();
      return bt - at;
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Histórico de hoje</Text>
        <Text style={styles.subtitle}>
          {todayDelivered.length} entrega{todayDelivered.length === 1 ? '' : 's'} concluída
          {todayDelivered.length === 1 ? '' : 's'}
        </Text>
      </View>

      {loading ? (
        <Loading label="Carregando histórico..." />
      ) : (
        <FlatList
          data={todayDelivered}
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
                title="Nada concluído ainda"
                subtitle="As entregas finalizadas hoje aparecem aqui."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
