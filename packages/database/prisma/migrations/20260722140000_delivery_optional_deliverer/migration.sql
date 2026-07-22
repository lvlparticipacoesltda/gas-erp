-- Pedidos em espera: entrega pode existir sem entregador alocado.
ALTER TABLE "Delivery" ALTER COLUMN "delivererId" DROP NOT NULL;
