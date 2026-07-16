import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

export const PG_PRINCESA_PERIOD_ORDER: Record<string, number> = {
  'De 01/01/2025 até 31/12/2025': 1,
  'De 01/01/2026 até 14/07/2026': 2,
};

export type PgPrincesaCsvRow = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  city: string;
  neighborhood: string;
  name: string;
  personType: string;
  category: string;
  addressRaw: string;
  phoneRaw: string;
  sourceFile: string;
};

export type ParsedCustomerAddress = {
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  isDefault: true;
};

export type NormalizedCustomer = {
  legacyKey: string;
  name: string;
  phone: string | null;
  notes: string;
  category: string;
  address: ParsedCustomerAddress;
  periodLabel: string;
  sourceFile: string;
};

function unwrapCsvLine(line: string): string {
  let trimmed = line.trim().replace(/^\uFEFF/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1);
  }
  return trimmed.replace(/""/g, '"');
}

function parseCsvLine(line: string): string[] {
  const trimmed = unwrapCsvLine(line);
  if (!trimmed) return [];

  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

/** Fallback quando vírgulas extras deslocam colunas. Aceita telefone vazio. */
function parseRowLineAnchored(line: string): string[] | null {
  const trimmed = unwrapCsvLine(line);

  const pdfTail = trimmed.match(/,([^,]+\.pdf)$/i);
  if (!pdfTail) return null;
  const sourceFile = pdfTail[1];
  let rest = trimmed.slice(0, trimmed.length - pdfTail[0].length);

  let phoneRaw = '';
  const phoneTail = rest.match(/,\((\d{2})\)\s*([\d-]+)$/);
  if (phoneTail) {
    phoneRaw = `(${phoneTail[1]}) ${phoneTail[2]}`;
    rest = rest.slice(0, rest.length - phoneTail[0].length);
  } else if (rest.endsWith(',')) {
    rest = rest.slice(0, -1);
  } else {
    return null;
  }

  const addrMatch = rest.match(/,"((?:[^"]|"")*)"$/);
  if (!addrMatch) return null;
  const addressRaw = addrMatch[1].replace(/""/g, '"');
  rest = rest.slice(0, rest.length - addrMatch[0].length);

  const metaMatch = rest.match(
    /,(Física),(?:"((?:[^"]|"")*)"|(Sem categoria|desconto P45|P13 a R\$ [^,]+))$/,
  );
  if (!metaMatch) return null;
  const personType = metaMatch[1];
  const category = (metaMatch[2] ?? metaMatch[3] ?? '').replace(/""/g, '"');
  rest = rest.slice(0, rest.length - metaMatch[0].length);

  const headMatch = rest.match(
    /^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2}),(De \d{2}\/\d{2}\/\d{4} até \d{2}\/\d{2}\/\d{4}),(.*)$/,
  );
  if (!headMatch) return null;
  const [, periodStart, periodEnd, periodLabel, tail] = headMatch;

  const cityMatch = tail.match(/^Praia Grande,(.+)$/);
  if (!cityMatch) return null;
  const afterCity = cityMatch[1];

  const commaIndex = afterCity.indexOf(',');
  if (commaIndex < 0) return null;
  const neighborhood = afterCity.slice(0, commaIndex);
  const nameRaw = afterCity.slice(commaIndex + 1);
  const name = nameRaw.replace(/^"+|"+$/g, '').replace(/,+/g, '').trim();

  return [
    periodStart,
    periodEnd,
    periodLabel,
    'Praia Grande',
    neighborhood,
    name,
    personType,
    category,
    addressRaw,
    phoneRaw,
    sourceFile,
  ];
}

function parseRowLine(line: string): string[] {
  const fields = parseCsvLine(line);
  if (fields.length === 11) return fields;
  return parseRowLineAnchored(line) ?? fields;
}

/**
 * Corrige linhas em que categoria e endereço foram misturados no CSV legado.
 * Ex.: category="deconto P13 Yago Rua Eunice..., 120 -" address="Balneario Anchieta"
 */
function repairMangledCategoryAddress(row: PgPrincesaCsvRow): PgPrincesaCsvRow {
  const addressLooksLikeNeighborhoodOnly =
    !/[,\d]/.test(row.addressRaw) ||
    row.addressRaw.trim().toLowerCase() === row.neighborhood.trim().toLowerCase();

  const streetInCategory = row.category.match(
    /((?:Rua|Av\.?|Avenida|Praça|Travessa)\s.+)$/i,
  );
  if (!addressLooksLikeNeighborhoodOnly || !streetInCategory) return row;

  const streetPart = streetInCategory[1].replace(/\s*-\s*$/, '').trim();
  let category = row.category.slice(0, streetInCategory.index).trim();
  category = category
    .replace(/\bYago\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^deconto/i, 'desconto')
    .trim();
  if (!category) category = 'Sem categoria';

  const neighborhood = row.neighborhood.trim() || row.addressRaw.trim();
  return {
    ...row,
    category,
    addressRaw: `${streetPart} - ${neighborhood}`,
  };
}

