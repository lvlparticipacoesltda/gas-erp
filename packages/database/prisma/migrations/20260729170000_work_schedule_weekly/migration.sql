-- CreateTable
CREATE TABLE "WorkScheduleWeekly" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkScheduleWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkScheduleWeeklyDay" (
    "id" TEXT NOT NULL,
    "weeklyId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "dayType" "ScheduleDayType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "breakStart" TEXT,
    "breakEnd" TEXT,

    CONSTRAINT "WorkScheduleWeeklyDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkScheduleWeekly_userId_key" ON "WorkScheduleWeekly"("userId");

-- CreateIndex
CREATE INDEX "WorkScheduleWeekly_organizationId_storeId_idx" ON "WorkScheduleWeekly"("organizationId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkScheduleWeekly_organizationId_userId_key" ON "WorkScheduleWeekly"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "WorkScheduleWeeklyDay_weeklyId_idx" ON "WorkScheduleWeeklyDay"("weeklyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkScheduleWeeklyDay_weeklyId_weekday_key" ON "WorkScheduleWeeklyDay"("weeklyId", "weekday");

-- AddForeignKey
ALTER TABLE "WorkScheduleWeekly" ADD CONSTRAINT "WorkScheduleWeekly_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleWeekly" ADD CONSTRAINT "WorkScheduleWeekly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleWeekly" ADD CONSTRAINT "WorkScheduleWeekly_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleWeeklyDay" ADD CONSTRAINT "WorkScheduleWeeklyDay_weeklyId_fkey" FOREIGN KEY ("weeklyId") REFERENCES "WorkScheduleWeekly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
