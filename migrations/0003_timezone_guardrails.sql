-- 0003_timezone_guardrails.sql
-- Idempotent guardrail migration:
-- - Ensures critical datetime columns exist.
-- - Converts legacy timestamp (without time zone) columns to timestamptz.
-- - Interprets legacy local values as America/Sao_Paulo.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

DO $$
BEGIN
  -- orders.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'orders'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE orders
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $sql$;
  END IF;

  -- orders.closed_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'orders'
      AND column_name = 'closed_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE orders
      ALTER COLUMN closed_at TYPE timestamptz
      USING CASE
        WHEN closed_at IS NULL THEN NULL
        ELSE closed_at AT TIME ZONE 'America/Sao_Paulo'
      END
    $sql$;
  END IF;

  -- receipt_payments.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'receipt_payments'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE receipt_payments
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $sql$;
  END IF;

  -- users.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE users
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $sql$;
  END IF;
END $$;

-- Keep DB-side defaults aligned with schema.
ALTER TABLE orders
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE receipt_payments
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE users
  ALTER COLUMN created_at SET DEFAULT now();

COMMIT;
