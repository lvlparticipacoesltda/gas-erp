-- Toda despesa passa a ser custo direto de uma unidade: o rateio da "despesa da
-- organização" foi eliminado do modelo de resultado. As linhas sem unidade eram do
-- período de desenvolvimento do painel e não têm unidade a que pertencer.
DELETE FROM "Expense" WHERE "storeId" IS NULL;

ALTER TABLE "Expense" ALTER COLUMN "storeId" SET NOT NULL;
