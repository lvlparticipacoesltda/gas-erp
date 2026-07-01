import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { geocodeAddressQuerySchema, type GeocodeAddressQuery, type GeocodeResult } from '@gas-erp/shared';

interface CacheEntry {
  result: GeocodeResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, CacheEntry>();

  private cacheKey(input: GeocodeAddressQuery): string {
    return [
      input.street,
      input.number ?? '',
      input.neighborhood ?? '',
      input.city,
      input.state,
      input.zipCode ?? '',
    ]
      .join('|')
      .toLowerCase()
      .trim();
  }

  private buildQuery(input: GeocodeAddressQuery): string {
    const parts = [
      [input.street, input.number].filter(Boolean).join(', '),
      input.neighborhood,
      [input.city, input.state].filter(Boolean).join(' - '),
      input.zipCode,
      'Brasil',
    ].filter(Boolean);
    return parts.join(', ');
  }

  async geocodeAddress(input: unknown): Promise<GeocodeResult | null> {
    const data = geocodeAddressQuerySchema.parse(input);
    const key = this.cacheKey(data);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const q = this.buildQuery(data);
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');

    try {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'GasERP/1.0 (delivery geocoding)',
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        this.logger.warn(`Nominatim HTTP ${res.status} for query: ${q}`);
        return null;
      }

      const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      const hit = rows[0];
      if (!hit) return null;

      const result: GeocodeResult = {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        displayName: hit.display_name,
      };

      this.cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (error) {
      this.logger.warn(`Geocoding failed: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException(
        'Não foi possível localizar o endereço no momento. Selecione o entregador manualmente.',
      );
    }
  }
}
