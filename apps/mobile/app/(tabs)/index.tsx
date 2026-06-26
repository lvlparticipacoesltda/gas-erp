import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Loading, StateMessage } from '@/components/ui';
import { DeliveryCard } from '@/components/DeliveryCard';
import { useAuth } from '@/lib/auth';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { useDelivererAvailability } from '@/lib/deliverer-availability-context';
import { colors, radius, spacing } from '@/theme';
import type { Delivery } from '@/types';

type Segment = 'pending' | 'inProgress';

export default function DeliveriesScreen() {
  const router = useRouter();
  const { user, organization, logout } = useAuth();
  const { pending, inProgress, loading, refreshing, error, refresh } = useDeliveriesContext();
  const { isUnavailable } = useDelivererAvailability();
  const [segment, setSegment] = useState<Segment>('pending');

  const data: Delivery[] = segment === 'pending' ? pending : inProgress;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {organization?.name ? (
            <Text style={styles.org} numberOfLines={1}>
              {organization.name}
            </Text>
          ) : null}
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? 'entregador'}</Text>
          <Text style={styles.subtitle}>Suas entregas de hoje</Text>
        </View>
        <Pressable onPress={logout} style={styles.iconButton} hitSlop={8}>
          <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {isUnavailable && (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableTitle}>Você está indisponível</Text>
          <Text style={styles.unavailableText}>
            A loja pausou seu status no mapa. O compartilhamento de localização está desligado até
            você ser marcado como disponível novamente.
          </Text>
        </View>
      )}

      <View style={styles.segments}>
        <SegmentButton
          label="Aguardando"
          count={pending.length}
          active={segment === 'pending'}
          onPress={() => setSegment('pending')}
        />
        <SegmentButton
          label="Em rota"
          count={inProgress.length}
          active={segment === 'inProgress'}
          onPress={() => setSegment('inProgress')}
        />
      </View>

      {loading ? (
        <Loading label="Carregando entregas..." />
      ) : (
        <FlatList
          data={data}
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
            ) : segment === 'pending' ? (
              <StateMessage
                emoji="✅"
                title="Nenhuma entrega aguardando"
                subtitle="Você está em dia. Puxe para atualizar."
              />
            ) : (
              <StateMessage
                emoji="🛵"
                title="Nenhuma rota em andamento"
                subtitle="Inicie uma entrega na aba Aguardando."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
      {count > 0 ? (
        <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
          <Text style={[styles.segmentBadgeText, active && styles.segmentBadgeTextActive]}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  org: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  unavailableBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  unavailableTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  unavailableText: { marginTop: 4, fontSize: 12, lineHeight: 17, color: '#B45309' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: '#FFFFFF' },
  segmentBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  segmentBadgeActive: { backgroundColor: colors.primary },
  segmentBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  segmentBadgeTextActive: { color: '#FFFFFF' },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
});
