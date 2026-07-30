-- Slot explícito no cartão de ponto (permite atendente pular SAÍ.1 / ENT.2).
ALTER TABLE "TimeClockPunch" ADD COLUMN "slot" TEXT;
