import { Injectable, Logger } from '@nestjs/common';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { name: string | null; expiresAt: number };

type Provider = {
  name: string;
  url: (digits: string) => string;
  parse: (data: unknown) => string | null;
};

const PROVIDERS: Provider[] = [
  {
    name: 'minhareceita',
    url: (d) => `https://minhareceita.org/${d}`,
    parse: (data) => {
      const d = data as { razao_social?: string; nome_fantasia?: string };
      return d.razao_social?.trim() || d.nome_fantasia?.trim() || null;
    },
  },
  {
    name: 'publica.cnpj.ws',
    url: (d) => `https://publica.cnpj.ws/cnpj/${d}`,
    parse: (data) => {
      const d = data as {
        razao_social?: string;
        estabelecimento?: { nome_fantasia?: string };
      };
      return d.razao_social?.trim() || d.estabelecimento?.nome_fantasia?.trim() || null;
    },
  },
  {
    name: 'receitaws',
    url: (d) => `https://www.receitaws.com.br/v1/cnpj/${d}`,
    parse: (data) => {
      const d = data as { nome?: string; fantasia?: string; status?: string };
      if (d.status && d.status !== 'OK') return null;
      return d.nome?.trim() || d.fantasia?.trim() || null;
    },
  },
  {
    name: 'brasilapi',
    url: (d) => `https://brasilapi.com.br/api/cnpj/v1/${d}`,
    parse: (data) => {
      const d = data as { razao_social?: string; nome_fantasia?: string };
      return d.razao_social?.trim() || d.nome_fantasia?.trim() || null;
    },
  },
];

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
   * Retorna razão social (ou nome fantasia) do CNPJ.
   * Tenta várias fontes (Fly/datacenter costuma bloquear BrasilAPI).
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
    for (const provider of PROVIDERS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const res = await fetch(provider.url(digits), {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'gas-erp/1.0 (+https://thlgasdopovo.com.br)',
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) {
          this.logger.warn(`CNPJ ${digits} via ${provider.name}: HTTP ${res.status}`);
          continue;
        }
        const data: unknown = await res.json();
        const name = provider.parse(data);
        if (name) {
          this.logger.log(`CNPJ ${digits} → ${name} (${provider.name})`);
          return name;
        }
        this.logger.warn(`CNPJ ${digits} via ${provider.name}: sem razão social`);
      } catch (err) {
        this.logger.warn(
          `CNPJ ${digits} via ${provider.name} falhou: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return null;
  }
}
