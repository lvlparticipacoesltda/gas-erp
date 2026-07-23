-- Marca vendas Gás do Povo que ficaram sem o flag (pagamento por produto / taxa GDP).
UPDATE "Sale" s
SET "gasDoPovoBenefit" = true
WHERE s."gasDoPovoBenefit" = false
  AND (
    EXISTS (
      SELECT 1
      FROM "SalePayment" p
      WHERE p."saleId" = s.id
        AND p.method = 'GDP'
    )
    OR EXISTS (
      SELECT 1
      FROM "SalePayment" p
      INNER JOIN "StorePaymentMethod" m ON m.id = p."storePaymentMethodId"
      WHERE p."saleId" = s.id
        AND m."systemCode" = 'GDP'
    )
    OR EXISTS (
      SELECT 1
      FROM "SaleItem" i
      INNER JOIN "StorePaymentMethod" m ON m.id = i."storePaymentMethodId"
      WHERE i."saleId" = s.id
        AND m."systemCode" = 'GDP'
    )
    OR EXISTS (
      SELECT 1
      FROM "SaleItem" i
      INNER JOIN "Product" pr ON pr.id = i."productId"
      WHERE i."saleId" = s.id
        AND (
          pr.name ILIKE '%gás do povo%'
          OR pr.name ILIKE '%gas do povo%'
        )
    )
  );
