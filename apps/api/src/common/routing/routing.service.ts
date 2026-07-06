import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeliveryRouteResponse } from '@gas-erp/shared';

interface CacheEntry {
  result: DeliveryRouteResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private config: ConfigService) {}

  private cacheKey(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): string {
    return [
      originLat.toFixed(5),
      originLng.toFixed(5),
      destLat.toFixed(5),
      destLng.toFixed(5),
    ].join('|');
  }

  async getRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<DeliveryRouteResponse> {
    const key = this.cacheKey(originLat, originLng, destLat, destLng);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const apiKey = this.config.get<string>('GOOGLE_MAPS_DIRECTIONS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Roteamento indisponível: configure GOOGLE_MAPS_DIRECTIONS_API_KEY no servidor.',
      );
    }

    const params = new URLSearchParams({
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      mode: 'driving',
      language: 'pt-BR',
      key: apiKey,
    });

    const url = `${DIRECTIONS_URL}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Directions API HTTP ${res.status}`);
      throw new ServiceUnavailableException('Não foi possível calcular a rota.');
    }

    const data = (await res.json()) as {
      status: string;
      routes?: Array<{
        overview_polyline: { points: string };
        bounds: {
          northeast: { lat: number; lng: number };
          southwest: { lat: number; lng: number };
        };
        legs: Array<{
          distance: { value: number };
          duration: { value: number };
        }>;
      }>;
    };

    if (data.status !== 'OK' || !data.routes?.[0]) {
      this.logger.warn(`Directions API status: ${data.status}`);
      throw new ServiceUnavailableException('Rota não encontrada para este destino.');
    }

    const route = data.routes[0];
    const leg = route.legs[0];
    const result: DeliveryRouteResponse = {
      encodedPolyline: route.overview_polyline.points,
      distanceMeters: leg.distance.value,
      durationSeconds: leg.duration.value,
      bounds: {
        northeast: {
          latitude: route.bounds.northeast.lat,
          longitude: route.bounds.northeast.lng,
        },
        southwest: {
          latitude: route.bounds.southwest.lat,
          longitude: route.bounds.southwest.lng,
        },
      },
    };

    this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}
