import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeliveryRouteResponse, DeliveryRouteStep } from '@gas-erp/shared';

interface CacheEntry {
  result: DeliveryRouteResponse;
  expiresAt: number;
}

export interface RouteRequest {
  originLat: number;
  originLng: number;
  destLat?: number;
  destLng?: number;
  destAddress?: string | null;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private config: ConfigService) {}

  private cacheKey(originLat: number, originLng: number, destination: string): string {
    return [
      originLat.toFixed(5),
      originLng.toFixed(5),
      destination,
    ].join('|');
  }

  async getRoute(request: RouteRequest): Promise<DeliveryRouteResponse> {
    const { originLat, originLng, destLat, destLng, destAddress } = request;
    const origin = `${originLat},${originLng}`;
    const attempts: { label: string; destination: string }[] = [];

    // Endereço textual primeiro: Google Directions resolve bem o número da casa.
    // Coords do Nominatim às vezes caem no meio/fim da rua (ex.: pediu 20, pinou 1320).
    if (destAddress?.trim()) {
      attempts.push({ label: 'endereço', destination: destAddress.trim() });
    }
    if (destLat != null && destLng != null) {
      attempts.push({ label: 'coordenadas', destination: `${destLat},${destLng}` });
    }

    if (attempts.length === 0) {
      throw new ServiceUnavailableException(
        'Destino sem coordenadas nem endereço para calcular a rota.',
      );
    }

    let lastStatus = 'UNKNOWN';
    for (const attempt of attempts) {
      const key = this.cacheKey(originLat, originLng, attempt.destination);
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.log(
          `Rota (cache) via ${attempt.label}: origem=${origin} destino="${attempt.destination}"`,
        );
        return cached.result;
      }

      try {
        const result = await this.fetchDirections(origin, attempt.destination);
        this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        this.logger.log(
          `Rota OK via ${attempt.label}: origem=${origin} destino="${attempt.destination}" ` +
            `dist=${result.distanceMeters}m dur=${result.durationSeconds}s`,
        );
        return result;
      } catch (error) {
        lastStatus = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Rota falhou via ${attempt.label}: origem=${origin} destino="${attempt.destination}" — ${lastStatus}`,
        );
      }
    }

    throw new ServiceUnavailableException(
      `Não foi possível traçar rota (último erro: ${lastStatus}). ` +
        'O endereço pode estar incompleto ou o geocoding impreciso — tente abrir no Maps/Waze.',
    );
  }

  private async fetchDirections(
    origin: string,
    destination: string,
  ): Promise<DeliveryRouteResponse> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_DIRECTIONS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Roteamento indisponível: configure GOOGLE_MAPS_DIRECTIONS_API_KEY no servidor.',
      );
    }

    const params = new URLSearchParams({
      origin,
      destination,
      mode: 'driving',
      language: 'pt-BR',
      region: 'br',
      key: apiKey,
    });

    const url = `${DIRECTIONS_URL}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ServiceUnavailableException(`Directions HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      routes?: Array<{
        overview_polyline: { points: string };
        bounds: {
          northeast: { lat: number; lng: number };
          southwest: { lat: number; lng: number };
        };
        legs: Array<{
          distance: { value: number };
          duration: { value: number };
          steps?: Array<{
            html_instructions?: string;
            maneuver?: string;
            distance?: { value: number };
            start_location: { lat: number; lng: number };
            end_location: { lat: number; lng: number };
          }>;
        }>;
      }>;
    };

    if (data.status !== 'OK' || !data.routes?.[0]) {
      const detail = data.error_message ? ` — ${data.error_message}` : '';
      throw new ServiceUnavailableException(`Directions status ${data.status}${detail}`);
    }

    const route = data.routes[0];
    const leg = route.legs[0];
    const steps: DeliveryRouteStep[] = (leg.steps ?? []).map((step) => ({
      instruction: this.stripHtml(step.html_instructions ?? ''),
      distanceMeters: step.distance?.value ?? 0,
      maneuver: step.maneuver,
      startLocation: {
        latitude: step.start_location.lat,
        longitude: step.start_location.lng,
      },
      endLocation: {
        latitude: step.end_location.lat,
        longitude: step.end_location.lng,
      },
    }));

    return {
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
      steps: steps.length > 0 ? steps : undefined,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<div[^>]*>/gi, '. ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
