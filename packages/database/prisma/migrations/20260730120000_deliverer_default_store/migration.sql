-- Unidade padrão do entregador para Escalas / Horários (escopo multi-loja).
ALTER TABLE "Deliverer" ADD COLUMN "defaultStoreId" TEXT;

CREATE INDEX "Deliverer_defaultStoreId_idx" ON "Deliverer"("defaultStoreId");

ALTER TABLE "Deliverer" ADD CONSTRAINT "Deliverer_defaultStoreId_fkey"
  FOREIGN KEY ("defaultStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: primeira unidade vinculada (createdAt ASC).
UPDATE "Deliverer" d
SET "defaultStoreId" = sub."storeId"
FROM (
  SELECT DISTINCT ON (ds."delivererId")
    ds."delivererId",
    ds."storeId"
  FROM "DelivererStore" ds
  ORDER BY ds."delivererId", ds."createdAt" ASC, ds."storeId" ASC
) sub
WHERE d.id = sub."delivererId"
  AND d."defaultStoreId" IS NULL;
