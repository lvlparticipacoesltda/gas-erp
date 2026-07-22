-- Coordenadas do endereço de entrega, geocodificadas uma única vez.
-- Elimina re-geocodificação (API paga do Google) a cada leitura/restart.
ALTER TABLE "Sale" ADD COLUMN "deliveryLatitude" DOUBLE PRECISION;
ALTER TABLE "Sale" ADD COLUMN "deliveryLongitude" DOUBLE PRECISION;
