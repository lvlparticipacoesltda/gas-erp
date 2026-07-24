/**
 * Backfill grátis (Nominatim) de coordenadas:
 * - Store.latitude/longitude
 * - Sale.deliveryLatitude/deliveryLongitude
 *
 * Não usa Google. Respeita ~1 req/s (política do Nominatim).
 *
 * Uso:
 *   pnpm --filter @gas-erp/database run backfill:coords
 *   pnpm --filter @gas-erp/database run backfill:coords -- --limit=50
 *   pnpm --filter @gas-erp/database run backfill:coords -- --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DELAY_MS = 1100;

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: { house_number?: string };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function digits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function addressKey(parts: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}) {
  return [
    parts.street ?? '',
    parts.number ?? '',
    parts.neighborhood ?? '',
    parts.city ?? '',
    parts.state ?? '',
    parts.zipCode ?? '',
  ]
    .join('|')
    .toLowerCase()
    .trim();
}

function buildQuery(parts: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}) {
  return [
    [parts.street, parts.number].filter(Boolean).join(', '),
    parts.neighborhood,
    [parts.city, parts.state].filter(Boolean).join(' - '),
    parts.zipCode,
    'Brasil',
  ]
    .filter(Boolean)
    .join(', ');
}

async function nominatimGeocode(input: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}): Promise<{ latitude: number; longitude: number; displayName?: string } | null> {
  if (!input.street?.trim() || !input.city?.trim() || !input.state?.trim()) return null;

  const wanted = digits(input.number);
  const common = {
    format: 'json',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'br',
  };

  const attempts: Record<string, string>[] = [
    {
      ...common,
      street: [input.number, input.street].filter(Boolean).join(' ').trim(),
      city: input.city,
      state: input.state,
      country: 'Brasil',
      ...(input.zipCode ? { postalcode: input.zipCode } : {}),
    },
    {
      ...common,
      q: buildQuery(input),
    },
  ];

  for (const params of attempts) {
    const url = new URL(NOMINATIM_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'GasERP/1.0 (coords backfill; contato@thlgasdopovo.com.br)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.warn(`Nominatim HTTP ${res.status}`);
      await sleep(DELAY_MS);
      continue;
    }

    const rows = (await res.json()) as NominatimHit[];
    await sleep(DELAY_MS);

    if (rows.length === 0) continue;

    // Com número informado: só aceita hit com o mesmo número.
    // Aceitar o centroide da rua (~centenas de metros errado) quebra o geofence do ponto.
    let hit = rows[0];
    if (wanted) {
      const exact = rows.find((r) => digits(r.address?.house_number) === wanted);
      if (exact) hit = exact;
      else {
        const inDisplay = rows.find((r) => {
          const m = (r.display_name ?? '').match(/(?:^|,\s*)(\d+[A-Za-z]?)(?:\s*[-,]|\s|$)/);
          return m != null && digits(m[1]) === wanted;
        });
        if (inDisplay) hit = inDisplay;
        else continue;
      }
    }

    return {
      latitude: Number(hit.lat),
      longitude: Number(hit.lon),
      displayName: hit.display_name,
    };
  }

  return null;
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let limit = Number.POSITIVE_INFINITY;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length));
  }
  return { dryRun, limit: Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  console.log(`Backfill Nominatim (dryRun=${dryRun}, limit=${limit === Infinity ? '∞' : limit})`);

  const cache = new Map<string, { latitude: number; longitude: number } | null>();
  let geocodeCalls = 0;
  let updatedStores = 0;
  let updatedSales = 0;
  let skipped = 0;
  let failed = 0;

  async function resolve(parts: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  }) {
    const key = addressKey(parts);
    if (cache.has(key)) return cache.get(key) ?? null;
    if (geocodeCalls >= limit) return null;

    geocodeCalls += 1;
    const result = await nominatimGeocode(parts);
    cache.set(key, result ? { latitude: result.latitude, longitude: result.longitude } : null);
    if (result) {
      console.log(`  OK  ${buildQuery(parts)} → ${result.latitude},${result.longitude}`);
    } else {
      console.log(`  MISS ${buildQuery(parts)}`);
    }
    return result ? { latitude: result.latitude, longitude: result.longitude } : null;
  }

  const stores = await prisma.store.findMany({
    where: {
      OR: [{ latitude: null }, { longitude: null }],
      street: { not: null },
      city: { not: null },
      state: { not: null },
    },
    select: {
      id: true,
      name: true,
      street: true,
      number: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });
  console.log(`\nLojas sem coords: ${stores.length}`);

  for (const store of stores) {
    const coords = await resolve(store);
    if (!coords) {
      failed += 1;
      continue;
    }
    if (!dryRun) {
      await prisma.store.update({
        where: { id: store.id },
        data: { latitude: coords.latitude, longitude: coords.longitude },
      });
    }
    updatedStores += 1;
    console.log(`  Store ${store.name} atualizada`);
  }

  const sales = await prisma.sale.findMany({
    where: {
      deliveryLatitude: null,
      deliveryStreet: { not: null },
      deliveryCity: { not: null },
      deliveryState: { not: null },
    },
    select: {
      id: true,
      deliveryStreet: true,
      deliveryNumber: true,
      deliveryNeighborhood: true,
      deliveryCity: true,
      deliveryState: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nVendas sem coords: ${sales.length}`);

  for (const sale of sales) {
    if (geocodeCalls >= limit && !cache.has(
      addressKey({
        street: sale.deliveryStreet,
        number: sale.deliveryNumber,
        neighborhood: sale.deliveryNeighborhood,
        city: sale.deliveryCity,
        state: sale.deliveryState,
      }),
    )) {
      skipped += 1;
      continue;
    }

    const coords = await resolve({
      street: sale.deliveryStreet,
      number: sale.deliveryNumber,
      neighborhood: sale.deliveryNeighborhood,
      city: sale.deliveryCity,
      state: sale.deliveryState,
    });
    if (!coords) {
      failed += 1;
      continue;
    }
    if (!dryRun) {
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          deliveryLatitude: coords.latitude,
          deliveryLongitude: coords.longitude,
        },
      });
    }
    updatedSales += 1;
  }

  console.log('\nResumo');
  console.log(`  consultas Nominatim: ${geocodeCalls}`);
  console.log(`  endereços únicos em cache: ${cache.size}`);
  console.log(`  lojas atualizadas: ${updatedStores}`);
  console.log(`  vendas atualizadas: ${updatedSales}`);
  console.log(`  falhas/miss: ${failed}`);
  console.log(`  vendas puladas (limit): ${skipped}`);
  if (dryRun) console.log('  (dry-run: nada gravado)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
