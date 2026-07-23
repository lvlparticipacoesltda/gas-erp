import { Injectable, Logger } from '@nestjs/common';

const BRASIL_API_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { name: string | null; expiresAt: number };

@Injectable()
export class CnpjLookupService {
  private readonly logger = new Logger(CnpjLookupService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string | null>>();

  /** Normaliza CNPJ para 14 dígitos ou null. */
  normalize(cnpj?: string | null): string | null {
    if (!cnpj) return null;
    const digits = cnpj.replace(/\D/g, '');
    return digits.length === 14 ? digits : null;
  }

  /**
   * Retorna razão social (ou nome fantasia) do CNPJ via BrasilAPI.
   * Cache em memória; em falha devolve null (caller usa fallback).
   */
  async lookupCompanyName(cnpj?: string | null): Promise<string | null> {
    const digits = this.normalize(cnpj);
    if (!digits) return null;

    const cached = this.cache.get(digits);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name;
    }

    const pending = this.inFlight.get(digits);
    if (pending) return pending;

    const job = this.fetchRazaoSocial(digits)
      .then((name) => {
        this.cache.set(digits, {
          name,
          expiresAt: Date.now() + (name ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
        });
        return name;
      })
      .finally(() => {
        this.inFlight.delete(digits);
      });

    this.inFlight.set(digits, job);
    return job;
  }

  private async fetchRazaoSocial(digits: string): Promise<string | null> {
    try {
      const res = await fetch(`${BRASIL_API_CNPJ}/${digits}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`BrasilAPI CNPJ ${digits}: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        razao_social?: string;
        nome_fantasia?: string;
      };
      const razao = data.razao_social?.trim();
      const fantasia = data.nome_fantasia?.trim();
      return razao || fantasia || null;
    } catch (err) {
      this.logger.warn(
        `BrasilAPI CNPJ ${digits} falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
