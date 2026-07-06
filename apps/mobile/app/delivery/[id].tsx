import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Loading } from '@/components/ui';
import { useDeliveriesContext } from '@/lib/deliveries-context';

/** Deep link / push → redireciona para o mapa home com a entrega selecionada. */
export default function DeliveryDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, loading } = useDeliveriesContext();
  const delivery = id ? getById(id) : undefined;

  useEffect(() => {
    if (loading) return;
    if (delivery) {
      router.replace({ pathname: '/(tabs)', params: { deliveryId: delivery.id } });
    } else {
      router.replace('/(tabs)');
    }
  }, [delivery, loading, router]);

  return <Loading label="Abrindo entrega..." />;
}
