-- Forma de pagamento por produto (+ taxa de entrega).
ALTER TABLE "SaleItem" ADD COLUMN "storePaymentMethodId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "deliveryFeeStorePaymentMethodId" TEXT;

CREATE INDEX "SaleItem_storePaymentMethodId_idx" ON "SaleItem"("storePaymentMethodId");
CREATE INDEX "Sale_deliveryFeeStorePaymentMethodId_idx" ON "Sale"("deliveryFeeStorePaymentMethodId");

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_storePaymentMethodId_fkey"
  FOREIGN KEY ("storePaymentMethodId") REFERENCES "StorePaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_deliveryFeeStorePaymentMethodId_fkey"
  FOREIGN KEY ("deliveryFeeStorePaymentMethodId") REFERENCES "StorePaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
