-- DRY RUN of 2026-11-01_merge_library_duplicates.sql — changes NOTHING.
-- Runs the whole migration inside one block and then aborts it on purpose.
-- The 'error' at the end IS the report: counts before/after, duplicate groups,
-- items with stock, recipe links to missing items, and the kept values of a few items.

DO $dryrun$
DECLARE before_counts jsonb; after_counts jsonb; dang_before int; dang_after int; stock_before int; stock_after int; dupes_before int; dupes_after int;
  example text;
BEGIN

  SELECT jsonb_object_agg(tbl, n) INTO before_counts FROM (
    SELECT 'fermentables' tbl, count(*) n FROM fermentables UNION ALL SELECT 'hops', count(*) FROM hops
    UNION ALL SELECT 'cultures', count(*) FROM cultures UNION ALL SELECT 'styles', count(*) FROM styles
    UNION ALL SELECT 'miscs', count(*) FROM miscs UNION ALL SELECT 'mash_profiles', count(*) FROM mash_profiles) c;
  SELECT count(*) INTO dang_before FROM (
    SELECT e->>'libraryId' AS lib_id FROM recipes, jsonb_array_elements(
      coalesce(data->'ingredients'->'fermentables','[]'::jsonb) || coalesce(data->'ingredients'->'hops','[]'::jsonb) ||
      coalesce(data->'ingredients'->'cultures','[]'::jsonb) || coalesce(data->'ingredients'->'miscellaneous','[]'::jsonb)) e
    UNION ALL SELECT data->'style'->>'libraryId' FROM recipes) r
   WHERE lib_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM fermentables WHERE id::text = lib_id UNION ALL SELECT 1 FROM hops WHERE id::text = lib_id
     UNION ALL SELECT 1 FROM cultures WHERE id::text = lib_id UNION ALL SELECT 1 FROM styles WHERE id::text = lib_id
     UNION ALL SELECT 1 FROM miscs WHERE id::text = lib_id UNION ALL SELECT 1 FROM mash_profiles WHERE id::text = lib_id);
  SELECT count(*) INTO stock_before FROM (
    SELECT data FROM fermentables UNION ALL SELECT data FROM hops UNION ALL SELECT data FROM cultures UNION ALL SELECT data FROM miscs) x
   WHERE jsonb_typeof(data->'stock') = 'object';
  SELECT count(*) INTO dupes_before FROM (
    SELECT 1 FROM (
      SELECT 'f' t, brewery_id, status, data FROM fermentables UNION ALL SELECT 'h', brewery_id, status, data FROM hops
      UNION ALL SELECT 'c', brewery_id, status, data FROM cultures UNION ALL SELECT 's', brewery_id, status, data FROM styles
      UNION ALL SELECT 'm', brewery_id, status, data FROM miscs UNION ALL SELECT 'p', brewery_id, status, data FROM mash_profiles) a
    WHERE (status = 'private' AND brewery_id IS NOT NULL) OR status = 'approved'
    GROUP BY t, CASE WHEN status = 'approved' THEN 'public' ELSE brewery_id::text END, name_key(data->>'name')
    HAVING count(*) > 1) g;
  EXECUTE $x0$ DO $merge$
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

    FOR r IN EXECUTE format(
      'SELECT m.new_id, o.data FROM lib_merge_map m JOIN %I o ON o.id::text = m.old_id WHERE m.tbl = %L', t, t)
    LOOP
      EXECUTE format('UPDATE %I SET data = $1 || data WHERE id::text = $2', t)
        USING (r.data - 'id' - 'stock' - 'user_id' - 'brewery_id' - 'status' - 'amount' - 'time' - 'use' - 'libraryId'), r.new_id;
    END LOOP;
  END LOOP;

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

  FOREACH t IN ARRAY library_tables LOOP
    EXECUTE format('DELETE FROM %I WHERE id::text IN (SELECT old_id FROM lib_merge_map WHERE tbl = %L)', t, t);
  END LOOP;
