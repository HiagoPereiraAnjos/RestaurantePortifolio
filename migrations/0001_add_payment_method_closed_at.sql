-- Adds payment method and ensures close timestamp exists for orders history.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
