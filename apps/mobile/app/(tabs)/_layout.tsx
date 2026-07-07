import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ExpandableTabBar } from '@/components/ExpandableTabBar';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useDeliveriesContext } from '@/lib/deliveries-context';
import { colors } from '@/theme';

function TabsNav() {
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
          tabBarBadge: pending.length > 0 ? pending.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary },
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sale"
        options={{
          title: 'Venda',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { token, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;

  return <TabsNav />;
}
