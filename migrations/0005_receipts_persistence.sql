-- 0005_receipts_persistence.sql
-- Stage 1 persistence: store receipt headers in DB (receipt id, close timestamp, total, comanda).

BEGIN;

CREATE TABLE IF NOT EXISTS receipts (
  id serial PRIMARY KEY,
  receipt_id text NOT NULL UNIQUE,
  comanda_id integer REFERENCES comandas(id),
  comanda_number integer,
  closed_at timestamptz NOT NULL DEFAULT now(),
  total_cents integer NOT NULL DEFAULT 0,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_closed_at_idx ON receipts(closed_at);
CREATE INDEX IF NOT EXISTS receipts_comanda_id_idx ON receipts(comanda_id);

INSERT INTO receipts (
  receipt_id,
  comanda_id,
  comanda_number,
  closed_at,
  total_cents,
  payment_method
)
SELECT
  o.receipt_id,
  min(o.comanda_id) AS comanda_id,
  min(c.number) AS comanda_number,
  max(COALESCE(o.closed_at, o.created_at)) AS closed_at,
  COALESCE(sum(
    CASE
      WHEN oi.status = 'canceled' THEN 0
      ELSE oi.price * oi.quantity
    END
  ), 0)::integer AS total_cents,
  CASE
    WHEN count(DISTINCT NULLIF(trim(COALESCE(o.payment_method, '')), '')) = 1
      THEN min(NULLIF(trim(COALESCE(o.payment_method, '')), ''))
    ELSE NULL
  END AS payment_method
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN comandas c ON c.id = o.comanda_id
WHERE o.status = 'closed'
  AND o.receipt_id IS NOT NULL
  AND trim(o.receipt_id) <> ''
GROUP BY o.receipt_id
ON CONFLICT (receipt_id) DO UPDATE
SET
  comanda_id = EXCLUDED.comanda_id,
  comanda_number = EXCLUDED.comanda_number,
  closed_at = EXCLUDED.closed_at,
  total_cents = EXCLUDED.total_cents,
  payment_method = EXCLUDED.payment_method,
  updated_at = now();

COMMIT;
