-- Stock in its own table (#137), step 2 of 2
-- The app now reads and writes the stock table. This removes the stock from the data
-- JSON of the ingredient rows, so tasters can no longer read it through the API, and
-- keeps it out: a stock written in the data (by an app version from before step 1) is
-- still copied into the table and then dropped from the row.
-- Apply after the app version of step 2 is live. Idempotent.

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
  s := NEW.data->'stock';
  IF NEW.data ? 'stock' THEN
    NEW.data := NEW.data - 'stock';
  END IF;
  IF NEW.brewery_id IS NULL OR coalesce(NEW.status, 'private') <> 'private' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(s) = 'object' THEN
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
    -- Insert/update: before the write, so the stock can be dropped from the row
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_sync_stock', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_ingredient_stock()',
                   t || '_sync_stock', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_sync_stock_delete', t);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_ingredient_stock()',
                   t || '_sync_stock_delete', t);

    -- Existing rows: copy a stock that is not in the table yet (the table wins: it may be
    -- newer), then drop the stock from the data
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
    EXECUTE format('UPDATE %I SET data = data - ''stock'' WHERE data ? ''stock''', t);
  END LOOP;
END $$;
