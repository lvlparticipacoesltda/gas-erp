-- Controle de vasilhames emprestados (comodato): endereço, responsável e quantidade.
CREATE TABLE "VasilhameLoan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "responsibleName" TEXT NOT NULL,
    "responsiblePhone" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT,
    "landmark" TEXT,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VasilhameLoan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VasilhameLoan_storeId_responsibleName_idx" ON "VasilhameLoan"("storeId", "responsibleName");
CREATE INDEX "VasilhameLoan_organizationId_idx" ON "VasilhameLoan"("organizationId");
CREATE INDEX "VasilhameLoan_customerId_idx" ON "VasilhameLoan"("customerId");

ALTER TABLE "VasilhameLoan" ADD CONSTRAINT "VasilhameLoan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VasilhameLoan" ADD CONSTRAINT "VasilhameLoan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VasilhameLoan" ADD CONSTRAINT "VasilhameLoan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VasilhameLoan" ADD CONSTRAINT "VasilhameLoan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VasilhameLoan" ADD CONSTRAINT "VasilhameLoan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
