-- CreateEnum
CREATE TYPE "MobileApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "mobileApproval" "MobileApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "mobileApprovedAt" TIMESTAMP(3),
ADD COLUMN     "mobileApprovedById" TEXT,
ADD COLUMN     "mobileRejectionReason" TEXT,
ADD COLUMN     "createdByDelivererId" TEXT;

-- CreateTable
CREATE TABLE "SaleMobileApprovalLog" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleMobileApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_mobileApproval_idx" ON "Sale"("mobileApproval");

-- CreateIndex
CREATE INDEX "Sale_createdByDelivererId_idx" ON "Sale"("createdByDelivererId");

-- CreateIndex
CREATE INDEX "SaleMobileApprovalLog_saleId_createdAt_idx" ON "SaleMobileApprovalLog"("saleId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_mobileApprovedById_fkey" FOREIGN KEY ("mobileApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdByDelivererId_fkey" FOREIGN KEY ("createdByDelivererId") REFERENCES "Deliverer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleMobileApprovalLog" ADD CONSTRAINT "SaleMobileApprovalLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleMobileApprovalLog" ADD CONSTRAINT "SaleMobileApprovalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
