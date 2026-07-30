import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ExpandableTabBar } from '@/components/ExpandableTabBar';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { colors } from '@/theme';

function TabsNav({ isAttendant }: { isAttendant: boolean }) {
  const { pending } = useDeliveriesContext();
  return (
    <Tabs
      tabBar={(props) => <ExpandableTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mapa',
          href: isAttendant ? null : undefined,
          tabBarBadge: !isAttendant && pending.length > 0 ? pending.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary },
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          href: isAttendant ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Escala',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sale"
        options={{
          title: 'Venda',
          href: isAttendant ? null : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { token, user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;

  const isAttendant = user?.role === 'ATTENDANT';

  return <TabsNav isAttendant={isAttendant} />;
}
