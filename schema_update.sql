-- 1. Create/Update Tables Idempotently
CREATE TABLE IF NOT EXISTS breweries (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'My Brewery';
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE breweries ALTER COLUMN name DROP DEFAULT;

CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_role TEXT CHECK (brewery_role IN ('admin', 'brewmaster', 'brewer', 'taster'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"units": "metric", "colorScale": "srm", "language": "en"}'::jsonb;

CREATE TABLE IF NOT EXISTS invitations (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL CHECK (role IN ('admin', 'brewmaster', 'brewer', 'taster'));
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS code TEXT NOT NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_code_key') THEN
    ALTER TABLE invitations ADD CONSTRAINT invitations_code_key UNIQUE (code);
  END IF;
END $$;

-- Create application tables idempotently
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables) LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id TEXT PRIMARY KEY);', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS data JSONB;', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);', t);

    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''private'' CHECK (status IN (''private'', ''submitted'', ''approved''));', t);
    END IF;
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Helper Functions for RLS
CREATE OR REPLACE FUNCTION get_user_brewery_id() RETURNS UUID AS $$
  SELECT brewery_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_brewery_role() RETURNS TEXT AS $$
  SELECT brewery_role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Policies for breweries
DROP POLICY IF EXISTS "Members can view their brewery" ON breweries;
CREATE POLICY "Members can view their brewery" ON breweries FOR SELECT USING (id = get_user_brewery_id());

DROP POLICY IF EXISTS "Admins can update brewery" ON breweries;
CREATE POLICY "Admins can update brewery" ON breweries FOR UPDATE USING (id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view brewery members" ON profiles;
CREATE POLICY "Users can view brewery members" ON profiles FOR SELECT USING (brewery_id = get_user_brewery_id());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND (role = (SELECT role FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Helper to check if user is admin (global app admin)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (auth.uid() != id AND is_admin());

-- Trigger to create profile on signup
-- Trigger to create profile and brewery on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_brewery_id UUID;
  invite_code TEXT;
  invite_role TEXT;
  invite_brewery_id UUID;
BEGIN
  -- Extract invite code from user metadata if provided
  invite_code := (new.raw_user_meta_data->>'invite_code');

  IF invite_code IS NOT NULL THEN
    -- Try to join existing brewery
    SELECT brewery_id, role INTO invite_brewery_id, invite_role
    FROM invitations
    WHERE code = invite_code AND expires_at > now()
    LIMIT 1;

    IF invite_brewery_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
      VALUES (new.id, new.email, invite_brewery_id, invite_role)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        brewery_id = EXCLUDED.brewery_id,
        brewery_role = EXCLUDED.brewery_role;

      -- Cleanup used invitation (Match by code and/or email for safety)
      DELETE FROM invitations
      WHERE code = invite_code
      OR (email = new.email AND brewery_id = invite_brewery_id);

      RETURN new;
    END IF;
  END IF;

  -- Default: Create new brewery for the user
  INSERT INTO breweries (name) VALUES ('My Brewery') RETURNING id INTO new_brewery_id;

  INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
  VALUES (new.id, new.email, new_brewery_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    brewery_id = EXCLUDED.brewery_id,
    brewery_role = EXCLUDED.brewery_role;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to delete invitation when profile is linked (idempotency safety)
CREATE OR REPLACE FUNCTION delete_used_invitation()
RETURNS trigger AS $$
BEGIN
  IF NEW.brewery_id IS NOT NULL AND OLD.brewery_id IS NULL THEN
    -- If we don't have the code anymore, we might have matched via metadata in handle_new_user.
    -- This trigger handles cases where brewery_id is set later.
    -- To be precise, we'd need the code on the profile, but deleting by brewery+role is a good fallback
    -- if we assume codes are unique per role in a brewery (which they usually are).
    DELETE FROM invitations
    WHERE (brewery_id = NEW.brewery_id AND role = NEW.brewery_role)
    OR (email = NEW.email AND brewery_id = NEW.brewery_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_brewery_linked ON profiles;
CREATE TRIGGER on_brewery_linked
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION delete_used_invitation();

-- Policies for invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- Set brewery_id automatically based on owner's profile if missing
CREATE OR REPLACE FUNCTION set_brewery_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.brewery_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.brewery_id := (SELECT brewery_id FROM public.profiles WHERE id = NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies and Triggers for Data Tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    -- Everyone can read approved items (if the table has a status column)
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow read approved %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'');', t, t);
    END IF;

    -- Drop old user-only policy
    EXECUTE format('DROP POLICY IF EXISTS "Allow user manage own %I" ON %I;', t, t);

    -- SELECT: Any member of the brewery
    EXECUTE format('DROP POLICY IF EXISTS "Allow brewery members read %I" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "Allow brewery members read %I" ON %I FOR SELECT USING (brewery_id = get_user_brewery_id());', t, t);

    -- INSERT/UPDATE/DELETE based on roles
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      -- admin and brewmaster can manage (with status check)
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'')) WITH CHECK (brewery_id = get_user_brewery_id() AND (status != ''approved'' OR is_admin()));', t, t);
    ELSIF t IN ('equipment', 'waters') THEN
      -- admin and brewmaster can manage (no status check)
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'')) WITH CHECK (brewery_id = get_user_brewery_id());', t, t);
    ELSIF t = 'brew_logs' THEN
      -- admin, brewmaster, brewer can manage
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster/brewer manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster/brewer manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'', ''brewer''));', t, t);
    ELSIF t = 'tasting_notes' THEN
      -- everyone in brewery can manage
      EXECUTE format('DROP POLICY IF EXISTS "Allow brewery members manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow brewery members manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id());', t, t);
    END IF;

    -- Admins of the app (global role) can still do everything
    EXECUTE format('DROP POLICY IF EXISTS "Allow global admin manage %I" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "Allow global admin manage %I" ON %I FOR ALL USING (is_admin());', t, t);

    -- Apply brewery linking trigger
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_brewery_link ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER on_%I_brewery_link BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_brewery_id();', t, t);
  END LOOP;
