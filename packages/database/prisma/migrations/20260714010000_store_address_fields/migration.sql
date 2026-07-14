-- Structured address + coordinates for store/unit (home navigation for deliverers)
ALTER TABLE "Store" ADD COLUMN "street" TEXT;
ALTER TABLE "Store" ADD COLUMN "number" TEXT;
ALTER TABLE "Store" ADD COLUMN "complement" TEXT;
ALTER TABLE "Store" ADD COLUMN "neighborhood" TEXT;
ALTER TABLE "Store" ADD COLUMN "zipCode" TEXT;
ALTER TABLE "Store" ADD COLUMN "landmark" TEXT;
ALTER TABLE "Store" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Store" ADD COLUMN "longitude" DOUBLE PRECISION;
