-- Clientes passam a pertencer a uma loja específica.
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;

-- Vincula pelo histórico de vendas (loja da venda mais recente).
UPDATE "Customer" c
SET "storeId" = sub."storeId"
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", "storeId"
  FROM "Sale"
  WHERE "customerId" IS NOT NULL
  ORDER BY "customerId", "createdAt" DESC
) sub
WHERE c.id = sub."customerId";

-- Clientes sem venda: primeira loja da organização.
UPDATE "Customer" c
SET "storeId" = (
  SELECT s.id
  FROM "Store" s
  WHERE s."organizationId" = c."organizationId"
  ORDER BY s."createdAt" ASC
  LIMIT 1
)
WHERE c."storeId" IS NULL;

ALTER TABLE "Customer" ALTER COLUMN "storeId" SET NOT NULL;

CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE INDEX "Customer_storeId_name_idx" ON "Customer"("storeId", "name");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
