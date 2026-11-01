-- Merge duplicate library items and make their names unique (2026-11-01)
-- Idempotent: safe to run more than once, and also included in the full setup script.
-- Requires name_key() from 2026-10-31_unique_recipe_names.sql.
--
-- Tables: fermentables, hops, cultures, styles, miscs, mash_profiles.
-- * Items with the same name (case/space-insensitive) are merged:
--   - private items per brewery, public (approved) items in total;
--   - the item that has stock, is used by the most recipes, or has the most fields
--     is kept; fields missing on it are filled in from the duplicates (recipe-only
--     fields such as amount/time/use are not copied);
--   - recipes that pointed to a removed duplicate now point to the kept item;
--   - submitted items are left alone.
-- * After that: private names once per brewery, public names once in total.
-- * An item that becomes private again or moves brewery gets a free name, "(2)".

-- 1. Merge -------------------------------------------------------------------
DO $merge$
DECLARE
  t TEXT;
  r RECORD;
  library_tables TEXT[] := ARRAY['fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS lib_merge_map (
    tbl TEXT NOT NULL,
    old_id TEXT PRIMARY KEY,
    new_id TEXT NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE lib_merge_map;

  -- How often each library item is used by a recipe
  CREATE TEMP TABLE IF NOT EXISTS lib_ref_count ON COMMIT DROP AS
    SELECT NULL::TEXT AS lib_id, 0::BIGINT AS n WHERE false;
  TRUNCATE lib_ref_count;
  INSERT INTO lib_ref_count
    SELECT lib_id, count(*) FROM (
      SELECT e->>'libraryId' AS lib_id
      FROM recipes,
        jsonb_array_elements(
          coalesce(data->'ingredients'->'fermentables', '[]'::jsonb) ||
          coalesce(data->'ingredients'->'hops', '[]'::jsonb) ||
          coalesce(data->'ingredients'->'cultures', '[]'::jsonb) ||
          coalesce(data->'ingredients'->'miscellaneous', '[]'::jsonb)
        ) e
      UNION ALL
      SELECT data->'style'->>'libraryId' FROM recipes
    ) refs
    WHERE lib_id IS NOT NULL
    GROUP BY lib_id;

  FOREACH t IN ARRAY library_tables LOOP
    -- Pick the item to keep per group; map the others to it
    EXECUTE format($q$
      WITH ranked AS (
        SELECT l.id::text AS id,
               CASE WHEN l.status = 'approved' THEN 'public' ELSE l.brewery_id::text END AS scope,
               name_key(l.data->>'name') AS nk,
               row_number() OVER (
                 PARTITION BY CASE WHEN l.status = 'approved' THEN 'public' ELSE l.brewery_id::text END,
                              name_key(l.data->>'name')
                 ORDER BY (l.data ? 'stock' AND jsonb_typeof(l.data->'stock') = 'object') DESC,
                          coalesce(rc.n, 0) DESC,
                          (SELECT count(*) FROM jsonb_object_keys(l.data)) DESC,
                          l.id::text
               ) AS rn
        FROM %I l
        LEFT JOIN lib_ref_count rc ON rc.lib_id = l.id::text
        WHERE (l.status = 'private' AND l.brewery_id IS NOT NULL) OR l.status = 'approved'
      )
      INSERT INTO lib_merge_map (tbl, old_id, new_id)
      SELECT %L, d.id, k.id
      FROM ranked d
      JOIN ranked k ON k.scope = d.scope AND k.nk = d.nk AND k.rn = 1
      WHERE d.rn > 1
    $q$, t, t);

    -- Fill fields missing on the kept item from its duplicates (kept values win)
    FOR r IN EXECUTE format(
      'SELECT m.new_id, o.data FROM lib_merge_map m JOIN %I o ON o.id::text = m.old_id WHERE m.tbl = %L', t, t)
    LOOP
      EXECUTE format('UPDATE %I SET data = $1 || data WHERE id::text = $2', t)
        USING (r.data - 'id' - 'stock' - 'user_id' - 'brewery_id' - 'status' - 'amount' - 'time' - 'use' - 'libraryId'), r.new_id;
    END LOOP;
  END LOOP;

  -- Point recipes at the kept items
  UPDATE recipes rcp SET data = (
    SELECT jsonb_set(
      CASE WHEN jsonb_typeof(rcp.data->'ingredients') = 'object' THEN
        jsonb_set(rcp.data, '{ingredients}',
          (SELECT coalesce(jsonb_object_agg(k, CASE
             WHEN k IN ('fermentables', 'hops', 'cultures', 'miscellaneous') AND jsonb_typeof(v) = 'array' THEN
               (SELECT coalesce(jsonb_agg(
                  CASE WHEN m.new_id IS NOT NULL THEN e || jsonb_build_object('libraryId', m.new_id) ELSE e END
                  ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements(v) WITH ORDINALITY x(e, ord)
                LEFT JOIN lib_merge_map m ON m.old_id = e->>'libraryId')
             ELSE v END), '{}'::jsonb)
           FROM jsonb_each(rcp.data->'ingredients') AS i(k, v)))
      ELSE rcp.data END,
      '{style}',
      CASE WHEN rcp.data->'style'->>'libraryId' IN (SELECT old_id FROM lib_merge_map)
        THEN (rcp.data->'style') || jsonb_build_object('libraryId',
               (SELECT new_id FROM lib_merge_map WHERE old_id = rcp.data->'style'->>'libraryId'))
        ELSE coalesce(rcp.data->'style', 'null'::jsonb) END,
      false)
  )
  WHERE EXISTS (SELECT 1 FROM lib_merge_map m WHERE position(m.old_id IN rcp.data::text) > 0);

  -- Remove the merged duplicates
  FOREACH t IN ARRAY library_tables LOOP
    EXECUTE format('DELETE FROM %I WHERE id::text IN (SELECT old_id FROM lib_merge_map WHERE tbl = %L)', t, t);
  END LOOP;
END $merge$;

-- 2. Free name when an item becomes private again or moves brewery ------------
CREATE OR REPLACE FUNCTION public.library_free_name_on_move()
RETURNS trigger AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  n INT := 1;
  taken BOOLEAN;
BEGIN
  IF NEW.status = 'private' AND NEW.brewery_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'private' OR OLD.brewery_id IS DISTINCT FROM NEW.brewery_id) THEN
    candidate := btrim(coalesce(NEW.data->>'name', ''));
    base := regexp_replace(candidate, '\s\(\d+\)$', '');
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I WHERE brewery_id = $1 AND status = ''private'' AND id::text <> $2 AND name_key(data->>''name'') = name_key($3))',
        TG_TABLE_NAME)
        INTO taken USING NEW.brewery_id, NEW.id::text, candidate;
      EXIT WHEN NOT taken;
      n := n + 1;
      candidate := base || ' (' || n || ')';
    END LOOP;
    IF candidate IS DISTINCT FROM NEW.data->>'name' THEN
      NEW.data := jsonb_set(NEW.data, '{name}', to_jsonb(candidate));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.library_free_name_on_move() FROM PUBLIC, anon, authenticated;

-- 3. Rules + trigger per table ---------------------------------------------------
DO $rules$
DECLARE
  t TEXT;
  library_tables TEXT[] := ARRAY['fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];
BEGIN
  FOREACH t IN ARRAY library_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_free_name_on_move', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION library_free_name_on_move()',
                   t || '_free_name_on_move', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (brewery_id, name_key(data->>''name'')) WHERE status = ''private''',
                   t || '_private_name_per_brewery', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (name_key(data->>''name'')) WHERE status = ''approved''',
                   t || '_public_name', t);
  END LOOP;
END $rules$;
