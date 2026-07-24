-- Escala passa a ser do colaborador (org + user + date), não da loja.
-- Deduplica dias repetidos em unidades diferentes, mantendo o mais recente.

DELETE FROM "WorkScheduleEntry" AS a
USING "WorkScheduleEntry" AS b
WHERE a."organizationId" = b."organizationId"
  AND a."userId" = b."userId"
  AND a."date" = b."date"
  AND a.id <> b.id
  AND (
    a."updatedAt" < b."updatedAt"
    OR (a."updatedAt" = b."updatedAt" AND a.id < b.id)
  );

DROP INDEX IF EXISTS "WorkScheduleEntry_storeId_userId_date_key";

CREATE UNIQUE INDEX "WorkScheduleEntry_organizationId_userId_date_key"
  ON "WorkScheduleEntry"("organizationId", "userId", "date");
