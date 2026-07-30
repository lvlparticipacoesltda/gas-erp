import { Redirect } from 'expo-router';
import { DeliveryMapHome } from '@/components/map/DeliveryMapHome';
import { useAuth } from '@/lib/auth';

export default function DeliveriesScreen() {
  const { user } = useAuth();
  if (user?.role === 'ATTENDANT') {
    return <Redirect href="/schedule" />;
  }
  return <DeliveryMapHome />;
}
