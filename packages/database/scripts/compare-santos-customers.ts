/**
 * Compara clientes da planilha de Santos com o que já existe no banco.
 *
 * Uso:
 *   pnpm --filter @gas-erp/database exec dotenv -e ../../.env -- tsx scripts/compare-santos-customers.ts
 */
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadSantosCustomersFromCsv } from './lib/santos-csv';

const STORE_ID = process.env.STORE_ID ?? 'cmqs3fqxf0004jkirid278nw4';
const ORGANIZATION_ID = process.env.ORGANIZATION_ID ?? 'cmqs3fqt20000jkirsp9hvdwv';
const CSV_PATH =
  process.env.CSV_PATH ??
  path.resolve(__dirname, '../../../docs/Clientes_Santos_Consolidado_2024_2026.csv');

async function main() {
  const { customers, rawRows, parsedRows, skippedRows } =
    await loadSantosCustomersFromCsv(CSV_PATH);

  const prisma = new PrismaClient();
  try {
    const store = await prisma.store.findFirst({
      where: { id: STORE_ID, organizationId: ORGANIZATION_ID },
      select: { id: true, name: true, code: true },
    });
    if (!store) {
      throw new Error(`Loja ${STORE_ID} não encontrada.`);
    }

    const existingCustomers = await prisma.customer.findMany({
      where: { storeId: STORE_ID },
      select: { id: true, name: true, phone: true, notes: true },
    });

    const phones = new Set(
      existingCustomers.map((c) => c.phone).filter((p): p is string => Boolean(p)),
    );
    const notes = existingCustomers.map((c) => c.notes ?? '');

    const alreadyInDb: typeof customers = [];
    const missing: typeof customers = [];

    for (const customer of customers) {
      const byLegacy = notes.some((n) => n.includes(customer.legacyKey));
      const byPhone = customer.phone ? phones.has(customer.phone) : false;
      if (byLegacy || byPhone) {
        alreadyInDb.push(customer);
      } else {
        missing.push(customer);
      }
    }

    const migratedNotes = existingCustomers.filter((c) =>
      (c.notes ?? '').includes('legacy:sts:'),
    ).length;

    console.log(`Loja: ${store.name} (${store.code})`);
    console.log(`CSV: ${CSV_PATH}`);
    console.log('');
    console.log('--- Planilha ---');
    console.log(`Linhas brutas: ${rawRows}`);
    console.log(`Linhas parseadas: ${parsedRows}`);
    console.log(`Linhas ignoradas: ${skippedRows}`);
    console.log(`Clientes únicos (após dedupe): ${customers.length}`);
    console.log('');
    console.log('--- Banco (Unidade Santos) ---');
    console.log(`Total de clientes na loja: ${existingCustomers.length}`);
    console.log(`Com nota de migração STS (legacy:sts:): ${migratedNotes}`);
    console.log('');
    console.log('--- Cruzamento CSV × banco ---');
    console.log(`Já existem (seriam ignorados): ${alreadyInDb.length}`);
    console.log(`Faltam importar: ${missing.length}`);

    if (alreadyInDb.length > 0) {
      console.log('\nAmostra já existentes (até 15):');
      for (const row of alreadyInDb.slice(0, 15)) {
        console.log(`  ✓ ${row.name} | ${row.phone ?? 'sem tel'} | ${row.legacyKey}`);
      }
      if (alreadyInDb.length > 15) {
        console.log(`  ... e mais ${alreadyInDb.length - 15}`);
      }
    }

    if (missing.length > 0) {
      console.log('\nAmostra faltantes (até 15):');
      for (const row of missing.slice(0, 15)) {
        console.log(`  · ${row.name} | ${row.phone ?? 'sem tel'} | ${row.legacyKey}`);
      }
      if (missing.length > 15) {
        console.log(`  ... e mais ${missing.length - 15}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
