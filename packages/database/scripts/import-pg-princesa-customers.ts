/**
 * Importa clientes da planilha legada de Praia Grande Princesa para o Gas ERP.
 *
 * Uso:
 *   pnpm --filter @gas-erp/database import:pgpr-customers -- --dry-run
 *   pnpm --filter @gas-erp/database import:pgpr-customers
 *
 * Variáveis (opcionais):
 *   ORGANIZATION_ID, STORE_ID, CSV_PATH
 */
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadPgPrincesaCustomersFromCsv } from './lib/pg-princesa-csv';

const DEFAULT_ORGANIZATION_ID = 'cmqs3fqt20000jkirsp9hvdwv';
const DEFAULT_STORE_ID = 'cmr4s03rf003xqm01ywi4akeh';
const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  '../../../docs/Clientes_PG2_Consolidado_2025_2026.csv',
);

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
    csvPath: process.env.CSV_PATH ?? DEFAULT_CSV_PATH,
    organizationId: process.env.ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID,
    storeId: process.env.STORE_ID ?? DEFAULT_STORE_ID,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { dryRun, csvPath, organizationId, storeId } = parseArgs(process.argv.slice(2));

  console.log(`CSV: ${csvPath}`);
  console.log(`organizationId: ${organizationId}`);
  console.log(`storeId: ${storeId}`);
  console.log(`modo: ${dryRun ? 'DRY-RUN' : 'IMPORT'}`);

  const { rawRows, parsedRows, skippedRows, customers } =
    await loadPgPrincesaCustomersFromCsv(csvPath);

  const withPhone = customers.filter((c) => c.phone).length;
  const withoutPhone = customers.length - withPhone;
  const specialCategories = customers.filter((c) => c.category && c.category !== 'Sem categoria');

  console.log('\n--- Análise ---');
  console.log(`Linhas brutas: ${rawRows}`);
  console.log(`Linhas parseadas: ${parsedRows}`);
  console.log(`Linhas ignoradas: ${skippedRows}`);
  console.log(`Clientes únicos após deduplicar: ${customers.length}`);
  console.log(`Com telefone: ${withPhone}`);
  console.log(`Sem telefone: ${withoutPhone}`);
  if (specialCategories.length > 0) {
    console.log(`Categorias especiais (revisar preço manualmente): ${specialCategories.length}`);
    for (const row of specialCategories.slice(0, 10)) {
      console.log(`  - ${row.name}: ${row.category}`);
    }
  }

  if (dryRun) {
    console.log('\nAmostra (5 primeiros):');
    for (const row of customers.slice(0, 5)) {
      console.log(
        JSON.stringify(
          {
            name: row.name,
            phone: row.phone,
            address: row.address,
            legacyKey: row.legacyKey,
          },
          null,
          2,
        ),
      );
    }
    console.log('\nDry-run concluído. Nenhum registro foi gravado.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const store = await prisma.store.findFirst({
      where: { id: storeId, organizationId },
      select: { id: true, name: true, code: true },
    });
    if (!store) {
      throw new Error(
        `Loja ${storeId} não encontrada na organização ${organizationId}. Verifique ORGANIZATION_ID e STORE_ID.`,
      );
    }
    console.log(`\nLoja destino: ${store.name} (${store.code})`);

    const existingRows = await prisma.customer.findMany({
      where: { storeId },
      select: { phone: true, notes: true },
    });
    const existingPhones = new Set(
      existingRows.map((c) => c.phone).filter((p): p is string => Boolean(p)),
    );
    const existingLegacyKeys = new Set<string>();
    for (const row of existingRows) {
      const match = (row.notes ?? '').match(/legacy:pgpr:[^\s]+/);
      if (match) existingLegacyKeys.add(match[0]);
    }
    console.log(
      `Já no banco: ${existingRows.length} (phones=${existingPhones.size}, keys=${existingLegacyKeys.size})`,
    );

    let created = 0;
    let skippedExisting = 0;
    let failed = 0;

    for (let offset = 0; offset < customers.length; offset += BATCH_SIZE) {
      const batch = customers.slice(offset, offset + BATCH_SIZE);

      for (const customer of batch) {
        const already =
          existingLegacyKeys.has(customer.legacyKey) ||
          (customer.phone ? existingPhones.has(customer.phone) : false);

        if (already) {
          skippedExisting += 1;
          continue;
        }

        let attempt = 0;
        while (attempt < MAX_RETRIES) {
          attempt += 1;
          try {
            await prisma.customer.create({
              data: {
                organizationId,
                storeId,
                name: customer.name,
                phone: customer.phone,
                notes: customer.notes,
                addresses: {
                  create: [customer.address],
                },
              },
            });
            created += 1;
            existingLegacyKeys.add(customer.legacyKey);
            if (customer.phone) existingPhones.add(customer.phone);
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const retryable =
              message.includes('Unable to start a transaction') ||
              message.includes('Timed out fetching') ||
              message.includes("Can't reach database");
            if (retryable && attempt < MAX_RETRIES) {
              await sleep(1000 * attempt);
              continue;
            }
            failed += 1;
            console.error(`Falha ao importar ${customer.name}: ${message}`);
            break;
          }
        }
      }

      console.log(
        `Progresso: ${Math.min(offset + BATCH_SIZE, customers.length)}/${customers.length} (criados=${created}, ignorados=${skippedExisting}, falhas=${failed})`,
      );
    }

    console.log('\n--- Resultado ---');
    console.log(`Criados: ${created}`);
    console.log(`Já existiam (ignorados): ${skippedExisting}`);
    console.log(`Falhas: ${failed}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
