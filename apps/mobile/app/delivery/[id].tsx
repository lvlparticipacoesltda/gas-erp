import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeliveryHistoryDetail } from '@/components/history/DeliveryHistoryDetail';
import { Loading, StateMessage } from '@/components/ui';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { colors } from '@/theme';

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, loading } = useDeliveriesContext();
  const delivery = id ? getById(id) : undefined;

  const isActive =
    delivery?.status === 'PENDING' || delivery?.status === 'IN_PROGRESS';
  const isHistory =
    delivery?.status === 'DELIVERED' || delivery?.status === 'CANCELLED';

  useEffect(() => {
    if (loading || !delivery || !isActive) return;
    router.replace({ pathname: '/(tabs)', params: { deliveryId: delivery.id } });
  }, [delivery, isActive, loading, router]);

  if (loading) {
    return <Loading label="Abrindo entrega..." />;
  }

  if (!delivery) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StateMessage
          emoji="📭"
          title="Entrega não encontrada"
          subtitle="Ela pode ter sido removida ou você não tem acesso."
        />
      </SafeAreaView>
    );
  }

  if (isActive) {
    return <Loading label="Abrindo entrega..." />;
  }

  if (isHistory) {
    return <DeliveryHistoryDetail delivery={delivery} />;
  }

  return null;
}