END $$;

-- Enable Realtime for all tables idempotently
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    END IF;
  END LOOP;
END $$;

-- Grant PostgREST access to public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- anon can only read approved content
GRANT SELECT ON TABLE recipes TO anon;
GRANT SELECT ON TABLE fermentables TO anon;
GRANT SELECT ON TABLE hops TO anon;
GRANT SELECT ON TABLE cultures TO anon;
GRANT SELECT ON TABLE styles TO anon;
GRANT SELECT ON TABLE miscs TO anon;
GRANT SELECT ON TABLE mash_profiles TO anon;

-- authenticated users get full access to all tables
GRANT ALL ON TABLE recipes TO authenticated;
GRANT ALL ON TABLE brew_logs TO authenticated;
GRANT ALL ON TABLE tasting_notes TO authenticated;
GRANT ALL ON TABLE fermentables TO authenticated;
GRANT ALL ON TABLE hops TO authenticated;
GRANT ALL ON TABLE cultures TO authenticated;
GRANT ALL ON TABLE styles TO authenticated;
GRANT ALL ON TABLE miscs TO authenticated;
GRANT ALL ON TABLE mash_profiles TO authenticated;
GRANT ALL ON TABLE equipment TO authenticated;
GRANT ALL ON TABLE waters TO authenticated;
GRANT ALL ON TABLE profiles TO authenticated;

-- Migration for existing users: Create a default brewery for each user and link their data
DO $$
DECLARE
  u_record RECORD;
  new_brewery_id UUID;
