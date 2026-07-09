import { Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { APP_DISPLAY_NAME } from '@/constants/branding';

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package ?? 'com.gaserp.entregador';

/** Marcas que costumam exigir “início automático” além da isenção de bateria. */
const AUTOSTART_MANUFACTURER_HINTS = [
  'xiaomi',
  'redmi',
  'poco',
  'huawei',
  'honor',
  'oppo',
  'realme',
  'vivo',
  'oneplus',
  'iqoo',
  'meizu',
] as const;

export type AutostartGuideVariant = 'xiaomi' | 'huawei' | 'generic';

export type AutostartGuide = {
  variant: AutostartGuideVariant;
  title: string;
  steps: string[];
};

function normalizeDeviceLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function needsAutostartGuide(): boolean {
  if (Platform.OS !== 'android') return false;
  const manufacturer = normalizeDeviceLabel(Device.manufacturer);
  const brand = normalizeDeviceLabel(Device.brand);
  return AUTOSTART_MANUFACTURER_HINTS.some(
    (hint) => manufacturer.includes(hint) || brand.includes(hint),
  );
}

export function getAutostartGuide(): AutostartGuide {
  const manufacturer = normalizeDeviceLabel(Device.manufacturer);
  const brand = normalizeDeviceLabel(Device.brand);
  const label = `${manufacturer} ${brand}`;

  if (label.includes('xiaomi') || label.includes('redmi') || label.includes('poco')) {
    return {
      variant: 'xiaomi',
      title: 'Ativar início automático (Xiaomi / Redmi / POCO)',
      steps: [
        'Abra Configurações → Apps → Gerenciar apps.',
        `Toque em ${APP_DISPLAY_NAME}.`,
        'Abra Início automático (Autostart) e ative.',
        'Volte e abra Economia de bateria → Sem restrições (se aparecer).',
        'Em Segurança → Bateria, confira se o app não está “restringido”.',
      ],
    };
  }

  if (label.includes('huawei') || label.includes('honor')) {
    return {
      variant: 'huawei',
      title: 'Ativar início automático (Huawei / Honor)',
      steps: [
        'Abra Configurações → Apps → Apps.',
        `Toque em ${APP_DISPLAY_NAME} → Bateria.`,
        'Escolha Gerenciamento de inicialização → permitir início automático.',
        'Desative otimização de bateria para este app.',
      ],
    };
  }

  return {
    variant: 'generic',
    title: 'Permitir app em segundo plano',
    steps: [
      `Abra Configurações → Apps → ${APP_DISPLAY_NAME}.`,
      'Em Bateria, escolha Sem restrições ou Não otimizar.',
      'Se existir “Início automático” ou “Executar em segundo plano”, ative.',
      'Desative economia agressiva de bateria para este app.',
    ],
  };
}

export async function openAppDetailsSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { startActivityAsync, ActivityAction } = await import('expo-intent-launcher');
  await startActivityAsync(ActivityAction.APPLICATION_DETAILS_SETTINGS, {
    data: `package:${ANDROID_PACKAGE}`,
  });
}

/** Abre a lista de apps com otimização de bateria (política Play: sem popup direto). */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { startActivityAsync, ActivityAction } = await import('expo-intent-launcher');
  try {
    await startActivityAsync(ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
  } catch {
    await openAppDetailsSettings();
  }
}

/**
 * Tenta abrir a tela de início automático do fabricante.
 * Se falhar, abre os detalhes do app para o entregador seguir o guia manual.
 */
export async function openAutostartSettings(guide: AutostartGuide): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { startActivityAsync } = await import('expo-intent-launcher');

  const attempts: Array<{ packageName: string; className: string }> = [];
  if (guide.variant === 'xiaomi') {
    attempts.push({
      packageName: 'com.miui.securitycenter',
      className: 'com.miui.permcenter.autostart.AutoStartManagementActivity',
    });
  } else if (guide.variant === 'huawei') {
    attempts.push({
      packageName: 'com.huawei.systemmanager',
      className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity',
    });
  }

  for (const attempt of attempts) {
    try {
      await startActivityAsync('android.intent.action.MAIN', attempt);
      return;
    } catch {
      // Próxima tentativa ou fallback.
    }
  }

  try {
    await openAppDetailsSettings();
  } catch {
    await Linking.openSettings();
  }
}
