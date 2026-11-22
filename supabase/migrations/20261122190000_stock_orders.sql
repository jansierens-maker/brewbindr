-- Stock: what is ordered and not delivered yet
-- An ingredient can be ordered (an amount in the stock unit, and when). Receiving it, in one
-- or more deliveries, adds to the stock and lowers what is still ordered. The previous app
-- version does not know these columns: its upserts leave them alone.
-- Idempotent.

ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS ordered NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS ordered_at DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_ordered_positive' AND conrelid = 'public.stock'::regclass) THEN
    ALTER TABLE public.stock ADD CONSTRAINT stock_ordered_positive CHECK (ordered IS NULL OR ordered > 0);
  END IF;
END $$;
