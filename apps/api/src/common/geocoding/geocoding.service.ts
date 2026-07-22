import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { geocodeAddressQuerySchema, type GeocodeAddressQuery, type GeocodeResult } from '@gas-erp/shared';

interface CacheEntry {
  /** null = endereço sem resultado (cache negativo, evita re-consultar o Google). */
  result: GeocodeResult | null;
  expiresAt: number;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Falhas (ZERO_RESULTS etc.) também são cacheadas, com TTL menor — o endereço pode ser corrigido. */
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
/** Bump quando a lógica de match muda — invalida cache em memória de pins errados. */
const CACHE_VERSION = 'v3';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /** Deduplica consultas concorrentes ao mesmo endereço (ex.: Promise.all em listas). */
  private readonly inFlight = new Map<string, Promise<GeocodeResult | null>>();

  constructor(private config: ConfigService) {}

  private cacheKey(input: GeocodeAddressQuery): string {
    return [
      CACHE_VERSION,
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

  private normalizeHouseNumber(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '');
  }

  private buildFreeQuery(input: GeocodeAddressQuery): string {
    const parts = [
      [input.street, input.number].filter(Boolean).join(', '),
      input.neighborhood,
      [input.city, input.state].filter(Boolean).join(' - '),
      input.zipCode,
      'Brasil',
    ].filter(Boolean);
    return parts.join(', ');
  }

  /**
   * Quando o usuário informou número, só aceita hit que case o número.
   * Evita pin no meio/fim da rua (Nominatim frequentemente devolve só a via).
   */
  private pickBestHit(rows: NominatimHit[], wantedNumber: string): NominatimHit | null {
    if (rows.length === 0) return null;
    if (!wantedNumber) return rows[0];

    const exact = rows.find(
      (row) => this.normalizeHouseNumber(row.address?.house_number) === wantedNumber,
    );
    if (exact) return exact;

    // Às vezes o número vem no display_name (“…, 20 - …”) e não em address.house_number.
    const inDisplay = rows.find((row) => {
      const display = row.display_name ?? '';
      const match = display.match(/(?:^|,\s*)(\d+[A-Za-z]?)(?:\s*[-,]|\s|$)/);
      return match != null && this.normalizeHouseNumber(match[1]) === wantedNumber;
    });
    if (inDisplay) return inDisplay;

    return null;
  }

  private async fetchNominatim(params: Record<string, string>): Promise<NominatimHit[]> {
    const url = new URL(NOMINATIM_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'GasERP/1.0 (delivery geocoding)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      this.logger.warn(`Nominatim HTTP ${res.status} for ${url.searchParams.toString()}`);
      return [];
    }

    return (await res.json()) as NominatimHit[];
  }

  private googleStreetNumber(
    components?: Array<{ long_name: string; short_name: string; types: string[] }>,
  ): string {
    const component = components?.find((c) => c.types.includes('street_number'));
    return this.normalizeHouseNumber(component?.long_name);
  }

  private async geocodeWithGoogle(
    query: string,
    wantedNumber: string,
  ): Promise<GeocodeResult | null> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_DIRECTIONS_API_KEY');
    if (!apiKey?.trim()) return null;

    const params = new URLSearchParams({
      address: query,
      region: 'br',
      language: 'pt-BR',
      key: apiKey,
    });

    const res = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`);
    if (!res.ok) {
      this.logger.warn(`Google Geocode HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      }>;
    };

    if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
      this.logger.warn(
        `Google Geocode ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`,
      );
      return null;
    }

    if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
      this.logger.debug(`Google Geocode status=${data.status} query="${query}"`);
      return null;
    }

    const results = data.results;
    const matched = wantedNumber
      ? results.find((r) => this.googleStreetNumber(r.address_components) === wantedNumber)
      : undefined;
    const top = matched ?? results[0];
    const loc = top.geometry?.location;
    if (!loc) return null;

    return {
      latitude: loc.lat,
      longitude: loc.lng,
      displayName: top.formatted_address,
    };
  }

  private async geocodeWithNominatim(data: GeocodeAddressQuery): Promise<GeocodeResult | null> {
    const wantedNumber = this.normalizeHouseNumber(data.number);
    const common = {
      format: 'json',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'br',
    };

    let rows: NominatimHit[] = [];
    if (data.street?.trim()) {
      const street = [data.number, data.street].filter(Boolean).join(' ').trim();
      rows = await this.fetchNominatim({
        ...common,
        street,
        city: data.city,
        state: data.state,
        country: 'Brasil',
        ...(data.zipCode ? { postalcode: data.zipCode } : {}),
      });
    }

    if (rows.length === 0) {
      rows = await this.fetchNominatim({
        ...common,
        q: this.buildFreeQuery(data),
      });
    }

    const hit = this.pickBestHit(rows, wantedNumber);
    if (!hit) {
      if (wantedNumber && rows.length > 0) {
        this.logger.warn(
          `Nominatim sem número ${wantedNumber} para "${this.buildFreeQuery(data)}" ` +
            `(melhor hit: ${rows[0]?.display_name ?? '—'})`,
        );
      }
      return null;
    }

    return {
      latitude: Number(hit.lat),
      longitude: Number(hit.lon),
      displayName: hit.display_name,
    };
  }

  async geocodeAddress(input: unknown): Promise<GeocodeResult | null> {
    const data = geocodeAddressQuerySchema.parse(input);
    const key = this.cacheKey(data);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.resolveAddress(data, key).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async resolveAddress(
    data: GeocodeAddressQuery,
    key: string,
  ): Promise<GeocodeResult | null> {
    const query = this.buildFreeQuery(data);
    const wantedNumber = this.normalizeHouseNumber(data.number);

    try {
      // Google primeiro (mesma key do Directions, se Geocoding API estiver ligada).
      const fromGoogle = await this.geocodeWithGoogle(query, wantedNumber);
      if (fromGoogle) {
        this.cache.set(key, { result: fromGoogle, expiresAt: Date.now() + CACHE_TTL_MS });
        this.logger.log(`Geocode Google OK: "${query}" → ${fromGoogle.displayName ?? '—'}`);
        return fromGoogle;
      }

      const fromNominatim = await this.geocodeWithNominatim(data);
      if (!fromNominatim) {
        // Cache negativo: sem ele, endereços não localizáveis eram re-consultados
        // no Google a cada chamada (ex.: poll de 30s do app do entregador).
        this.cache.set(key, { result: null, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
        return null;
      }

      this.cache.set(key, { result: fromNominatim, expiresAt: Date.now() + CACHE_TTL_MS });
      return fromNominatim;
    } catch (error) {
      this.logger.warn(`Geocoding failed: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException(
        'Não foi possível localizar o endereço no momento. Selecione o entregador manualmente.',
      );
    }
  }
}
