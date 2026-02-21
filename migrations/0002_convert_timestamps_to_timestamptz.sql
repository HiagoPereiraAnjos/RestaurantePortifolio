-- 0002_convert_timestamps_to_timestamptz.sql
-- Converts timestamp columns (timestamp without time zone) to timestamptz,
-- interpreting existing values as America/Sao_Paulo.

BEGIN;

DO $$
BEGIN
  -- orders.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $$
      ALTER TABLE orders
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $$;
  END IF;

  -- orders.closed_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'closed_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $$
      ALTER TABLE orders
        ALTER COLUMN closed_at TYPE timestamptz
        USING CASE
          WHEN closed_at IS NULL THEN NULL
          ELSE closed_at AT TIME ZONE 'America/Sao_Paulo'
        END
    $$;
  END IF;

  -- receipt_payments.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'receipt_payments'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $$
      ALTER TABLE receipt_payments
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $$;
  END IF;

  -- users.created_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    EXECUTE $$
      ALTER TABLE users
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'America/Sao_Paulo'
    $$;
  END IF;
END $$;

COMMIT;
