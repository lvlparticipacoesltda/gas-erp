-- Campos de RH para cartão de ponto (opcionais; existentes ficam NULL).
ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
ALTER TABLE "User" ADD COLUMN "pis" TEXT;
ALTER TABLE "User" ADD COLUMN "admittedAt" DATE;
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
