-- Justificativas de ausência no cartão de ponto (atestado, abono, falta justificada).
CREATE TYPE "TimeClockJustificationType" AS ENUM (
    'ATESTADO_MEDICO',
    'DECLARACAO_COMPARECIMENTO',
    'ABONO_AUSENCIA',
    'FALTA_JUSTIFICADA'
);

CREATE TABLE "TimeClockJustification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TimeClockJustificationType" NOT NULL,
    "notes" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "fileBytes" BYTEA,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockJustification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimeClockJustification_userId_startAt_idx" ON "TimeClockJustification"("userId", "startAt");
CREATE INDEX "TimeClockJustification_storeId_startAt_idx" ON "TimeClockJustification"("storeId", "startAt");
CREATE INDEX "TimeClockJustification_organizationId_startAt_idx" ON "TimeClockJustification"("organizationId", "startAt");

ALTER TABLE "TimeClockJustification" ADD CONSTRAINT "TimeClockJustification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeClockJustification" ADD CONSTRAINT "TimeClockJustification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeClockJustification" ADD CONSTRAINT "TimeClockJustification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeClockJustification" ADD CONSTRAINT "TimeClockJustification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