END $merge$ $x0$;
  EXECUTE $x1$ CREATE OR REPLACE FUNCTION public.library_free_name_on_move()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public $x1$;
  EXECUTE $x2$ REVOKE EXECUTE ON FUNCTION public.library_free_name_on_move() FROM PUBLIC, anon, authenticated $x2$;
  EXECUTE $x3$ DO $rules$
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
END $rules$ $x3$;

  SELECT jsonb_object_agg(tbl, n) INTO after_counts FROM (
    SELECT 'fermentables' tbl, count(*) n FROM fermentables UNION ALL SELECT 'hops', count(*) FROM hops
    UNION ALL SELECT 'cultures', count(*) FROM cultures UNION ALL SELECT 'styles', count(*) FROM styles
    UNION ALL SELECT 'miscs', count(*) FROM miscs UNION ALL SELECT 'mash_profiles', count(*) FROM mash_profiles) c;
  SELECT count(*) INTO dang_after FROM (
    SELECT e->>'libraryId' AS lib_id FROM recipes, jsonb_array_elements(
      coalesce(data->'ingredients'->'fermentables','[]'::jsonb) || coalesce(data->'ingredients'->'hops','[]'::jsonb) ||
      coalesce(data->'ingredients'->'cultures','[]'::jsonb) || coalesce(data->'ingredients'->'miscellaneous','[]'::jsonb)) e
    UNION ALL SELECT data->'style'->>'libraryId' FROM recipes) r
   WHERE lib_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM fermentables WHERE id::text = lib_id UNION ALL SELECT 1 FROM hops WHERE id::text = lib_id
     UNION ALL SELECT 1 FROM cultures WHERE id::text = lib_id UNION ALL SELECT 1 FROM styles WHERE id::text = lib_id
     UNION ALL SELECT 1 FROM miscs WHERE id::text = lib_id UNION ALL SELECT 1 FROM mash_profiles WHERE id::text = lib_id);
  SELECT count(*) INTO stock_after FROM (
    SELECT data FROM fermentables UNION ALL SELECT data FROM hops UNION ALL SELECT data FROM cultures UNION ALL SELECT data FROM miscs) x
   WHERE jsonb_typeof(data->'stock') = 'object';
  SELECT count(*) INTO dupes_after FROM (
    SELECT 1 FROM (
      SELECT 'f' t, brewery_id, status, data FROM fermentables UNION ALL SELECT 'h', brewery_id, status, data FROM hops
      UNION ALL SELECT 'c', brewery_id, status, data FROM cultures UNION ALL SELECT 's', brewery_id, status, data FROM styles
      UNION ALL SELECT 'm', brewery_id, status, data FROM miscs UNION ALL SELECT 'p', brewery_id, status, data FROM mash_profiles) a
    WHERE (status = 'private' AND brewery_id IS NOT NULL) OR status = 'approved'
    GROUP BY t, CASE WHEN status = 'approved' THEN 'public' ELSE brewery_id::text END, name_key(data->>'name')
    HAVING count(*) > 1) g;
  SELECT string_agg(name || ': ' || coalesce(color,'?') || ' / alpha ' || coalesce(alpha,'-') || ' / stock ' || coalesce(stock,'-'), '; ') INTO example FROM (
    SELECT data->>'name' name, data->>'color' color, NULL alpha, data->'stock'->>'amount' stock FROM fermentables
     WHERE status = 'private' AND name_key(data->>'name') IN ('pale malt (2 row) uk', 'pilsner malt')
    UNION ALL SELECT data->>'name', NULL, data->>'alpha', data->'stock'->>'amount' FROM hops
     WHERE status = 'private' AND name_key(data->>'name') IN ('goldings, east kent', 'northern brewer')) e;
  RAISE EXCEPTION E'DRY RUN (rolled back)\n items before: %\n items after:  %\n duplicate groups: % -> %\n items with stock: % -> %\n recipe links to missing items: % -> %\n kept examples: %',
    before_counts, after_counts, dupes_before, dupes_after, stock_before, stock_after, dang_before, dang_after, example;
END $dryrun$;