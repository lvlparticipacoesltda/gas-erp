-- Vínculo do GLP (cheio) com o vasilhame (vazio) correspondente.
ALTER TABLE "Product" ADD COLUMN "vasilhameProductId" TEXT;

CREATE INDEX "Product_vasilhameProductId_idx" ON "Product"("vasilhameProductId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_vasilhameProductId_fkey"
  FOREIGN KEY ("vasilhameProductId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
