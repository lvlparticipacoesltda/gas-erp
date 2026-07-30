-- Garante categoria canônica "Gás do Povo" em todas as organizações.
INSERT INTO "CustomerCategory" ("id", "organizationId", "name", "description", "active", "createdAt", "updatedAt")
SELECT
  'cm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
  o.id,
  'Gás do Povo',
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
ON CONFLICT ("organizationId", "name") DO UPDATE
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
