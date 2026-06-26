-- Vendas de retirada (sem entrega) passam a usar o status PORTARIA em vez de DELIVERED
UPDATE "Sale" s
SET status = 'PORTARIA'
WHERE s.status = 'DELIVERED'
  AND NOT EXISTS (SELECT 1 FROM "Delivery" d WHERE d."saleId" = s.id);

UPDATE "SaleStatusLog" sl
SET status = 'PORTARIA'
FROM "Sale" s
WHERE sl."saleId" = s.id
  AND s.status = 'PORTARIA'
  AND sl.status = 'DELIVERED';