function isUsableName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (/^[.,\s]+$/.test(trimmed)) return false;
  return /[a-zA-ZÀ-ÿ]{2,}/.test(trimmed);
}

function resolveDisplayName(
  rawName: string,
  phone: string | null,
  address: ParsedCustomerAddress,
): string {
  const trimmed = rawName.trim();
  if (isUsableName(trimmed)) return trimmed;
  if (phone) return `Cliente ${phone}`;
  return `Cliente - ${address.street}`;
}

export function normalizePhone(raw: string): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits.length >= 10 ? digits : null;
}

export function parseAddress(
  addressRaw: string,
  neighborhood: string,
  city: string,
): ParsedCustomerAddress {
  const trimmed = addressRaw.trim();
  const dashIndex = trimmed.lastIndexOf(' - ');
  const streetPart = dashIndex >= 0 ? trimmed.slice(0, dashIndex).trim() : trimmed;

  let street = streetPart;
  let number: string | undefined;

  const commaIndex = streetPart.lastIndexOf(',');
  if (commaIndex >= 0) {
    street = streetPart.slice(0, commaIndex).trim();
    const numberPart = streetPart.slice(commaIndex + 1).trim();
    number = numberPart || undefined;
  }

  return {
    street: street || trimmed,
    number,
    neighborhood: neighborhood.trim() || undefined,
    city: city.trim() || 'Praia Grande',
    state: 'SP',
    isDefault: true,
  };
}

function periodScore(periodLabel: string): number {
  return PG_PRINCESA_PERIOD_ORDER[periodLabel] ?? 0;
}

export function buildLegacyKey(name: string, phone: string | null, address: ParsedCustomerAddress): string {
  if (phone) return `legacy:pgpr:phone:${phone}`;
  const fingerprint = [
    name.trim().toUpperCase(),
    address.street.trim().toUpperCase(),
    (address.number ?? '').trim().toUpperCase(),
    (address.neighborhood ?? '').trim().toUpperCase(),
  ].join('|');
  const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 12);
  return `legacy:pgpr:nameaddr:${hash}`;
}

function rowFromFields(fields: string[]): PgPrincesaCsvRow | null {
  if (fields.length < 11) return null;
  return {
    periodStart: fields[0],
    periodEnd: fields[1],
    periodLabel: fields[2],
    city: fields[3],
    neighborhood: fields[4],
    name: fields[5],
    personType: fields[6],
    category: fields[7],
    addressRaw: fields[8],
    phoneRaw: fields[9],
    sourceFile: fields[10],
  };
}

export function normalizeRow(row: PgPrincesaCsvRow): NormalizedCustomer | null {
  const fixed = repairMangledCategoryAddress(row);
  const phone = normalizePhone(fixed.phoneRaw);
  const address = parseAddress(fixed.addressRaw, fixed.neighborhood, fixed.city);
  const name = resolveDisplayName(fixed.name, phone, address);
  if (!phone && !isUsableName(fixed.name.trim()) && address.street.length < 3) return null;

  const legacyKey = buildLegacyKey(name, phone, address);

  return {
    legacyKey,
    name,
    phone,
    notes: `Migrado CSV Praia Grande Princesa (2025-2026). ${legacyKey}`,
    category: fixed.category.trim(),
    address,
    periodLabel: fixed.periodLabel,
    sourceFile: fixed.sourceFile,
  };
}

export function dedupeCustomers(rows: NormalizedCustomer[]): NormalizedCustomer[] {
  const bestByKey = new Map<string, NormalizedCustomer>();

  for (const row of rows) {
    const dedupeKey = row.phone ? `phone:${row.phone}` : row.legacyKey;
    const existing = bestByKey.get(dedupeKey);
    if (!existing || periodScore(row.periodLabel) >= periodScore(existing.periodLabel)) {
      bestByKey.set(dedupeKey, row);
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export async function loadPgPrincesaCustomersFromCsv(filePath: string): Promise<{
  rawRows: number;
  parsedRows: number;
  skippedRows: number;
  customers: NormalizedCustomer[];
}> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let isHeader = true;
  let rawRows = 0;
  let skippedRows = 0;
  const normalized: NormalizedCustomer[] = [];

  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;

    rawRows += 1;
    const fields = parseRowLine(line);
    const row = rowFromFields(fields);
    if (!row) {
      skippedRows += 1;
      continue;
    }

    const customer = normalizeRow(row);
    if (!customer) {
      skippedRows += 1;
      continue;
    }
    normalized.push(customer);
  }

  return {
    rawRows,
    parsedRows: normalized.length,
    skippedRows,
    customers: dedupeCustomers(normalized),
  };
}
