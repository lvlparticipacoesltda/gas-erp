import { Alert, Linking } from 'react-native';
import { stripPhoneDigits } from '@gas-erp/shared';

export type NavigationDestination = {
  /** Endereço textual — preferido para Apps externos (evita geocode interno errado). */
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

/**
 * Destino para Maps/Waze: prioriza endereço textual quando houver.
 * Coordenadas vindas do Nominatim costumam falhar no número da casa
 * (ex.: "20" resolvido como outro ponto da rua → Google mostra "1320").
 */
function resolveExternalDestination(dest: NavigationDestination): {
  kind: 'address' | 'coords';
  value: string;
} | null {
  const address = dest.address?.trim();
  if (address) {
    return { kind: 'address', value: address };
  }
  if (hasCoords(dest)) {
    return { kind: 'coords', value: `${dest.latitude},${dest.longitude}` };
  }
  return null;
}

/** Abre o Google Maps com rota até o destino (endereço preferencial; coords como fallback). */
export async function openGoogleMaps(dest: string | NavigationDestination): Promise<void> {
  const target = typeof dest === 'string' ? { address: dest } : dest;
  const resolved = resolveExternalDestination(target);
  if (!resolved) {
    Alert.alert('Ops', 'Destino incompleto para abrir a navegação.');
    return;
  }

  const destination = encodeURIComponent(resolved.value);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  await openUrl(url, 'Não foi possível abrir o Google Maps.');
}

/** Abre o Waze com rota até o destino (endereço preferencial; coords como fallback). */
export async function openWaze(dest: string | NavigationDestination): Promise<void> {
  const target = typeof dest === 'string' ? { address: dest } : dest;
  const resolved = resolveExternalDestination(target);
  if (!resolved) {
    Alert.alert('Ops', 'Destino incompleto para abrir a navegação.');
    return;
  }

  let appUrl: string;
  let webUrl: string;

  if (resolved.kind === 'coords') {
    const [lat, lng] = resolved.value.split(',');
    appUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
    webUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  } else {
    const query = encodeURIComponent(resolved.value);
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
