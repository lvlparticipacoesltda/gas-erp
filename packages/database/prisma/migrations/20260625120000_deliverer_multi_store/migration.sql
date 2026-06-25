-- Entregador passa a atender N unidades (N:N) em vez de uma única loja.
-- A migração preserva os vínculos existentes: cada Deliverer.storeId vira uma
-- linha em "DelivererStore" antes da coluna ser removida.

-- CreateTable
CREATE TABLE "DelivererStore" (
    "id" TEXT NOT NULL,
    "delivererId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelivererStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DelivererStore_delivererId_storeId_key" ON "DelivererStore"("delivererId", "storeId");

-- CreateIndex
CREATE INDEX "DelivererStore_storeId_idx" ON "DelivererStore"("storeId");

-- Backfill: preserva o vínculo atual (loja primária) de cada entregador.
INSERT INTO "DelivererStore" ("id", "delivererId", "storeId", "createdAt")
SELECT gen_random_uuid()::text, "id", "storeId", CURRENT_TIMESTAMP
FROM "Deliverer";

-- AddForeignKey
ALTER TABLE "DelivererStore" ADD CONSTRAINT "DelivererStore_delivererId_fkey" FOREIGN KEY ("delivererId") REFERENCES "Deliverer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelivererStore" ADD CONSTRAINT "DelivererStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Deliverer" DROP CONSTRAINT "Deliverer_storeId_fkey";

-- DropIndex
DROP INDEX "Deliverer_storeId_idx";

-- AlterTable
ALTER TABLE "Deliverer" DROP COLUMN "storeId";
