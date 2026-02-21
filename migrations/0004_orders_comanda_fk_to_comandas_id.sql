-- 0004_orders_comanda_fk_to_comandas_id.sql
-- Migrates orders.comanda_id to reference comandas.id (internal PK).
-- Legacy databases stored comandas.number in orders.comanda_id.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS comanda_id_fk integer;

-- Preferred mapping: old value is comandas.number.
UPDATE orders o
SET comanda_id_fk = c.id
FROM comandas c
WHERE o.comanda_id_fk IS NULL
  AND c.number = o.comanda_id;

-- Temporary fallback: if the value already matches comandas.id, keep it.
UPDATE orders o
SET comanda_id_fk = c.id
FROM comandas c
WHERE o.comanda_id_fk IS NULL
  AND c.id = o.comanda_id;

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM orders
  WHERE comanda_id_fk IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Cannot migrate orders.comanda_id to FK: % row(s) were not mapped to comandas.id',
      missing_count;
  END IF;
END $$;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_comanda_id_fkey;

ALTER TABLE orders
  DROP COLUMN comanda_id;

ALTER TABLE orders
  RENAME COLUMN comanda_id_fk TO comanda_id;

ALTER TABLE orders
  ALTER COLUMN comanda_id SET NOT NULL;

ALTER TABLE orders
  ADD CONSTRAINT orders_comanda_id_fkey
  FOREIGN KEY (comanda_id) REFERENCES comandas(id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS orders_comanda_id_idx ON orders(comanda_id);

COMMIT;