BEGIN
  -- 1. Sync emails for existing profiles
  UPDATE public.profiles p
  SET email = u.email
  FROM auth.users u
  WHERE p.id = u.id AND p.email IS NULL;

  -- 2. Create breweries for solo users
  FOR u_record IN SELECT id FROM profiles WHERE brewery_id IS NULL
  LOOP
    INSERT INTO breweries (name) VALUES ('My Brewery') RETURNING id INTO new_brewery_id;
    UPDATE profiles SET brewery_id = new_brewery_id, brewery_role = 'admin' WHERE id = u_record.id;

    -- Link existing data
    UPDATE recipes SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE brew_logs SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE tasting_notes SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE fermentables SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE hops SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE cultures SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE styles SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE miscs SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE mash_profiles SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE equipment SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE waters SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
  END LOOP;
END $$;

-- Security hardening (2026-10-30)
-- Idempotent: safe to run more than once, and also included in the full setup script.
--
-- 1. Users could change their own brewery_id / brewery_role through the API and so
--    join any brewery as admin. Brewery membership can now only change through the
--    signup trigger, the join_brewery / remove_brewery_member functions, or an app admin.
-- 2. Trigger functions were callable through the REST API (/rest/v1/rpc/...).

-- Guard profile changes made directly by app users (roles anon/authenticated).
-- Must be SECURITY INVOKER: current_user is then the caller's role. Updates made by
-- SECURITY DEFINER functions (signup trigger, RPCs below) run as the function owner,
-- so they pass this check.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'user';
      NEW.brewery_id := NULL;
      NEW.brewery_role := NULL;
    ELSE
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only admins can change user roles';
      END IF;
      IF NEW.brewery_id IS DISTINCT FROM OLD.brewery_id
         OR NEW.brewery_role IS DISTINCT FROM OLD.brewery_role THEN
        RAISE EXCEPTION 'Brewery membership cannot be changed directly';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_update ON profiles;
CREATE TRIGGER on_profile_update
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

