-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "installment" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseInvoice_storeId_issueDate_idx" ON "PurchaseInvoice"("storeId", "issueDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItem_invoiceId_idx" ON "PurchaseInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseInvoicePayment_invoiceId_idx" ON "PurchaseInvoicePayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItem" ADD CONSTRAINT "PurchaseInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItem" ADD CONSTRAINT "PurchaseInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoicePayment" ADD CONSTRAINT "PurchaseInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
