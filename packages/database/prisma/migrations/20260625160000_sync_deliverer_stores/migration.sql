-- Sincroniza DelivererStore com UserStore para entregadores já cadastrados.
-- O painel Master atualiza UserStore; a seleção na venda usa DelivererStore.

INSERT INTO "Deliverer" ("id", "userId", "status", "createdAt", "updatedAt")
SELECT
  'cm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
  u."id",
  'AVAILABLE',
  NOW(),
  NOW()
FROM "User" u
WHERE u."role" = 'DELIVERER'
  AND NOT EXISTS (SELECT 1 FROM "Deliverer" d WHERE d."userId" = u."id");

INSERT INTO "DelivererStore" ("id", "delivererId", "storeId", "createdAt")
SELECT
  'cm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
  d."id",
  us."storeId",
  NOW()
FROM "User" u
JOIN "Deliverer" d ON d."userId" = u."id"
JOIN "UserStore" us ON us."userId" = u."id"
WHERE u."role" = 'DELIVERER'
  AND NOT EXISTS (
    SELECT 1
    FROM "DelivererStore" ds
    WHERE ds."delivererId" = d."id"
      AND ds."storeId" = us."storeId"
  );
