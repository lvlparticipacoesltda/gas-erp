-- Dispositivo confiável (atendente) + deviceId na sessão + códigos de pareamento.
ALTER TABLE "UserSession" ADD COLUMN "deviceId" TEXT;

CREATE INDEX "UserSession_userId_deviceId_idx" ON "UserSession"("userId", "deviceId");

CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedDevice_userId_deviceId_key" ON "TrustedDevice"("userId", "deviceId");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DevicePairingCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairingCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevicePairingCode_userId_code_idx" ON "DevicePairingCode"("userId", "code");
CREATE INDEX "DevicePairingCode_expiresAt_idx" ON "DevicePairingCode"("expiresAt");

ALTER TABLE "DevicePairingCode" ADD CONSTRAINT "DevicePairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
