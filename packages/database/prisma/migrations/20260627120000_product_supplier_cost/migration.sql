-- Custo fornecedor por loja e snapshot de custo na venda (margem histórica).
ALTER TABLE "ProductStoreSetting" ADD COLUMN "supplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
