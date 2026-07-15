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

-- Multi-unidade: unidade da rota IN_PROGRESS mais recente.
UPDATE "Deliverer" d
SET "availableStoreId" = sub."storeId"
FROM (
  SELECT DISTINCT ON (del."delivererId")
    del."delivererId",
    s."storeId" AS "storeId"
  FROM "Delivery" del
  INNER JOIN "Sale" s ON s.id = del."saleId"
  WHERE del.status = 'IN_PROGRESS'
  ORDER BY del."delivererId", del."startedAt" DESC NULLS LAST, del."createdAt" DESC
) sub
WHERE d.id = sub."delivererId"
  AND d.status <> 'OFFLINE'
  AND d."availableStoreId" IS NULL;

-- Multi-unidade: se ainda null, unidade da PENDING mais recente.
UPDATE "Deliverer" d
SET "availableStoreId" = sub."storeId"
FROM (
  SELECT DISTINCT ON (del."delivererId")
    del."delivererId",
    s."storeId" AS "storeId"
  FROM "Delivery" del
  INNER JOIN "Sale" s ON s.id = del."saleId"
  WHERE del.status = 'PENDING'
  ORDER BY del."delivererId", del."createdAt" DESC
) sub
WHERE d.id = sub."delivererId"
  AND d.status <> 'OFFLINE'
  AND d."availableStoreId" IS NULL;
