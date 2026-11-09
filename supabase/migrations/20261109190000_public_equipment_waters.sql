-- Brewing installations and water profiles in the public library
-- Like the other library tables: a status column ('private', 'submitted', 'approved'),
-- everyone reads approved rows, only the app admin sets 'approved', only the brewery
-- admin submits (guard_public_submission), and approved names are unique.
-- Existing rows become 'private'. Idempotent and compatible with the previous app
-- version: it saves without a status (the default 'private' applies) and reads only
-- its own brewery's rows.

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'private';
ALTER TABLE waters ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'private';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment', 'waters'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_status_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (status IN (''private'', ''submitted'', ''approved''))', t, t || '_status_check');

    -- Everyone can read approved rows
    EXECUTE format('DROP POLICY IF EXISTS "Allow read approved %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'')', t, t);

    -- Admin and brewmaster manage their brewery's rows; only the app admin approves
    EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster manage %I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'')) WITH CHECK (brewery_id = get_user_brewery_id() AND (status != ''approved'' OR is_admin()))', t, t);

    -- Only the brewery admin submits
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_publish_guard ON %I', t, t);
    EXECUTE format('CREATE TRIGGER on_%I_publish_guard BEFORE INSERT OR UPDATE OF status ON %I FOR EACH ROW EXECUTE FUNCTION guard_public_submission()', t, t);

    -- One public item per name
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (name_key(data->>''name'')) WHERE status = ''approved''', t || '_public_name', t);
  END LOOP;
END $$;
