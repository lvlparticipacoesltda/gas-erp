-- CreateEnum
CREATE TYPE "ScheduleDayType" AS ENUM ('WORK', 'HALF_DAY', 'DAY_OFF');

-- CreateEnum
CREATE TYPE "TimeClockPunchType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "TimeClockSource" AS ENUM ('WEB', 'MOBILE');

-- CreateTable
CREATE TABLE "WorkScheduleEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayType" "ScheduleDayType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeClockPunch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TimeClockPunchType" NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "photoBytes" BYTEA,
    "source" "TimeClockSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeClockPunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkScheduleEntry_organizationId_storeId_date_idx" ON "WorkScheduleEntry"("organizationId", "storeId", "date");

-- CreateIndex
CREATE INDEX "WorkScheduleEntry_userId_date_idx" ON "WorkScheduleEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkScheduleEntry_storeId_userId_date_key" ON "WorkScheduleEntry"("storeId", "userId", "date");

-- CreateIndex
CREATE INDEX "TimeClockPunch_storeId_userId_punchedAt_idx" ON "TimeClockPunch"("storeId", "userId", "punchedAt");

-- CreateIndex
CREATE INDEX "TimeClockPunch_organizationId_punchedAt_idx" ON "TimeClockPunch"("organizationId", "punchedAt");

-- AddForeignKey
ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TimeClockPunch" ADD CONSTRAINT "TimeClockPunch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeClockPunch" ADD CONSTRAINT "TimeClockPunch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeClockPunch" ADD CONSTRAINT "TimeClockPunch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
