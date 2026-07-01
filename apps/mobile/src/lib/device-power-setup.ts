import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { needsAutostartGuide } from './device-power-guides';

const BATTERY_SETUP_KEY = 'gas_device_power_battery_done';
const AUTOSTART_SETUP_KEY = 'gas_device_power_autostart_done';

async function readFlag(key: string): Promise<boolean> {
  const value = await SecureStore.getItemAsync(key);
  return value === '1';
}

async function writeFlag(key: string): Promise<void> {
  await SecureStore.setItemAsync(key, '1');
}

export async function isBatterySetupComplete(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return readFlag(BATTERY_SETUP_KEY);
}

export async function isAutostartSetupComplete(): Promise<boolean> {
  if (Platform.OS !== 'android' || !needsAutostartGuide()) return true;
  return readFlag(AUTOSTART_SETUP_KEY);
}

export async function markBatterySetupComplete(): Promise<void> {
  await writeFlag(BATTERY_SETUP_KEY);
}

export async function markAutostartSetupComplete(): Promise<void> {
  await writeFlag(AUTOSTART_SETUP_KEY);
}

/** Exibe o assistente enquanto o entregador compartilha GPS e faltar algum passo. */
export async function shouldShowDevicePowerSetup(sharingLocation: boolean): Promise<boolean> {
  if (Platform.OS !== 'android' || !sharingLocation) return false;
  const batteryDone = await isBatterySetupComplete();
  if (!batteryDone) return true;
  if (needsAutostartGuide()) {
    return !(await isAutostartSetupComplete());
  }
  return false;
}
