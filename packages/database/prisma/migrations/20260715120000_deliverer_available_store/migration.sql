-- Unidade em que o entregador está disponível no mapa (escopo por loja).
ALTER TABLE "Deliverer" ADD COLUMN "availableStoreId" TEXT;

CREATE INDEX "Deliverer_availableStoreId_idx" ON "Deliverer"("availableStoreId");

ALTER TABLE "Deliverer" ADD CONSTRAINT "Deliverer_availableStoreId_fkey"
  FOREIGN KEY ("availableStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: entregadores não-OFFLINE com exatamente uma unidade vinculada.
UPDATE "Deliverer" d
SET "availableStoreId" = sub."storeId"
FROM (
  SELECT ds."delivererId", MIN(ds."storeId") AS "storeId"
  FROM "DelivererStore" ds
  GROUP BY ds."delivererId"
  HAVING COUNT(*) = 1
) sub
WHERE d.id = sub."delivererId"
  AND d.status <> 'OFFLINE'
  AND d."availableStoreId" IS NULL;
