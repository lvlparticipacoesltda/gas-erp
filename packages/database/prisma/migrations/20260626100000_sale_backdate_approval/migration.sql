-- CreateEnum
CREATE TYPE "BackdateApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Sale" ADD COLUMN "backdateApproval" "BackdateApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "Sale" ADD COLUMN "backdateApprovedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "backdateApprovedById" TEXT;
ALTER TABLE "Sale" ADD COLUMN "backdateRequestNotes" TEXT;
ALTER TABLE "Sale" ADD COLUMN "backdateRejectionReason" TEXT;

-- Backfill saleDate from createdAt for existing rows
UPDATE "Sale" SET "saleDate" = "createdAt" WHERE "saleDate" IS DISTINCT FROM "createdAt";

-- CreateTable
CREATE TABLE "SaleBackdateLog" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleBackdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_storeId_saleDate_idx" ON "Sale"("storeId", "saleDate");
CREATE INDEX "Sale_backdateApproval_idx" ON "Sale"("backdateApproval");
CREATE INDEX "SaleBackdateLog_saleId_createdAt_idx" ON "SaleBackdateLog"("saleId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_backdateApprovedById_fkey" FOREIGN KEY ("backdateApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleBackdateLog" ADD CONSTRAINT "SaleBackdateLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleBackdateLog" ADD CONSTRAINT "SaleBackdateLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
