-- Stock in its own table (#137), step 1 of 2
-- The stock (amount, unit, target) was stored in the data JSON of the ingredient rows,
-- which every brewery member may read, tasters included. Row level security works per
-- row, so the stock moves to its own table: brewery admin, brewmaster and brewer read it,
-- admin and brewmaster change it, the app admin does everything.
--
-- Step 1 (this migration): create the table, copy the existing stock, and keep it in sync
-- when an ingredient row is written with a stock in its data (as the previous app version
-- does). The new app reads and writes the table. Step 2 (a later migration, after this app
-- version is live) removes the stock from the data JSON.
-- Idempotent and compatible with the previous app version.

CREATE TABLE IF NOT EXISTS public.stock (
  ingredient_type TEXT NOT NULL CHECK (ingredient_type IN ('fermentable', 'hop', 'culture', 'misc')),
  ingredient_id TEXT NOT NULL,
  brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg' CHECK (char_length(unit) BETWEEN 1 AND 20),
  target NUMERIC CHECK (target IS NULL OR target >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID DEFAULT auth.uid(),
  PRIMARY KEY (ingredient_type, ingredient_id)
);
CREATE INDEX IF NOT EXISTS stock_brewery ON public.stock (brewery_id);

ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock TO authenticated;
REVOKE ALL ON public.stock FROM anon;

DROP POLICY IF EXISTS "Stock readable by brewers" ON public.stock;
CREATE POLICY "Stock readable by brewers" ON public.stock FOR SELECT
  USING (is_admin() OR (brewery_id = get_user_brewery_id()
         AND get_user_brewery_role() IN ('admin', 'brewmaster', 'brewer')));

DROP POLICY IF EXISTS "Stock managed by admin and brewmaster" ON public.stock;
CREATE POLICY "Stock managed by admin and brewmaster" ON public.stock FOR ALL
  USING (is_admin() OR (brewery_id = get_user_brewery_id()
         AND get_user_brewery_role() IN ('admin', 'brewmaster')))
  WITH CHECK (is_admin() OR (brewery_id = get_user_brewery_id()
              AND get_user_brewery_role() IN ('admin', 'brewmaster')));

-- Who changed it and when (not settable from the app)
CREATE OR REPLACE FUNCTION public.stock_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stock_stamp ON public.stock;
CREATE TRIGGER stock_stamp BEFORE INSERT OR UPDATE ON public.stock
  FOR EACH ROW EXECUTE FUNCTION stock_stamp();

-- Keep the table in sync with the ingredient rows: a stock in the data JSON (previous app
-- version) is copied into the table, a moved ingredient takes its stock along, and a
-- deleted ingredient loses its stock. Only private (brewery) rows have a stock.
CREATE OR REPLACE FUNCTION public.sync_ingredient_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT := CASE TG_TABLE_NAME WHEN 'fermentables' THEN 'fermentable' WHEN 'hops' THEN 'hop'
                                  WHEN 'cultures' THEN 'culture' ELSE 'misc' END;
  s JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM stock WHERE ingredient_type = kind AND ingredient_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.brewery_id IS NULL OR coalesce(NEW.status, 'private') <> 'private' THEN
    RETURN NEW;
  END IF;
  s := NEW.data->'stock';
  IF jsonb_typeof(s) = 'object' AND (TG_OP = 'INSERT' OR s IS DISTINCT FROM OLD.data->'stock') THEN
    INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target)
    VALUES (kind, NEW.id, NEW.brewery_id,
            coalesce(CASE WHEN jsonb_typeof(s->'amount') = 'number' THEN (s->>'amount')::numeric END, 0),
            coalesce(nullif(left(btrim(s->>'unit'), 20), ''), CASE WHEN kind IN ('hop', 'misc') THEN 'g' ELSE 'kg' END),
            CASE WHEN jsonb_typeof(s->'stock_target') = 'number' AND (s->>'stock_target')::numeric >= 0
                 THEN (s->>'stock_target')::numeric END)
    ON CONFLICT (ingredient_type, ingredient_id) DO UPDATE
      SET brewery_id = EXCLUDED.brewery_id, amount = EXCLUDED.amount,
          unit = EXCLUDED.unit, target = EXCLUDED.target;
  ELSIF TG_OP = 'UPDATE' AND NEW.brewery_id IS DISTINCT FROM OLD.brewery_id THEN
    UPDATE stock SET brewery_id = NEW.brewery_id WHERE ingredient_type = kind AND ingredient_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_ingredient_stock() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t TEXT;
  kind TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fermentables', 'hops', 'cultures', 'miscs'] LOOP
    kind := CASE t WHEN 'fermentables' THEN 'fermentable' WHEN 'hops' THEN 'hop'
                   WHEN 'cultures' THEN 'culture' ELSE 'misc' END;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_sync_stock', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_ingredient_stock()',
                   t || '_sync_stock', t);

    -- Copy the existing stock (rows already in the table are left alone)
    EXECUTE format($q$
      INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target, updated_by)
      SELECT %L, i.id, i.brewery_id,
             coalesce(CASE WHEN jsonb_typeof(i.data->'stock'->'amount') = 'number' THEN (i.data->'stock'->>'amount')::numeric END, 0),
             coalesce(nullif(left(btrim(i.data->'stock'->>'unit'), 20), ''), %L),
             CASE WHEN jsonb_typeof(i.data->'stock'->'stock_target') = 'number'
                       AND (i.data->'stock'->>'stock_target')::numeric >= 0
                  THEN (i.data->'stock'->>'stock_target')::numeric END,
             i.user_id
      FROM %I i
      WHERE i.brewery_id IS NOT NULL AND coalesce(i.status, 'private') = 'private'
        AND jsonb_typeof(i.data->'stock') = 'object'
      ON CONFLICT (ingredient_type, ingredient_id) DO NOTHING
    $q$, kind, CASE WHEN kind IN ('hop', 'misc') THEN 'g' ELSE 'kg' END, t);
  END LOOP;
END $$;

-- Realtime, like the other tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stock') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock;
  END IF;
END $$;
