import { Alert, Linking } from 'react-native';
import { stripPhoneDigits } from '@gas-erp/shared';

export type NavigationDestination = {
  /** Endereço textual (fallback). */
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function hasCoords(dest: NavigationDestination): dest is NavigationDestination & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof dest.latitude === 'number' &&
    Number.isFinite(dest.latitude) &&
    typeof dest.longitude === 'number' &&
    Number.isFinite(dest.longitude)
  );
}

function destinationLabel(dest: NavigationDestination): string | null {
  if (hasCoords(dest)) return `${dest.latitude},${dest.longitude}`;
  const address = dest.address?.trim();
  return address || null;
}

/** Abre o Google Maps com rota até o destino (coords ou endereço). */
export async function openGoogleMaps(dest: string | NavigationDestination): Promise<void> {
  const target = typeof dest === 'string' ? { address: dest } : dest;
  const label = destinationLabel(target);
  if (!label) {
    Alert.alert('Ops', 'Destino incompleto para abrir a navegação.');
    return;
  }

  const destination = encodeURIComponent(label);
  const url = hasCoords(target)
    ? `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  await openUrl(url, 'Não foi possível abrir o Google Maps.');
}

/** Abre o Waze com rota até o destino (coords ou endereço; fallback para web). */
export async function openWaze(dest: string | NavigationDestination): Promise<void> {
  const target = typeof dest === 'string' ? { address: dest } : dest;

  let appUrl: string;
  let webUrl: string;

  if (hasCoords(target)) {
    appUrl = `waze://?ll=${target.latitude},${target.longitude}&navigate=yes`;
    webUrl = `https://waze.com/ul?ll=${target.latitude},${target.longitude}&navigate=yes`;
  } else {
    const address = target.address?.trim();
    if (!address) {
      Alert.alert('Ops', 'Destino incompleto para abrir a navegação.');
      return;
    }
    const query = encodeURIComponent(address);
    appUrl = `waze://?q=${query}&navigate=yes`;
    webUrl = `https://waze.com/ul?q=${query}&navigate=yes`;
  }

  const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
  await openUrl(canOpenApp ? appUrl : webUrl, 'Não foi possível abrir o Waze.');
}

/**
 * Normaliza telefone BR para WhatsApp (E.164 sem +): 55 + DDD + número.
 * Usa `stripPhoneDigits` (remove máscara e 55 duplicado quando já presente).
 */
export function toWhatsAppPhoneBr(phone: string): string | null {
  const digits = stripPhoneDigits(phone);
  if (digits.length < 10) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

/** Abre o chat do WhatsApp com o telefone (app nativo ou wa.me). */
export async function openWhatsApp(phone: string): Promise<void> {
  const e164 = toWhatsAppPhoneBr(phone);
  if (!e164) {
    Alert.alert('Ops', 'Telefone inválido para abrir o WhatsApp.');
    return;
  }

  const appUrl = `whatsapp://send?phone=${e164}`;
  const webUrl = `https://wa.me/${e164}`;
  const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
  await openUrl(canOpenApp ? appUrl : webUrl, 'Não foi possível abrir o WhatsApp.');
}

async function openUrl(url: string, errorMessage: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Ops', errorMessage);
  }
}
