-- Garante categorias canônicas P13 / P20 / P45 em todas as organizações.
INSERT INTO "CustomerCategory" ("id", "organizationId", "name", "description", "active", "createdAt", "updatedAt")
SELECT
  'cm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
  o.id,
  v.name,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES ('P13'), ('P20'), ('P45')) AS v(name)
ON CONFLICT ("organizationId", "name") DO UPDATE
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
