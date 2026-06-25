import { Alert, Linking } from 'react-native';

/** Abre o Google Maps com rota até o endereço informado. */
export async function openGoogleMaps(address: string): Promise<void> {
  const destination = encodeURIComponent(address);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  await openUrl(url, 'Não foi possível abrir o Google Maps.');
}

/** Abre o Waze com rota até o endereço informado (fallback para web). */
export async function openWaze(address: string): Promise<void> {
  const query = encodeURIComponent(address);
  const appUrl = `waze://?q=${query}&navigate=yes`;
  const webUrl = `https://waze.com/ul?q=${query}&navigate=yes`;
  const canOpenApp = await Linking.canOpenURL(appUrl).catch(() => false);
  await openUrl(canOpenApp ? appUrl : webUrl, 'Não foi possível abrir o Waze.');
}

/** Abre o discador com o telefone informado. */
export async function callPhone(phone: string): Promise<void> {
  const sanitized = phone.replace(/[^\d+]/g, '');
  await openUrl(`tel:${sanitized}`, 'Não foi possível iniciar a ligação.');
}

async function openUrl(url: string, errorMessage: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Ops', errorMessage);
  }
}
