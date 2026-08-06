import '@/lib/location';
import { useEffect, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DeliveriesProvider } from '@/lib/deliveries-context';
import { DelivererAvailabilityProvider } from '@/lib/deliverer-availability-context';
import { PushNotificationsBridge } from '@/components/PushNotificationsBridge';
import { DevicePowerSetupBridge } from '@/components/DevicePowerSetupBridge';
import { NotificationPermissionOnLaunch } from '@/components/NotificationPermissionOnLaunch';
import { LocationDisclosureHost } from '@/components/LocationDisclosureHost';
import { initForegroundPresence, teardownForegroundPresence } from '@/lib/location';
import { useColors } from '@/theme';
import { ThemePreferenceProvider } from '@/lib/theme-preference';

/** Entregas compartilhadas entre abas e tela de detalhe (/delivery/[id]). */
function AuthenticatedDeliveries({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const isDeliverer = user?.role === 'DELIVERER';

  useEffect(() => {
    if (!token || !isDeliverer) return;
    initForegroundPresence();
    return () => {
      teardownForegroundPresence();
    };
  }, [token, isDeliverer]);

  if (!token) return children;

  // Provider sempre presente (abas ocultas do atendente ainda podem montar); push/GPS só entregador.
  return (
    <DeliveriesProvider>
      <DelivererAvailabilityProvider>
        {isDeliverer ? (
          <>
            <PushNotificationsBridge />
            <DevicePowerSetupBridge />
          </>
        ) : null}
        {children}
      </DelivererAvailabilityProvider>
    </DeliveriesProvider>
  );
}

export default function RootLayout() {
  const colors = useColors();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <LocationDisclosureHost />
          <NotificationPermissionOnLaunch />
          <AuthenticatedDeliveries>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
      <Stack.Screen
        name="delivery/[id]"
        options={{
          headerShown: false,
        }}
      />
            </Stack>
          </AuthenticatedDeliveries>
        </AuthProvider>
      </SafeAreaProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
