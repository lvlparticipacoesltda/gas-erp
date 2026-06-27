-- CreateEnum
CREATE TYPE "PaymentFeeMode" AS ENUM ('NONE', 'PERCENT', 'FIXED', 'PERCENT_AND_FIXED');

-- CreateTable
CREATE TABLE "StorePaymentMethod" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "systemCode" TEXT,
    "label" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "feeMode" "PaymentFeeMode" NOT NULL DEFAULT 'NONE',
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "feeFixed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePaymentMethod_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SalePayment" ADD COLUMN "storePaymentMethodId" TEXT,
ADD COLUMN "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "StorePaymentMethod_storeId_systemCode_key" ON "StorePaymentMethod"("storeId", "systemCode");

CREATE UNIQUE INDEX "StorePaymentMethod_storeId_label_ci_key" ON "StorePaymentMethod"("storeId", lower("label"));

CREATE INDEX "StorePaymentMethod_storeId_idx" ON "StorePaymentMethod"("storeId");

CREATE INDEX "StorePaymentMethod_organizationId_idx" ON "StorePaymentMethod"("organizationId");

CREATE INDEX "SalePayment_storePaymentMethodId_idx" ON "SalePayment"("storePaymentMethodId");

-- AddForeignKey
ALTER TABLE "StorePaymentMethod" ADD CONSTRAINT "StorePaymentMethod_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorePaymentMethod" ADD CONSTRAINT "StorePaymentMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_storePaymentMethodId_fkey" FOREIGN KEY ("storePaymentMethodId") REFERENCES "StorePaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default payment methods for existing stores
INSERT INTO "StorePaymentMethod" (
    "id", "storeId", "organizationId", "systemCode", "label", "isCustom", "enabled", "sortOrder",
    "feeMode", "feePercent", "feeFixed", "createdAt", "updatedAt"
)
SELECT
    'spm_' || md5(s."id" || codes."systemCode" || s."organizationId"),
    s."id",
    s."organizationId",
    codes."systemCode",
    codes."label",
    false,
    codes."enabled",
    codes."sortOrder",
    'NONE'::"PaymentFeeMode",
    0,
    0,
    NOW(),
    NOW()
FROM "Store" s
CROSS JOIN (
    VALUES
        ('CASH', 'Dinheiro', true, 0),
        ('PIX', 'PIX', true, 1),
        ('CREDIT_CARD', 'Cartão de Crédito', true, 2),
        ('DEBIT_CARD', 'Cartão de Débito', true, 3),
        ('CHECK', 'Cheque', true, 4),
        ('CUSTOMER_CREDIT', 'Crédito de Cliente', true, 5),
        ('GDP', 'GDP (Gás do Povo)', false, 6),
        ('OTHER', 'Outro', true, 7)
) AS codes("systemCode", "label", "enabled", "sortOrder");
