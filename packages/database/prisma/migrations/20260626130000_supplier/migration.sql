-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('PJ', 'PF');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL DEFAULT 'PJ',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "stateRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "rntrc" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "landmark" TEXT,
    "notes" TEXT,
    "finalConsumer" BOOLEAN NOT NULL DEFAULT false,
    "publicAgency" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE INDEX "Supplier_legalName_idx" ON "Supplier"("legalName");

-- CreateIndex
CREATE INDEX "Supplier_document_idx" ON "Supplier"("document");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
