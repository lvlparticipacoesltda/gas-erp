import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LatLng } from '@gas-erp/shared';
import type { Delivery } from '../types';

/**
 * Cache local para o app não zerar em zona morta de sinal — subsolo, prédio,
 * bairro sem cobertura. Não é offline-first: a resposta da rede sempre vence, o
 * cache só evita a tela vazia enquanto ela não chega.
 *
 * `expo-secure-store` (usado para token e estado da entrega ativa) é keychain,
 * inadequado para uma lista: é lento e tem limite prático de tamanho por item.
 */
const PREFIX = 'cache:v1';

/**
 * Entrega guardada envelhece rápido: uma lista de ontem apresentada como atual
 * mandaria o entregador a um endereço que já foi atendido. Seis horas cobrem um
 * turno interrompido sem atravessar o dia.
 */
const DELIVERIES_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Envelope<T> = { savedAt: number; data: T };

async function readEnvelope<T>(key: string, maxAgeMs?: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (maxAgeMs != null && Date.now() - parsed.savedAt > maxAgeMs) {
      await AsyncStorage.removeItem(key).catch(() => undefined);
      return null;
    }
    return parsed.data;
  } catch {
    // Cache corrompido não pode derrubar a tela: segue como se não existisse.
    return null;
  }
}

async function writeEnvelope<T>(key: string, data: T): Promise<void> {
  const envelope: Envelope<T> = { savedAt: Date.now(), data };
  await AsyncStorage.setItem(key, JSON.stringify(envelope)).catch(() => undefined);
}

const deliveriesKey = (userId: string) => `${PREFIX}:deliveries:${userId}`;
const routeKey = (targetId: string) => `${PREFIX}:route:${targetId}`;

export function readCachedDeliveries(userId: string): Promise<Delivery[] | null> {
  return readEnvelope<Delivery[]>(deliveriesKey(userId), DELIVERIES_MAX_AGE_MS);
}

export function writeCachedDeliveries(userId: string, deliveries: Delivery[]): Promise<void> {
  return writeEnvelope(deliveriesKey(userId), deliveries);
}

export type CachedRoute = {
  encodedPolyline: string;
  polyline: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
};

/** A rota em curso não expira por tempo: enquanto a entrega está aberta, ela vale. */
export function readCachedRoute(targetId: string): Promise<CachedRoute | null> {
  return readEnvelope<CachedRoute>(routeKey(targetId));
}

export function writeCachedRoute(targetId: string, route: CachedRoute): Promise<void> {
  return writeEnvelope(routeKey(targetId), route);
}

export async function clearCachedRoute(targetId: string): Promise<void> {
  await AsyncStorage.removeItem(routeKey(targetId)).catch(() => undefined);
}

/** Trocar de entregador no mesmo aparelho não pode herdar a fila do anterior. */
export async function clearOfflineCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Sem cache limpo o pior caso é uma lista velha que a rede sobrescreve.
  }
}
