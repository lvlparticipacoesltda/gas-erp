import '@/lib/location';
import { useEffect, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DeliveriesProvider } from '@/lib/deliveries-context';
import { recoverStaleLocationTracking } from '@/lib/location';
import { colors } from '@/theme';

/** Entregas compartilhadas entre abas e tela de detalhe (/delivery/[id]). */
function AuthenticatedDeliveries({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    recoverStaleLocationTracking().catch(() => undefined);
  }, [token]);

  if (!token) return children;
  return <DeliveriesProvider>{children}</DeliveriesProvider>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthenticatedDeliveries>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen
                name="delivery/[id]"
                options={{
                  headerShown: true,
                  title: 'Entrega',
                  headerTintColor: colors.text,
                  headerStyle: { backgroundColor: colors.surface },
                }}
              />
            </Stack>
          </AuthenticatedDeliveries>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
