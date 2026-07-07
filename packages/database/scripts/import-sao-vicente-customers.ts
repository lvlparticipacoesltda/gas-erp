/**
 * Importa clientes da planilha legada de São Vicente para o Gas ERP.
 *
 * Uso:
 *   pnpm --filter @gas-erp/database import:sv-customers -- --dry-run
 *   pnpm --filter @gas-erp/database import:sv-customers
 *
 * Variáveis (opcionais):
 *   ORGANIZATION_ID, STORE_ID, CSV_PATH
 */
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadSaoVicenteCustomersFromCsv } from './lib/sao-vicente-csv';

const DEFAULT_ORGANIZATION_ID = 'cmqs3fqt20000jkirsp9hvdwv';
const DEFAULT_STORE_ID = 'cmqs3fqv40002jkirwy68hq1k';
const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  '../../../docs/Clientes_Sao_Vicente_Consolidado_2024_2026.csv',
);

const BATCH_SIZE = 25;
const TRANSACTION_TIMEOUT_MS = 120_000;

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
    csvPath: process.env.CSV_PATH ?? DEFAULT_CSV_PATH,
    organizationId: process.env.ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID,
    storeId: process.env.STORE_ID ?? DEFAULT_STORE_ID,
  };
}

async function main() {
  const { dryRun, csvPath, organizationId, storeId } = parseArgs(process.argv.slice(2));

  console.log(`CSV: ${csvPath}`);
  console.log(`organizationId: ${organizationId}`);
  console.log(`storeId: ${storeId}`);
  console.log(`modo: ${dryRun ? 'DRY-RUN' : 'IMPORT'}`);

  const { rawRows, parsedRows, skippedRows, customers } =
    await loadSaoVicenteCustomersFromCsv(csvPath);

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

    let created = 0;
    let skippedExisting = 0;
    let failed = 0;

    for (let offset = 0; offset < customers.length; offset += BATCH_SIZE) {
      const batch = customers.slice(offset, offset + BATCH_SIZE);

      await prisma.$transaction(
        async (tx) => {
          for (const customer of batch) {
            const existing = await tx.customer.findFirst({
              where: {
                storeId,
                OR: [
                  { notes: { contains: customer.legacyKey } },
                  ...(customer.phone ? [{ phone: customer.phone }] : []),
                ],
              },
              select: { id: true },
            });

            if (existing) {
              skippedExisting += 1;
              continue;
            }

            try {
              await tx.customer.create({
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
            } catch (error) {
              failed += 1;
              const message = error instanceof Error ? error.message : String(error);
              console.error(`Falha ao importar ${customer.name}: ${message}`);
            }
          }
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      );

      console.log(`Progresso: ${Math.min(offset + BATCH_SIZE, customers.length)}/${customers.length}`);
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