-- Join a brewery with an invite code. A user who is the only member of their
-- current brewery takes their data along; the empty old brewery is removed.
CREATE OR REPLACE FUNCTION public.join_brewery(invite_code TEXT)
RETURNS UUID AS $$
DECLARE
  inv RECORD;
  old_brewery UUID;
  t TEXT;
  data_tables TEXT[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT brewery_id, role INTO inv
  FROM invitations
  WHERE code = upper(trim(invite_code)) AND expires_at > now()
  LIMIT 1;

  IF inv.brewery_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation code';
  END IF;

  SELECT brewery_id INTO old_brewery FROM profiles WHERE id = auth.uid();

  IF old_brewery = inv.brewery_id THEN
    RAISE EXCEPTION 'You are already a member of this brewery';
  END IF;

  IF old_brewery IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE brewery_id = old_brewery AND id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'Your current brewery has other members. Ask its admin to remove you first.';
  END IF;

  -- Move the user's data from their (single-member) brewery to the new one
  IF old_brewery IS NOT NULL THEN
    FOREACH t IN ARRAY data_tables LOOP
      EXECUTE format('UPDATE %I SET brewery_id = $1 WHERE brewery_id = $2', t)
        USING inv.brewery_id, old_brewery;
    END LOOP;
  END IF;

  UPDATE profiles SET brewery_id = inv.brewery_id, brewery_role = inv.role WHERE id = auth.uid();
  DELETE FROM invitations WHERE code = upper(trim(invite_code));

  -- Remove the now empty old brewery (its pending invitations cascade)
  IF old_brewery IS NOT NULL THEN
    DELETE FROM breweries WHERE id = old_brewery;
  END IF;

  RETURN inv.brewery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Brewery admins remove a member from their brewery.
CREATE OR REPLACE FUNCTION public.remove_brewery_member(member_id UUID)
RETURNS VOID AS $$
BEGIN
  IF get_user_brewery_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only brewery admins can remove members';
  END IF;
  IF member_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself';
  END IF;

  UPDATE profiles SET brewery_id = NULL, brewery_role = NULL
  WHERE id = member_id AND brewery_id = get_user_brewery_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in your brewery';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function permissions: trigger functions are not callable through the API;
-- the two membership functions only by signed-in users.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_used_invitation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_brewery_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_brewery(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_brewery_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_brewery(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_brewery_member(UUID) TO authenticated;

-- Daily limit on AI requests per user (10/day, global admins 100/day)
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Only reachable through consume_ai_quota(): RLS on, no policies, no grants
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_quota()
RETURNS JSON AS $$
DECLARE
  uid UUID := auth.uid();
  today DATE := (now() AT TIME ZONE 'Europe/Brussels')::date;
  daily_limit INT;
  used INT;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('allowed', false, 'used', 0, 'limit', 0);
  END IF;

  daily_limit := CASE WHEN is_admin() THEN 100 ELSE 10 END;

  -- Count this request only while under the limit (atomic, safe for parallel calls)
  INSERT INTO ai_usage (user_id, day, count) VALUES (uid, today, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
    WHERE ai_usage.count < daily_limit
  RETURNING count INTO used;

  -- Keep the table small: drop this user's rows older than 30 days
  DELETE FROM ai_usage WHERE user_id = uid AND day < today - 30;

  IF used IS NULL THEN
    RETURN json_build_object('allowed', false, 'used', daily_limit, 'limit', daily_limit);
  END IF;
  RETURN json_build_object('allowed', true, 'used', used, 'limit', daily_limit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota() TO authenticated;

-- Unique recipe names: once per brewery (private) and once in the public library
-- Comparison key used by the unique indexes
CREATE OR REPLACE FUNCTION public.name_key(p_name TEXT)
RETURNS TEXT AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

-- 1. Rename existing duplicates within a brewery. The most complete recipe
--    (most fermentables) keeps its name; the others get (2), (3), ...
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT id, brewery_id, data->>'name' AS name
    FROM (
      SELECT id, brewery_id, data,
             row_number() OVER (
               PARTITION BY brewery_id, name_key(data->>'name')
               ORDER BY jsonb_array_length(coalesce(data->'ingredients'->'fermentables', '[]'::jsonb)) DESC, id
             ) AS rn
      FROM recipes
      WHERE status = 'private' AND brewery_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  LOOP
    base := regexp_replace(btrim(r.name), '\s\(\d+\)$', '');
    n := 2;
    candidate := base || ' (' || n || ')';
    WHILE EXISTS (
      SELECT 1 FROM recipes
      WHERE brewery_id = r.brewery_id AND status = 'private' AND id <> r.id
        AND name_key(data->>'name') = name_key(candidate)
    ) LOOP
      n := n + 1;
      candidate := base || ' (' || n || ')';
    END LOOP;
    UPDATE recipes SET data = jsonb_set(data, '{name}', to_jsonb(candidate)) WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Give a recipe a free name when it becomes private again or moves to another brewery
CREATE OR REPLACE FUNCTION public.recipes_free_name_on_move()
RETURNS trigger AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  n INT := 1;
BEGIN
  IF NEW.status = 'private' AND NEW.brewery_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'private' OR OLD.brewery_id IS DISTINCT FROM NEW.brewery_id) THEN
    candidate := btrim(coalesce(NEW.data->>'name', ''));
    base := regexp_replace(candidate, '\s\(\d+\)$', '');
    WHILE EXISTS (
      SELECT 1 FROM recipes
      WHERE brewery_id = NEW.brewery_id AND status = 'private' AND id <> NEW.id
        AND name_key(data->>'name') = name_key(candidate)
    ) LOOP
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

REVOKE EXECUTE ON FUNCTION public.recipes_free_name_on_move() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recipes_free_name_on_move ON recipes;
CREATE TRIGGER recipes_free_name_on_move
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION recipes_free_name_on_move();

-- 3. The rules themselves
CREATE UNIQUE INDEX IF NOT EXISTS recipes_private_name_per_brewery
  ON recipes (brewery_id, name_key(data->>'name'))
  WHERE status = 'private';

CREATE UNIQUE INDEX IF NOT EXISTS recipes_public_name
  ON recipes (name_key(data->>'name'))
  WHERE status = 'approved';

-- Library items: merge duplicates, then unique names (private per brewery, public in total)
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

-- Deleting a recipe that brews still use (#106)
-- The app asks first: delete the recipe with its brews and their tasting notes, or cancel.
-- Brews refer to their recipe in data->>'recipeId' and tasting notes to their brew in
-- data->>'brewLogId' (text ids in JSON), so there is no foreign key to cascade on.

-- What depends on a recipe. 'foreign' counts brews and notes of other breweries:
-- those are never deleted, so the recipe cannot be deleted while they exist.
CREATE OR REPLACE FUNCTION public.recipe_dependents(p_recipe_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_brewery UUID := get_user_brewery_id();
  result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Only for recipes the caller can see
  IF NOT EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = p_recipe_id AND (r.brewery_id = my_brewery OR r.status = 'approved' OR is_admin())
  ) THEN
    RETURN jsonb_build_object('brews', 0, 'notes', 0, 'foreign', 0);
  END IF;

  WITH b AS (
    SELECT id, brewery_id FROM brew_logs WHERE data->>'recipeId' = p_recipe_id
  ), n AS (
    SELECT brewery_id FROM tasting_notes
    WHERE data->>'recipeId' = p_recipe_id OR data->>'brewLogId' IN (SELECT id FROM b)
  )
  SELECT jsonb_build_object(
    'brews', (SELECT count(*) FROM b),
    'notes', (SELECT count(*) FROM n),
    'foreign', (SELECT count(*) FROM b WHERE brewery_id IS NOT NULL AND brewery_id <> my_brewery)
             + (SELECT count(*) FROM n WHERE brewery_id IS NOT NULL AND brewery_id <> my_brewery)
  ) INTO result;
  RETURN result;
END;
$$;

-- Deletes a recipe in one transaction. With p_with_brews the brews of the recipe and
-- their tasting notes go too; without it, a recipe that has brews is refused.
-- Same rights as the RLS policies: brewery admin/brewmaster for their brewery, or global admin.
CREATE OR REPLACE FUNCTION public.delete_recipe(p_recipe_id TEXT, p_with_brews BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_brewery UUID;
  deps JSONB;
  n_notes INT;
  n_brews INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT brewery_id INTO rec_brewery FROM recipes WHERE id = p_recipe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (is_admin() OR (rec_brewery = get_user_brewery_id() AND get_user_brewery_role() IN ('admin', 'brewmaster'))) THEN
    RAISE EXCEPTION 'Not allowed to delete this recipe' USING ERRCODE = '42501';
  END IF;

  deps := recipe_dependents(p_recipe_id);
  IF (deps->>'foreign')::int > 0 THEN
    RAISE EXCEPTION 'Recipe is used by brews of another brewery' USING HINT = 'recipe_in_use_elsewhere';
  END IF;
  IF (deps->>'brews')::int > 0 AND NOT p_with_brews THEN
    RAISE EXCEPTION 'Recipe has brews' USING HINT = 'recipe_has_brews';
  END IF;

  DELETE FROM tasting_notes
  WHERE data->>'recipeId' = p_recipe_id
     OR data->>'brewLogId' IN (SELECT id FROM brew_logs WHERE data->>'recipeId' = p_recipe_id);
  GET DIAGNOSTICS n_notes = ROW_COUNT;

  DELETE FROM brew_logs WHERE data->>'recipeId' = p_recipe_id;
  GET DIAGNOSTICS n_brews = ROW_COUNT;

  DELETE FROM recipes WHERE id = p_recipe_id;

  RETURN jsonb_build_object('brews', n_brews, 'notes', n_notes);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recipe_dependents(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_recipe(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_dependents(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recipe(TEXT, BOOLEAN) TO authenticated;
