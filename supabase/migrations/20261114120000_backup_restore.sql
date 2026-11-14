-- Backup and restore
-- restore_brewery_backup(tables): writes a brewery backup into the caller's brewery in one
--   transaction, merging: rows with the same id are overwritten, others added, nothing deleted.
--   The app plans the rows (new ids and name matches for another brewery, see services/backup.ts).
--   SECURITY INVOKER: row level security and the triggers apply; only the brewery admin (or the
--   app admin) may restore. Never writes or overwrites approved (public) rows.
-- admin_full_backup(): every brewery, profile, data row and stock row (app admin only).
-- admin_full_restore(backup, dry_run): merges a full backup back (app admin only). Accounts cannot
--   be recreated: a row of a user that no longer exists keeps no maker; profiles of existing users
--   get their brewery and roles back (not the caller's own). With dry_run only the counts.
-- Idempotent (CREATE OR REPLACE) and compatible with the previous app version (new functions).

CREATE OR REPLACE FUNCTION public.restore_brewery_backup(p_tables JSONB)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_brewery UUID := get_user_brewery_id();
  v_counts JSONB := '{}'::jsonb;
  v_n INT;
  t TEXT;
  status_tables TEXT[] := ARRAY['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs',
                                'mash_profiles', 'equipment', 'waters'];
BEGIN
  IF v_brewery IS NULL OR (get_user_brewery_role() IS DISTINCT FROM 'admin' AND NOT is_admin()) THEN
    RAISE EXCEPTION 'Only the brewery admin can restore a backup' USING ERRCODE = '42501', HINT = 'restore_admin_only';
  END IF;

  FOREACH t IN ARRAY status_tables || ARRAY['brew_logs', 'tasting_notes'] LOOP
    IF t = ANY (status_tables) THEN
      EXECUTE format($q$
        INSERT INTO %I (id, data, brewery_id, status)
        SELECT r.id, r.data, $1, CASE WHEN r.status = 'submitted' THEN 'submitted' ELSE 'private' END
        FROM jsonb_to_recordset(coalesce($2 -> %L, '[]'::jsonb)) AS r(id TEXT, data JSONB, status TEXT)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status
          WHERE %I.status IS DISTINCT FROM 'approved'
      $q$, t, t, t) USING v_brewery, p_tables;
    ELSE
      EXECUTE format($q$
        INSERT INTO %I (id, data, brewery_id)
        SELECT r.id, r.data, $1
        FROM jsonb_to_recordset(coalesce($2 -> %L, '[]'::jsonb)) AS r(id TEXT, data JSONB)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      $q$, t, t) USING v_brewery, p_tables;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  END LOOP;

  INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target)
  SELECT s.ingredient_type, s.ingredient_id, v_brewery, coalesce(s.amount, 0), coalesce(s.unit, 'kg'), s.target
  FROM jsonb_to_recordset(coalesce(p_tables -> 'stock', '[]'::jsonb))
    AS s(ingredient_type TEXT, ingredient_id TEXT, amount NUMERIC, unit TEXT, target NUMERIC)
  ON CONFLICT (ingredient_type, ingredient_id) DO UPDATE
    SET amount = EXCLUDED.amount, unit = EXCLUDED.unit, target = EXCLUDED.target, updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_counts || jsonb_build_object('stock', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_full_backup()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tables JSONB := '{}'::jsonb;
  v_rows JSONB;
  t TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only the app admin can make a full backup' USING ERRCODE = '42501';
  END IF;
  FOREACH t IN ARRAY ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures',
                           'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), ''[]''::jsonb) FROM %I x', t) INTO v_rows;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  END LOOP;
  v_tables := v_tables || jsonb_build_object('stock',
    (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.ingredient_type, s.ingredient_id), '[]'::jsonb) FROM stock s));
  RETURN jsonb_build_object(
    'format', 'brewbindr-full-backup',
    'version', 1,
    'exported_at', now(),
    'breweries', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'created_at', b.created_at) ORDER BY b.created_at), '[]'::jsonb) FROM breweries b),
    'profiles', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'role', p.role,
                   'brewery_id', p.brewery_id, 'brewery_role', p.brewery_role, 'preferences', p.preferences) ORDER BY p.email), '[]'::jsonb) FROM profiles p),
    'tables', v_tables
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_full_restore(p_backup JSONB, p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_counts JSONB := '{}'::jsonb;
  v_rows JSONB;
  v_added INT;
  v_updated INT;
  t TEXT;
  status_tables TEXT[] := ARRAY['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs',
                                'mash_profiles', 'equipment', 'waters'];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only the app admin can restore a full backup' USING ERRCODE = '42501';
  END IF;
  IF p_backup ->> 'format' IS DISTINCT FROM 'brewbindr-full-backup' THEN
    RAISE EXCEPTION 'Not a full BrewBindr backup' USING ERRCODE = '22023', HINT = 'not_full_backup';
  END IF;

  -- Breweries
  v_rows := coalesce(p_backup -> 'breweries', '[]'::jsonb);
  SELECT count(*) FILTER (WHERE b.id IS NULL), count(*) FILTER (WHERE b.id IS NOT NULL) INTO v_added, v_updated
  FROM jsonb_to_recordset(v_rows) AS r(id UUID) LEFT JOIN breweries b ON b.id = r.id;
  v_counts := v_counts || jsonb_build_object('breweries', jsonb_build_object('added', v_added, 'updated', v_updated));
  IF NOT p_dry_run THEN
    INSERT INTO breweries (id, name, created_at)
    SELECT r.id, r.name, coalesce(r.created_at, now()) FROM jsonb_to_recordset(v_rows) AS r(id UUID, name TEXT, created_at TIMESTAMPTZ)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
  END IF;

  -- Profiles of users that still exist (not the caller's own)
  v_rows := coalesce(p_backup -> 'profiles', '[]'::jsonb);
  SELECT count(*) INTO v_updated FROM jsonb_to_recordset(v_rows) AS r(id UUID) JOIN profiles p ON p.id = r.id WHERE r.id <> auth.uid();
  v_counts := v_counts || jsonb_build_object('profiles', jsonb_build_object('added', 0, 'updated', v_updated,
    'skipped', jsonb_array_length(v_rows) - v_updated));
  IF NOT p_dry_run THEN
    UPDATE profiles p SET
      role = coalesce(r.role, p.role),
      brewery_id = CASE WHEN EXISTS (SELECT 1 FROM breweries b WHERE b.id = r.brewery_id) THEN r.brewery_id ELSE p.brewery_id END,
      brewery_role = r.brewery_role,
      preferences = coalesce(r.preferences, p.preferences)
    FROM jsonb_to_recordset(v_rows) AS r(id UUID, role TEXT, brewery_id UUID, brewery_role TEXT, preferences JSONB)
    WHERE p.id = r.id AND r.id <> auth.uid();
  END IF;

  -- Data rows: a maker or brewery that no longer exists is left empty
  FOREACH t IN ARRAY status_tables || ARRAY['brew_logs', 'tasting_notes'] LOOP
    v_rows := coalesce(p_backup -> 'tables' -> t, '[]'::jsonb);
    EXECUTE format('SELECT count(*) FILTER (WHERE x.id IS NULL), count(*) FILTER (WHERE x.id IS NOT NULL)
                    FROM jsonb_to_recordset($1) AS r(id TEXT) LEFT JOIN %I x ON x.id = r.id', t)
      INTO v_added, v_updated USING v_rows;
    v_counts := v_counts || jsonb_build_object(t, jsonb_build_object('added', v_added, 'updated', v_updated));
    IF NOT p_dry_run THEN
      EXECUTE format($q$
        INSERT INTO %1$I (id, data, user_id, brewery_id%2$s)
        SELECT r.id, r.data,
          CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id) THEN r.user_id END,
          CASE WHEN EXISTS (SELECT 1 FROM breweries b WHERE b.id = r.brewery_id) THEN r.brewery_id END
          %3$s
        FROM jsonb_to_recordset($1) AS r(id TEXT, data JSONB, user_id UUID, brewery_id UUID, status TEXT)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, user_id = EXCLUDED.user_id, brewery_id = EXCLUDED.brewery_id%4$s
      $q$, t,
        CASE WHEN t = ANY (status_tables) THEN ', status' ELSE '' END,
        CASE WHEN t = ANY (status_tables) THEN ', coalesce(r.status, ''private'')' ELSE '' END,
        CASE WHEN t = ANY (status_tables) THEN ', status = EXCLUDED.status' ELSE '' END)
      USING v_rows;
    END IF;
  END LOOP;

  -- Stock of breweries that exist
  v_rows := coalesce(p_backup -> 'tables' -> 'stock', '[]'::jsonb);
  SELECT count(*) FILTER (WHERE s.ingredient_id IS NULL), count(*) FILTER (WHERE s.ingredient_id IS NOT NULL) INTO v_added, v_updated
  FROM jsonb_to_recordset(v_rows) AS r(ingredient_type TEXT, ingredient_id TEXT)
  LEFT JOIN stock s ON s.ingredient_type = r.ingredient_type AND s.ingredient_id = r.ingredient_id;
  v_counts := v_counts || jsonb_build_object('stock', jsonb_build_object('added', v_added, 'updated', v_updated));
  IF NOT p_dry_run THEN
    INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target)
    SELECT r.ingredient_type, r.ingredient_id, r.brewery_id, coalesce(r.amount, 0), coalesce(r.unit, 'kg'), r.target
    FROM jsonb_to_recordset(v_rows) AS r(ingredient_type TEXT, ingredient_id TEXT, brewery_id UUID, amount NUMERIC, unit TEXT, target NUMERIC)
    WHERE EXISTS (SELECT 1 FROM breweries b WHERE b.id = r.brewery_id)
    ON CONFLICT (ingredient_type, ingredient_id) DO UPDATE
      SET brewery_id = EXCLUDED.brewery_id, amount = EXCLUDED.amount, unit = EXCLUDED.unit, target = EXCLUDED.target, updated_at = now();
  END IF;

  RETURN v_counts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_brewery_backup(JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_full_backup() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_full_restore(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_brewery_backup(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_restore(JSONB, BOOLEAN) TO authenticated;
