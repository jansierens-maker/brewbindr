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

-- Round stored mash temperatures (#111)
-- BeerXML stores °F converted to °C, e.g. 65.555556. The app now rounds mash steps on
-- import, save and load (normalizeMash); this cleans up what is already stored, with
-- the same rules: temperatures 0.1 °C, times whole minutes, infuse water 0.1 L.
-- Idempotent: rounded values stay the same, and only rows that change are updated.

CREATE OR REPLACE FUNCTION pg_temp.round_keys(obj JSONB, keys TEXT[], decimals INT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(obj, '{}'::jsonb) || coalesce((
    SELECT jsonb_object_agg(k, round((obj->>k)::numeric, decimals))
    FROM unnest(keys) k
    WHERE jsonb_typeof(obj->k) = 'number'
  ), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION pg_temp.round_mash(mash JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.round_keys(mash, ARRAY['grain_temp', 'sparge_temp'], 1)
    || CASE WHEN jsonb_typeof(mash->'steps') = 'array' THEN jsonb_build_object('steps', (
         SELECT coalesce(jsonb_agg(
           pg_temp.round_keys(
             pg_temp.round_keys(
               pg_temp.round_keys(s, ARRAY['step_temp', 'temperature', 'end_temp'], 1),
               ARRAY['step_time', 'duration', 'ramp_time'], 0),
             ARRAY['infuse_amount'], 1)
           ORDER BY i), '[]'::jsonb)
         FROM jsonb_array_elements(mash->'steps') WITH ORDINALITY AS e(s, i)))
       ELSE '{}'::jsonb END
$$;

UPDATE recipes
SET data = jsonb_set(data, '{mash}', pg_temp.round_mash(data->'mash'))
WHERE jsonb_typeof(data->'mash') = 'object'
  AND pg_temp.round_mash(data->'mash') IS DISTINCT FROM data->'mash';

UPDATE mash_profiles
SET data = pg_temp.round_mash(data)
WHERE jsonb_typeof(data) = 'object'
  AND pg_temp.round_mash(data) IS DISTINCT FROM data;


-- Tasters on tasting notes
-- 1. A display name per user, shown as the taster of their notes and in the team.
-- 2. Tasting notes: every member adds notes in their own name (user_id = the caller;
--    a note for a guest is entered by a member and stays theirs); members change and
--    delete their own notes, brewery admins and brewmasters all notes of the brewery.
--    Replaces "Allow brewery members manage tasting_notes", which let every member
--    change or delete any note of the brewery (#124).
-- Idempotent and compatible with the previous app version: it only adds a column and
-- saves notes in the caller's name.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_display_name_length') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_length
      CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40);
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow brewery members manage tasting_notes" ON tasting_notes;

DROP POLICY IF EXISTS "Members add own tasting_notes" ON tasting_notes;
CREATE POLICY "Members add own tasting_notes" ON tasting_notes FOR INSERT
  WITH CHECK (brewery_id = get_user_brewery_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Members change own tasting_notes" ON tasting_notes;
CREATE POLICY "Members change own tasting_notes" ON tasting_notes FOR UPDATE
  USING (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')))
  WITH CHECK (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')));

DROP POLICY IF EXISTS "Members delete own tasting_notes" ON tasting_notes;
CREATE POLICY "Members delete own tasting_notes" ON tasting_notes FOR DELETE
  USING (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')));


-- Who made a row (#124)
-- The policies check the brewery and the role, but not user_id: a member could store a
-- row in a colleague's name, and saving someone else's row could change its maker.
-- For calls from the app (roles anon/authenticated) and except for the app admin:
--   - a new row always gets user_id = the caller,
--   - an update keeps the user_id the row already had.
-- Server-side functions (SECURITY DEFINER, migrations) are not affected.
-- Idempotent and compatible with the previous app version: it only changes user_id
-- values the app should not have set.

CREATE OR REPLACE FUNCTION public.guard_row_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
    ELSE
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Named so it sorts before on_<table>_brewery_link: triggers fire in name order, and the
-- brewery link looks up the brewery of NEW.user_id.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures',
                           'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_aa_owner ON %I', t, t);
    EXECUTE format('CREATE TRIGGER on_%I_aa_owner BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_row_owner()', t, t);
  END LOOP;
END $$;


-- Submitting to the public library (#138)
-- Only the brewery admin submits recipes and ingredients to the public library; the app
-- admin approves them, as before. The policies let admins and brewmasters manage the
-- rows of their brewery, so a trigger checks the status: for calls from the app (except
-- the app admin), only a brewery admin may create a 'submitted' row or move a row into
-- or out of 'submitted'. Brewmasters keep creating and changing private rows.
-- Idempotent and compatible with the previous app version (it only refuses what the
-- new rule forbids).

CREATE OR REPLACE FUNCTION public.guard_public_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin()
     AND get_user_brewery_role() IS DISTINCT FROM 'admin'
     AND (
       (TG_OP = 'INSERT' AND NEW.status = 'submitted')
       OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
           AND 'submitted' IN (NEW.status, OLD.status))
     ) THEN
    RAISE EXCEPTION 'Only the brewery admin can submit to the public library'
      USING ERRCODE = '42501', HINT = 'publish_admin_only';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_publish_guard ON %I', t, t);
    EXECUTE format('CREATE TRIGGER on_%I_publish_guard BEFORE INSERT OR UPDATE OF status ON %I FOR EACH ROW EXECUTE FUNCTION guard_public_submission()', t, t);
  END LOOP;
END $$;


-- Invitations (#120, #125)
-- Every new user is admin of their own brewery and could send invitation e-mails from
-- our domain without limit. Now:
--   - an invitation e-mail is only sent after claim_invite_send() allows it: at most 3
--     sends per invitation and 10 per brewery per 24 hours;
--   - an invitation is valid for at most 30 days; created_at and the send counters
--     cannot be set from the app;
--   - a brewery name is 1 to 60 characters;
--   - invite codes are stored and matched in upper case without spaces, also at
--     sign-up (a code typed in lower case gave the user their own brewery instead).
-- Idempotent and compatible with the previous app version.

-- Send counters on invitations, and a log of sends per brewery (kept when an
-- invitation is deleted, so deleting and re-creating does not reset the limit)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS invitation_sends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitation_sends_brewery_time ON invitation_sends (brewery_id, sent_at);
-- Only reachable through claim_invite_send()
ALTER TABLE invitation_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_sends FROM anon, authenticated;

-- Codes in one form
UPDATE invitations SET code = upper(btrim(code)) WHERE code IS DISTINCT FROM upper(btrim(code));

-- What the app may set on an invitation
CREATE OR REPLACE FUNCTION public.guard_invitation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
      NEW.sent_count := 0;
      NEW.last_sent_at := NULL;
    ELSE
      NEW.created_at := OLD.created_at;
      NEW.sent_count := OLD.sent_count;
      NEW.last_sent_at := OLD.last_sent_at;
    END IF;
  END IF;
  NEW.expires_at := least(coalesce(NEW.expires_at, now() + interval '7 days'),
                          coalesce(NEW.created_at, now()) + interval '30 days');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invitation_guard ON invitations;
CREATE TRIGGER on_invitation_guard BEFORE INSERT OR UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION guard_invitation();

-- Asked by /api/send-invite (as the signed-in user) right before it sends the e-mail.
-- Returns {"allowed": true} and counts the send, or {"allowed": false, "reason": ...}.
CREATE OR REPLACE FUNCTION public.claim_invite_send(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  recent INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT id, brewery_id, email, expires_at, sent_count INTO inv
  FROM invitations WHERE id = p_invitation_id FOR UPDATE;

  IF NOT FOUND OR NOT (is_admin() OR (inv.brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin')) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF inv.email IS NULL OR inv.expires_at <= now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF inv.sent_count >= 3 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invite_resend_limit');
  END IF;

  -- Serialize per brewery so parallel calls cannot pass the limit together
  PERFORM 1 FROM breweries WHERE id = inv.brewery_id FOR UPDATE;
  SELECT count(*) INTO recent FROM invitation_sends
  WHERE brewery_id = inv.brewery_id AND sent_at > now() - interval '24 hours';
  IF recent >= 10 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invite_daily_limit');
  END IF;

  INSERT INTO invitation_sends (brewery_id) VALUES (inv.brewery_id);
  UPDATE invitations SET sent_count = sent_count + 1, last_sent_at = now() WHERE id = inv.id;
  -- Keep the log small
  DELETE FROM invitation_sends WHERE brewery_id = inv.brewery_id AND sent_at < now() - interval '30 days';

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_invite_send(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite_send(UUID) TO authenticated;

-- Brewery names: 1 to 60 characters (existing names are short)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'breweries_name_length') THEN
    ALTER TABLE breweries ADD CONSTRAINT breweries_name_length
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);
  END IF;
END $$;

-- Sign-up with an invite code: match it in upper case without spaces (#125)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_brewery_id UUID;
  invite_code TEXT;
  invite_role TEXT;
  invite_brewery_id UUID;
BEGIN
  invite_code := upper(btrim(new.raw_user_meta_data->>'invite_code'));

  IF invite_code IS NOT NULL AND invite_code <> '' THEN
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

-- Installation presets in the public library (#164)
-- The fixed list of presets in the app becomes public installations (approved, no owner;
-- the app admin maintains them). "New installation" starts from the public installations.
-- Idempotent: fixed ids, and a preset is skipped when a public installation with the same
-- name already exists. Compatible with the previous app version: it only adds approved rows,
-- which that version already shows in the public library.

INSERT INTO equipment (id, data, user_id, brewery_id, status)
SELECT p.id, p.data, NULL, NULL, 'approved'
FROM (VALUES
  ('preset-brewie', '{"id":"preset-brewie","name":"Brewie","type":"equipment","preset":"Brewie","status":"approved","equipment_type":"two_vessel","batch_size":23,"efficiency":70,"trub_chiller_loss":2,"mash_capacity":22,"grain_displacement":1,"boil_capacity":23,"vessels":[{"name":"Maischketel","role":"combined","volume":27,"heating":"electric","pump":true},{"name":"Kookketel","role":"boil","volume":23,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-grainfather-g30', '{"id":"preset-grainfather-g30","name":"Grainfather G30","type":"equipment","preset":"Grainfather G30","status":"approved","equipment_type":"all_in_one","batch_size":25,"efficiency":72,"trub_chiller_loss":2,"vessels":[{"name":"G30","role":"combined","volume":30,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-grainfather-g40', '{"id":"preset-grainfather-g40","name":"Grainfather G40","type":"equipment","preset":"Grainfather G40","status":"approved","equipment_type":"all_in_one","batch_size":35,"efficiency":72,"trub_chiller_loss":2,"mash_capacity":46,"boil_capacity":46,"max_grain_kg":13,"vessels":[{"name":"G40","role":"combined","volume":40,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-brew-monk-b40', '{"id":"preset-brew-monk-b40","name":"Brew Monk B40","type":"equipment","preset":"Brew Monk B40","status":"approved","equipment_type":"all_in_one","batch_size":30,"efficiency":72,"trub_chiller_loss":2,"mash_capacity":40,"boil_capacity":40,"max_grain_kg":8,"vessels":[{"name":"B40","role":"combined","volume":40,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-brew-monk-b50', '{"id":"preset-brew-monk-b50","name":"Brew Monk B50","type":"equipment","preset":"Brew Monk B50","status":"approved","equipment_type":"all_in_one","batch_size":45,"efficiency":72,"trub_chiller_loss":2,"mash_capacity":50,"boil_capacity":50,"max_grain_kg":12,"vessels":[{"name":"B50","role":"combined","volume":50,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-brew-monk-b70', '{"id":"preset-brew-monk-b70","name":"Brew Monk B70","type":"equipment","preset":"Brew Monk B70","status":"approved","equipment_type":"all_in_one","batch_size":65,"efficiency":72,"trub_chiller_loss":3,"mash_capacity":70,"boil_capacity":70,"max_grain_kg":18,"vessels":[{"name":"B70","role":"combined","volume":70,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-robobrew-brewzilla', '{"id":"preset-robobrew-brewzilla","name":"Robobrew / BrewZilla","type":"equipment","preset":"Robobrew / BrewZilla","status":"approved","equipment_type":"all_in_one","batch_size":30,"efficiency":70,"trub_chiller_loss":2,"vessels":[{"name":"BrewZilla","role":"combined","volume":35,"heating":"electric","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-biab-20l', '{"id":"preset-biab-20l","name":"BIAB 20L","type":"equipment","preset":"BIAB 20L","status":"approved","equipment_type":"biab","batch_size":20,"efficiency":65,"trub_chiller_loss":2,"vessels":[{"name":"Ketel","role":"combined","volume":30,"heating":"gas","pump":false}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-biab-30l', '{"id":"preset-biab-30l","name":"BIAB 30L","type":"equipment","preset":"BIAB 30L","status":"approved","equipment_type":"biab","batch_size":30,"efficiency":65,"trub_chiller_loss":2,"vessels":[{"name":"Ketel","role":"combined","volume":45,"heating":"gas","pump":false}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-klassiek-3-vatten-20l', '{"id":"preset-klassiek-3-vatten-20l","name":"Klassiek 3-vatten 20L","type":"equipment","preset":"Klassiek 3-vatten 20L","status":"approved","equipment_type":"three_vessel","batch_size":20,"efficiency":75,"trub_chiller_loss":1,"vessels":[{"name":"HLT","role":"hlt","volume":30,"heating":"electric","pump":true},{"name":"MLT","role":"mash","volume":30,"heating":"none","pump":false},{"name":"Kookketel","role":"boil","volume":30,"heating":"gas","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-klassiek-3-vatten-30l', '{"id":"preset-klassiek-3-vatten-30l","name":"Klassiek 3-vatten 30L","type":"equipment","preset":"Klassiek 3-vatten 30L","status":"approved","equipment_type":"three_vessel","batch_size":30,"efficiency":75,"trub_chiller_loss":2,"vessels":[{"name":"HLT","role":"hlt","volume":40,"heating":"electric","pump":true},{"name":"MLT","role":"mash","volume":40,"heating":"none","pump":false},{"name":"Kookketel","role":"boil","volume":40,"heating":"gas","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-rims-20l', '{"id":"preset-rims-20l","name":"RIMS 20L","type":"equipment","preset":"RIMS 20L","status":"approved","equipment_type":"rims","batch_size":20,"efficiency":78,"trub_chiller_loss":1,"vessels":[{"name":"HLT","role":"hlt","volume":30,"heating":"electric","pump":true},{"name":"MLT","role":"mash","volume":30,"heating":"none","pump":true},{"name":"Kookketel","role":"boil","volume":30,"heating":"gas","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb),
  ('preset-herms-20l', '{"id":"preset-herms-20l","name":"HERMS 20L","type":"equipment","preset":"HERMS 20L","status":"approved","equipment_type":"herms","batch_size":20,"efficiency":80,"trub_chiller_loss":1,"vessels":[{"name":"HLT","role":"hlt","volume":30,"heating":"electric","pump":true},{"name":"MLT","role":"mash","volume":30,"heating":"none","pump":true},{"name":"Kookketel","role":"boil","volume":30,"heating":"gas","pump":true}],"boil_time":60,"fermenter_loss":1,"evap_rate":2,"top_up_water":0}'::jsonb)
) AS p(id, data)
WHERE NOT EXISTS (
  SELECT 1 FROM equipment e
  WHERE e.status = 'approved' AND name_key(e.data->>'name') = name_key(p.data->>'name')
)
ON CONFLICT (id) DO NOTHING;

-- Water presets in the public library (#174)
-- The fixed water profiles in the app become public water profiles (approved, no owner;
-- the app admin maintains them): the classic waters as base water, the colour and beer
-- style profiles as target profiles (data->>'water_kind'). data->>'preset_key' keeps the
-- old 'preset:<key>' references in recipes working. Water profiles without a kind are
-- base water, so existing rows need no change.
-- Idempotent: fixed ids, and a preset is skipped when a public water profile with the same
-- name already exists. Compatible with the previous app version: it only adds approved
-- rows, which that version shows in the public library.

INSERT INTO waters (id, data, user_id, brewery_id, status)
SELECT p.id, p.data, NULL, NULL, 'approved'
FROM (VALUES
  ('preset-water-ro', '{"id":"preset-water-ro","name":"Osmose / gedemineraliseerd","type":"water","status":"approved","water_kind":"base","preset_key":"ro","calcium":0,"magnesium":0,"sodium":0,"chloride":0,"sulfate":0,"bicarbonate":0}'::jsonb),
  ('preset-water-pilsen', '{"id":"preset-water-pilsen","name":"Pilsen","type":"water","status":"approved","water_kind":"base","preset_key":"pilsen","calcium":7,"magnesium":2,"sodium":2,"chloride":5,"sulfate":5,"bicarbonate":15}'::jsonb),
  ('preset-water-munich', '{"id":"preset-water-munich","name":"München","type":"water","status":"approved","water_kind":"base","preset_key":"munich","calcium":77,"magnesium":17,"sodium":4,"chloride":8,"sulfate":18,"bicarbonate":295}'::jsonb),
  ('preset-water-vienna', '{"id":"preset-water-vienna","name":"Wenen","type":"water","status":"approved","water_kind":"base","preset_key":"vienna","calcium":200,"magnesium":60,"sodium":8,"chloride":12,"sulfate":125,"bicarbonate":120}'::jsonb),
  ('preset-water-dortmund', '{"id":"preset-water-dortmund","name":"Dortmund","type":"water","status":"approved","water_kind":"base","preset_key":"dortmund","calcium":225,"magnesium":40,"sodium":60,"chloride":60,"sulfate":120,"bicarbonate":220}'::jsonb),
  ('preset-water-dublin', '{"id":"preset-water-dublin","name":"Dublin","type":"water","status":"approved","water_kind":"base","preset_key":"dublin","calcium":118,"magnesium":4,"sodium":12,"chloride":19,"sulfate":54,"bicarbonate":319}'::jsonb),
  ('preset-water-edinburgh', '{"id":"preset-water-edinburgh","name":"Edinburgh","type":"water","status":"approved","water_kind":"base","preset_key":"edinburgh","calcium":120,"magnesium":25,"sodium":55,"chloride":65,"sulfate":140,"bicarbonate":225}'::jsonb),
  ('preset-water-london', '{"id":"preset-water-london","name":"Londen","type":"water","status":"approved","water_kind":"base","preset_key":"london","calcium":52,"magnesium":32,"sodium":86,"chloride":34,"sulfate":32,"bicarbonate":104}'::jsonb),
  ('preset-water-burton', '{"id":"preset-water-burton","name":"Burton-on-Trent","type":"water","status":"approved","water_kind":"base","preset_key":"burton","calcium":352,"magnesium":24,"sodium":44,"chloride":16,"sulfate":820,"bicarbonate":320}'::jsonb),
  ('preset-water-light-balanced', '{"id":"preset-water-light-balanced","name":"Licht – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"light_balanced","calcium":50,"magnesium":7,"sodium":5,"chloride":60,"sulfate":75,"bicarbonate":0}'::jsonb),
  ('preset-water-light-hoppy', '{"id":"preset-water-light-hoppy","name":"Licht – hoppig","type":"water","status":"approved","water_kind":"target","preset_key":"light_hoppy","calcium":75,"magnesium":7,"sodium":5,"chloride":50,"sulfate":150,"bicarbonate":0}'::jsonb),
  ('preset-water-light-malty', '{"id":"preset-water-light-malty","name":"Licht – moutig","type":"water","status":"approved","water_kind":"target","preset_key":"light_malty","calcium":50,"magnesium":7,"sodium":5,"chloride":90,"sulfate":50,"bicarbonate":0}'::jsonb),
  ('preset-water-amber-balanced', '{"id":"preset-water-amber-balanced","name":"Amber – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"amber_balanced","calcium":50,"magnesium":10,"sodium":15,"chloride":60,"sulfate":80,"bicarbonate":40}'::jsonb),
  ('preset-water-dark-balanced', '{"id":"preset-water-dark-balanced","name":"Donker – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"dark_balanced","calcium":50,"magnesium":10,"sodium":15,"chloride":65,"sulfate":70,"bicarbonate":120}'::jsonb),
  ('preset-water-style-west-coast-ipa', '{"id":"preset-water-style-west-coast-ipa","name":"West Coast IPA / DIPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_west_coast_ipa","calcium":160,"magnesium":8,"sodium":20,"chloride":60,"sulfate":300,"bicarbonate":25}'::jsonb),
  ('preset-water-style-american-ipa', '{"id":"preset-water-style-american-ipa","name":"American IPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_american_ipa","calcium":125,"magnesium":8,"sodium":25,"chloride":75,"sulfate":225,"bicarbonate":25}'::jsonb),
  ('preset-water-style-neipa', '{"id":"preset-water-style-neipa","name":"New England IPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_neipa","calcium":110,"magnesium":5,"sodium":10,"chloride":150,"sulfate":100,"bicarbonate":0}'::jsonb),
  ('preset-water-style-english-ipa', '{"id":"preset-water-style-english-ipa","name":"English IPA (Burton)","type":"water","status":"approved","water_kind":"target","preset_key":"style_english_ipa","calcium":300,"magnesium":30,"sodium":40,"chloride":30,"sulfate":600,"bicarbonate":140}'::jsonb),
  ('preset-water-style-pale-ale', '{"id":"preset-water-style-pale-ale","name":"Pale ale","type":"water","status":"approved","water_kind":"target","preset_key":"style_pale_ale","calcium":100,"magnesium":8,"sodium":20,"chloride":60,"sulfate":150,"bicarbonate":25}'::jsonb),
  ('preset-water-style-czech-pils', '{"id":"preset-water-style-czech-pils","name":"Tsjechische pils","type":"water","status":"approved","water_kind":"target","preset_key":"style_czech_pils","calcium":15,"magnesium":3,"sodium":5,"chloride":10,"sulfate":10,"bicarbonate":10}'::jsonb),
  ('preset-water-style-german-pils', '{"id":"preset-water-style-german-pils","name":"Duitse pils / lichte lager","type":"water","status":"approved","water_kind":"target","preset_key":"style_german_pils","calcium":60,"magnesium":10,"sodium":15,"chloride":40,"sulfate":50,"bicarbonate":15}'::jsonb),
  ('preset-water-style-belgian-blond', '{"id":"preset-water-style-belgian-blond","name":"Belgisch blond","type":"water","status":"approved","water_kind":"target","preset_key":"style_belgian_blond","calcium":75,"magnesium":10,"sodium":15,"chloride":70,"sulfate":60,"bicarbonate":40}'::jsonb),
  ('preset-water-style-tripel', '{"id":"preset-water-style-tripel","name":"Tripel","type":"water","status":"approved","water_kind":"target","preset_key":"style_tripel","calcium":65,"magnesium":10,"sodium":10,"chloride":60,"sulfate":60,"bicarbonate":25}'::jsonb),
  ('preset-water-style-saison', '{"id":"preset-water-style-saison","name":"Saison","type":"water","status":"approved","water_kind":"target","preset_key":"style_saison","calcium":100,"magnesium":10,"sodium":30,"chloride":75,"sulfate":60,"bicarbonate":75}'::jsonb),
  ('preset-water-style-witbier', '{"id":"preset-water-style-witbier","name":"Witbier","type":"water","status":"approved","water_kind":"target","preset_key":"style_witbier","calcium":60,"magnesium":5,"sodium":15,"chloride":60,"sulfate":40,"bicarbonate":30}'::jsonb),
  ('preset-water-style-weizen', '{"id":"preset-water-style-weizen","name":"Weizen","type":"water","status":"approved","water_kind":"target","preset_key":"style_weizen","calcium":75,"magnesium":10,"sodium":15,"chloride":50,"sulfate":50,"bicarbonate":75}'::jsonb),
  ('preset-water-style-dubbel', '{"id":"preset-water-style-dubbel","name":"Dubbel","type":"water","status":"approved","water_kind":"target","preset_key":"style_dubbel","calcium":75,"magnesium":10,"sodium":15,"chloride":75,"sulfate":50,"bicarbonate":100}'::jsonb),
  ('preset-water-style-quadrupel', '{"id":"preset-water-style-quadrupel","name":"Quadrupel","type":"water","status":"approved","water_kind":"target","preset_key":"style_quadrupel","calcium":75,"magnesium":10,"sodium":15,"chloride":80,"sulfate":50,"bicarbonate":125}'::jsonb),
  ('preset-water-style-amber', '{"id":"preset-water-style-amber","name":"Amber / Weense lager","type":"water","status":"approved","water_kind":"target","preset_key":"style_amber","calcium":100,"magnesium":12,"sodium":20,"chloride":75,"sulfate":75,"bicarbonate":75}'::jsonb),
  ('preset-water-style-marzen', '{"id":"preset-water-style-marzen","name":"Märzen / Dunkel","type":"water","status":"approved","water_kind":"target","preset_key":"style_marzen","calcium":80,"magnesium":18,"sodium":20,"chloride":15,"sulfate":20,"bicarbonate":175}'::jsonb),
  ('preset-water-style-irish-stout', '{"id":"preset-water-style-irish-stout","name":"Irish stout","type":"water","status":"approved","water_kind":"target","preset_key":"style_irish_stout","calcium":100,"magnesium":15,"sodium":30,"chloride":75,"sulfate":50,"bicarbonate":150}'::jsonb),
  ('preset-water-style-stout-porter', '{"id":"preset-water-style-stout-porter","name":"Stout / porter","type":"water","status":"approved","water_kind":"target","preset_key":"style_stout_porter","calcium":100,"magnesium":10,"sodium":20,"chloride":110,"sulfate":75,"bicarbonate":75}'::jsonb),
  ('preset-water-style-imperial-stout', '{"id":"preset-water-style-imperial-stout","name":"Imperial stout / Baltic porter","type":"water","status":"approved","water_kind":"target","preset_key":"style_imperial_stout","calcium":125,"magnesium":15,"sodium":30,"chloride":110,"sulfate":75,"bicarbonate":110}'::jsonb)
) AS p(id, data)
WHERE NOT EXISTS (
  SELECT 1 FROM waters w
  WHERE w.status = 'approved' AND name_key(w.data->>'name') = name_key(p.data->>'name')
)
ON CONFLICT (id) DO NOTHING;
-- "3-vatten" is the wrong term: rename the two public 3-vessel presets (#164) to "3 ketels".
-- Only while they still have their original name, so a correction by the app admin stays.
-- Idempotent; compatible with the previous app version (only data changes).

UPDATE equipment
SET data = data || jsonb_build_object('name', v.new_name, 'preset', v.new_name)
FROM (VALUES
  ('preset-klassiek-3-vatten-20l', 'Klassiek 3-vatten 20L', 'Klassiek 3 ketels 20L'),
  ('preset-klassiek-3-vatten-30l', 'Klassiek 3-vatten 30L', 'Klassiek 3 ketels 30L')
) AS v(id, old_name, new_name)
WHERE equipment.id = v.id AND equipment.data->>'name' = v.old_name;

-- App admin: see all breweries and delete one with everything under it
-- admin_breweries(): every brewery with its admins, member count, recipes, brews and the
--   members' last sign-in. Only for the app admin (is_admin()).
-- admin_delete_brewery(id, confirm_name): in one transaction
--   - the brewery's own data goes: recipes, brews, tasting notes, ingredients, mash and water
--     profiles, styles, installations, stock, invitations, and items submitted to the public
--     library but not yet approved;
--   - items approved in the public library stay; they become the calling app admin's;
--   - the members' accounts are deleted; what a member made in another brewery stays there,
--     without a maker;
--   - refused for the caller's own brewery, a brewery with an app admin among its members,
--     or when confirm_name is not the brewery's name.
-- Idempotent (CREATE OR REPLACE) and compatible with the previous app version (new functions).

CREATE OR REPLACE FUNCTION public.admin_breweries()
RETURNS TABLE (
  id UUID,
  name TEXT,
  created_at TIMESTAMPTZ,
  admins TEXT[],
  member_count BIGINT,
  recipe_count BIGINT,
  brew_count BIGINT,
  last_sign_in TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only the app admin can list all breweries' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id, b.name, b.created_at,
    COALESCE((SELECT array_agg(p.email ORDER BY p.email) FROM profiles p
              WHERE p.brewery_id = b.id AND p.brewery_role = 'admin'), ARRAY[]::TEXT[]),
    (SELECT count(*) FROM profiles p WHERE p.brewery_id = b.id),
    (SELECT count(*) FROM recipes r WHERE r.brewery_id = b.id AND r.status IS DISTINCT FROM 'approved'),
    (SELECT count(*) FROM brew_logs l WHERE l.brewery_id = b.id),
    (SELECT max(u.last_sign_in_at) FROM auth.users u JOIN profiles p ON p.id = u.id WHERE p.brewery_id = b.id)
  FROM breweries b
  ORDER BY b.name, b.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_brewery(p_brewery_id UUID, p_confirm_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_members UUID[];
  v_counts JSONB := '{}'::jsonb;
  v_kept INT := 0;
  v_n INT;
  t TEXT;
  status_tables TEXT[] := ARRAY['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs',
                                'mash_profiles', 'equipment', 'waters'];
  all_tables TEXT[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures',
                             'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only the app admin can delete a brewery' USING ERRCODE = '42501';
  END IF;

  SELECT b.name INTO v_name FROM breweries b WHERE b.id = p_brewery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brewery not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_brewery_id = get_user_brewery_id() THEN
    RAISE EXCEPTION 'You cannot delete your own brewery' USING ERRCODE = '42501', HINT = 'own_brewery';
  END IF;
  IF btrim(coalesce(p_confirm_name, '')) IS DISTINCT FROM btrim(v_name) THEN
    RAISE EXCEPTION 'The name does not match' USING ERRCODE = '22023', HINT = 'name_mismatch';
  END IF;

  SELECT coalesce(array_agg(p.id), ARRAY[]::UUID[]) INTO v_members FROM profiles p WHERE p.brewery_id = p_brewery_id;
  IF EXISTS (SELECT 1 FROM profiles p WHERE p.id = ANY (v_members) AND p.role = 'admin') THEN
    RAISE EXCEPTION 'An app admin is a member of this brewery' USING ERRCODE = '42501', HINT = 'has_app_admin';
  END IF;

  FOREACH t IN ARRAY all_tables LOOP
    -- Approved public items stay, as the calling app admin's
    IF t = ANY (status_tables) THEN
      EXECUTE format('UPDATE %I SET user_id = auth.uid(), brewery_id = NULL
                      WHERE status = ''approved'' AND (brewery_id = $1 OR user_id = ANY ($2))', t)
        USING p_brewery_id, v_members;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_kept := v_kept + v_n;
      -- The brewery's own rows, and its members' rows without a brewery
      EXECUTE format('DELETE FROM %I WHERE status IS DISTINCT FROM ''approved''
                      AND (brewery_id = $1 OR (brewery_id IS NULL AND user_id = ANY ($2)))', t)
        USING p_brewery_id, v_members;
    ELSE
      EXECUTE format('DELETE FROM %I WHERE brewery_id = $1 OR (brewery_id IS NULL AND user_id = ANY ($2))', t)
        USING p_brewery_id, v_members;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(t, v_n);
    -- What members made in another brewery stays there, without a maker
    EXECUTE format('UPDATE %I SET user_id = NULL WHERE user_id = ANY ($1)', t) USING v_members;
  END LOOP;

  -- Accounts (profiles and AI usage go with them), then the brewery (stock, invitations go with it)
  DELETE FROM auth.users u WHERE u.id = ANY (v_members);
  DELETE FROM breweries b WHERE b.id = p_brewery_id;

  RETURN jsonb_build_object('brewery', v_name, 'members', coalesce(array_length(v_members, 1), 0),
                            'deleted', v_counts, 'kept_public', v_kept);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_breweries() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_brewery(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_breweries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_brewery(UUID, TEXT) TO authenticated;

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

-- Flavour Lab (#193): knowledge base of aroma compounds per ingredient, and links of recipe names
-- to it per brewery.
-- Knowledge base: flavour_families, flavour_compounds, flavour_sources, flavour_ingredients and
--   flavour_ingredient_compounds (every link has a source). The same for everyone and read-only:
--   anyone may read, only migrations write. The data come from data/flavour-lab.json
--   (scripts/flavour-seed-sql.mjs); flavour_meta holds its version for the app's cache.
-- flavour_mappings: a recipe name (normalised) linked by hand to a knowledge-base ingredient, or to
--   nothing (leave out), per brewery. Members read; admin, brewmaster and brewer change.
-- Idempotent (IF NOT EXISTS, DROP POLICY IF EXISTS, upserts) and compatible with the previous app
-- version (new tables only).

CREATE TABLE IF NOT EXISTS public.flavour_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.flavour_families (
  id TEXT PRIMARY KEY,
  name_nl TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  color TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.flavour_compounds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family_id TEXT NOT NULL REFERENCES public.flavour_families (id),
  volatility TEXT NOT NULL CHECK (volatility IN ('high', 'medium', 'low')),
  aroma_active BOOLEAN NOT NULL DEFAULT false,
  descriptor_nl TEXT NOT NULL,
  descriptor_fr TEXT NOT NULL,
  descriptor_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.flavour_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  type TEXT NOT NULL,
  accessed_on DATE NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS public.flavour_ingredients (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('spice', 'hop', 'yeast', 'malt')),
  name_nl TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  dose_min_g_per_l NUMERIC CHECK (dose_min_g_per_l IS NULL OR dose_min_g_per_l > 0),
  dose_max_g_per_l NUMERIC CHECK (dose_max_g_per_l IS NULL OR dose_max_g_per_l >= dose_min_g_per_l),
  preferred_stage TEXT CHECK (preferred_stage IN ('boil_long', 'boil_short', 'whirlpool', 'primary', 'secondary', 'bottling')),
  form TEXT CHECK (form IN ('whole', 'crushed', 'zest', 'tincture')),
  yeast_pof BOOLEAN,
  notes_nl TEXT,
  notes_fr TEXT,
  notes_en TEXT
);

CREATE TABLE IF NOT EXISTS public.flavour_ingredient_compounds (
  ingredient_id TEXT NOT NULL REFERENCES public.flavour_ingredients (id) ON DELETE CASCADE,
  compound_id TEXT NOT NULL REFERENCES public.flavour_compounds (id),
  intensity INT NOT NULL CHECK (intensity BETWEEN 0 AND 5),
  source_id TEXT NOT NULL REFERENCES public.flavour_sources (id),
  PRIMARY KEY (ingredient_id, compound_id)
);
CREATE INDEX IF NOT EXISTS flavour_ingredient_compounds_compound_idx ON public.flavour_ingredient_compounds (compound_id);
CREATE INDEX IF NOT EXISTS flavour_ingredient_compounds_source_idx ON public.flavour_ingredient_compounds (source_id);
CREATE INDEX IF NOT EXISTS flavour_compounds_family_idx ON public.flavour_compounds (family_id);

CREATE TABLE IF NOT EXISTS public.flavour_mappings (
  brewery_id UUID NOT NULL REFERENCES public.breweries (id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('spice', 'hop', 'yeast', 'malt')),
  name_key TEXT NOT NULL CHECK (char_length(name_key) BETWEEN 1 AND 200),
  ingredient_id TEXT REFERENCES public.flavour_ingredients (id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brewery_id, category, name_key)
);
CREATE INDEX IF NOT EXISTS flavour_mappings_ingredient_idx ON public.flavour_mappings (ingredient_id);
CREATE INDEX IF NOT EXISTS flavour_mappings_created_by_idx ON public.flavour_mappings (created_by);

-- Knowledge base: read-only for everyone
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['flavour_meta', 'flavour_families', 'flavour_compounds', 'flavour_sources',
                           'flavour_ingredients', 'flavour_ingredient_compounds'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone reads %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Anyone reads %s" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t, t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- Links per brewery
ALTER TABLE public.flavour_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read flavour_mappings" ON public.flavour_mappings;
CREATE POLICY "Members read flavour_mappings" ON public.flavour_mappings FOR SELECT TO authenticated
  USING (brewery_id = (SELECT get_user_brewery_id()));
DROP POLICY IF EXISTS "Brewers add flavour_mappings" ON public.flavour_mappings;
CREATE POLICY "Brewers add flavour_mappings" ON public.flavour_mappings FOR INSERT TO authenticated
  WITH CHECK (brewery_id = (SELECT get_user_brewery_id()) AND (SELECT get_user_brewery_role()) IN ('admin', 'brewmaster', 'brewer'));
DROP POLICY IF EXISTS "Brewers change flavour_mappings" ON public.flavour_mappings;
CREATE POLICY "Brewers change flavour_mappings" ON public.flavour_mappings FOR UPDATE TO authenticated
  USING (brewery_id = (SELECT get_user_brewery_id()) AND (SELECT get_user_brewery_role()) IN ('admin', 'brewmaster', 'brewer'))
  WITH CHECK (brewery_id = (SELECT get_user_brewery_id()));
DROP POLICY IF EXISTS "Brewers delete flavour_mappings" ON public.flavour_mappings;
CREATE POLICY "Brewers delete flavour_mappings" ON public.flavour_mappings FOR DELETE TO authenticated
  USING (brewery_id = (SELECT get_user_brewery_id()) AND (SELECT get_user_brewery_role()) IN ('admin', 'brewmaster', 'brewer'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flavour_mappings TO authenticated;

-- Flavour Lab knowledge base, version 2026-11-14 (generated by scripts/flavour-seed-sql.mjs)
INSERT INTO flavour_families (id, name_nl, name_fr, name_en, color, sort) VALUES
  ('citrus_terpene', 'Citrusterpenen', 'Terpènes d''agrumes', 'Citrus terpenes', '#F59E0B', 1),
  ('floral_terpene', 'Bloemige terpenen', 'Terpènes floraux', 'Floral terpenes', '#7C3AED', 2),
  ('resinous_terpene', 'Harsige terpenen', 'Terpènes résineux', 'Resinous terpenes', '#10B981', 3),
  ('woody_spicy', 'Houtig-kruidige terpenen', 'Terpènes boisés-épicés', 'Woody-spicy terpenes', '#92400E', 4),
  ('clove_phenol', 'Kruidige fenolen (kruidnagel)', 'Phénols épicés (clou de girofle)', 'Spicy phenols (clove)', '#B45309', 5),
  ('anise', 'Anijs', 'Anis', 'Anise', '#64748B', 6),
  ('cinnamon', 'Kaneel', 'Cannelle', 'Cinnamon', '#C2410C', 7),
  ('fruity_ester', 'Fruitige esters', 'Esters fruités', 'Fruity esters', '#EC4899', 8),
  ('sweet_vanilla', 'Zoet-vanille', 'Vanillé-sucré', 'Sweet vanilla', '#EAB308', 9),
  ('camphor_mint', 'Kamfer-munt', 'Camphre-menthe', 'Camphor-mint', '#06B6D4', 10),
  ('roasted', 'Geroosterd', 'Torréfié', 'Roasted', '#0F1B2D', 11),
  ('caramel_bread', 'Karamel en brood', 'Caramel et pain', 'Caramel and bread', '#D97706', 12),
  ('green', 'Groen', 'Vert', 'Green', '#65A30D', 13)
ON CONFLICT (id) DO UPDATE SET name_nl = EXCLUDED.name_nl, name_fr = EXCLUDED.name_fr, name_en = EXCLUDED.name_en, color = EXCLUDED.color, sort = EXCLUDED.sort;

INSERT INTO flavour_compounds (id, name, family_id, volatility, aroma_active, descriptor_nl, descriptor_fr, descriptor_en) VALUES
  ('limonene', 'limoneen', 'citrus_terpene', 'high', false, 'sinaasappel, citrus', 'orange, agrumes', 'orange, citrus'),
  ('citral', 'citral (geraniaal + neraal)', 'citrus_terpene', 'medium', true, 'citroen, citroengras', 'citron, citronnelle', 'lemon, lemongrass'),
  ('gamma_terpinene', 'γ-terpineen', 'citrus_terpene', 'high', false, 'citrus, kruidig, limoen', 'agrumes, épicé, citron vert', 'citrus, herbal, lime'),
  ('nootkatone', 'nootkaton', 'citrus_terpene', 'low', true, 'grapefruit', 'pamplemousse', 'grapefruit'),
  ('linalool', 'linalool', 'floral_terpene', 'high', true, 'bloemig, lavendel, citrus', 'floral, lavande, agrumes', 'floral, lavender, citrus'),
  ('geraniol', 'geraniol', 'floral_terpene', 'medium', true, 'roos, geranium', 'rose, géranium', 'rose, geranium'),
  ('citronellol', 'citronellol', 'floral_terpene', 'medium', true, 'roos, citrus', 'rose, agrumes', 'rose, citrus'),
  ('nerol', 'nerol', 'floral_terpene', 'medium', true, 'zoete roos, neroli', 'rose douce, néroli', 'sweet rose, neroli'),
  ('linalyl_acetate', 'linalylacetaat', 'floral_terpene', 'medium', false, 'bergamot, lavendel', 'bergamote, lavande', 'bergamot, lavender'),
  ('geranyl_acetate', 'geranylacetaat', 'floral_terpene', 'medium', false, 'fruitige roos', 'rose fruitée', 'fruity rose'),
  ('terpinyl_acetate', 'α-terpinylacetaat', 'floral_terpene', 'medium', false, 'zoet, kruidig, bergamot', 'doux, épicé, bergamote', 'sweet, herbal, bergamot'),
  ('phenylethanol', '2-fenylethanol', 'floral_terpene', 'medium', false, 'roos, honing', 'rose, miel', 'rose, honey'),
  ('bisabolol_oxides', 'bisabololoxiden', 'floral_terpene', 'low', false, 'zoet, kamille', 'doux, camomille', 'sweet, chamomile'),
  ('myrcene', 'myrceen', 'resinous_terpene', 'high', false, 'harsig, groen, balsamico', 'résineux, vert, balsamique', 'resinous, green, balsamic'),
  ('alpha_pinene', 'α-pineen', 'resinous_terpene', 'high', false, 'den, hars', 'pin, résine', 'pine, resin'),
  ('beta_pinene', 'β-pineen', 'resinous_terpene', 'high', false, 'den, houtig', 'pin, boisé', 'pine, woody'),
  ('sabinene', 'sabineen', 'resinous_terpene', 'high', false, 'peperig, houtig', 'poivré, boisé', 'peppery, woody'),
  ('camphene', 'camfeen', 'resinous_terpene', 'high', false, 'kamferachtig, den', 'camphré, pin', 'camphoraceous, pine'),
  ('alpha_phellandrene', 'α-phellandreen', 'resinous_terpene', 'high', false, 'peperig, munt, citrus', 'poivré, menthe, agrumes', 'peppery, minty, citrus'),
  ('delta3_carene', 'δ-3-careen', 'resinous_terpene', 'high', false, 'zoet, harsig', 'doux, résineux', 'sweet, resinous'),
  ('p_cymene', 'p-cymeen', 'resinous_terpene', 'high', false, 'citrus, houtig', 'agrumes, boisé', 'citrus, woody'),
  ('terpinen4ol', 'terpinen-4-ol', 'resinous_terpene', 'high', false, 'aards, peperig, houtig', 'terreux, poivré, boisé', 'earthy, peppery, woody'),
  ('humulene', 'α-humuleen', 'woody_spicy', 'high', false, 'houtig, kruidig, edele hop', 'boisé, épicé, houblon noble', 'woody, spicy, noble hop'),
  ('caryophyllene', 'β-caryofylleen', 'woody_spicy', 'high', false, 'peperig, houtig, kruidnagel', 'poivré, boisé, girofle', 'peppery, woody, clove'),
  ('farnesene', 'β-farneseen', 'woody_spicy', 'high', false, 'groen, houtig, appel', 'vert, boisé, pomme', 'green, woody, apple'),
  ('zingiberene', 'zingibereen', 'woody_spicy', 'high', false, 'gember, kruidig', 'gingembre, épicé', 'ginger, spicy'),
  ('ar_curcumene', 'ar-curcumeen', 'woody_spicy', 'high', false, 'kruidig, houtig', 'épicé, boisé', 'spicy, woody'),
  ('turmerones', 'turmeronen', 'woody_spicy', 'low', false, 'kurkuma, aards', 'curcuma, terreux', 'turmeric, earthy'),
  ('cuminaldehyde', 'cuminaldehyde', 'woody_spicy', 'medium', false, 'komijn, aards', 'cumin, terreux', 'cumin, earthy'),
  ('myristicin', 'myristicine', 'woody_spicy', 'low', false, 'nootmuskaat, warm', 'muscade, chaud', 'nutmeg, warm'),
  ('eugenol', 'eugenol', 'clove_phenol', 'medium', false, 'kruidnagel', 'clou de girofle', 'clove'),
  ('vinylguaiacol', '4-vinylguaiacol', 'clove_phenol', 'medium', true, 'kruidnagel, peperig (gist)', 'girofle, poivré (levure)', 'clove, peppery (yeast)'),
  ('thymol', 'thymol', 'clove_phenol', 'medium', false, 'tijm, medicinaal', 'thym, médicinal', 'thyme, medicinal'),
  ('anethole', 'anethol', 'anise', 'medium', false, 'anijs, zoethout', 'anis, réglisse', 'anise, liquorice'),
  ('estragole', 'estragol', 'anise', 'medium', false, 'dragon, anijs', 'estragon, anis', 'tarragon, anise'),
  ('cinnamaldehyde', 'kaneelaldehyde', 'cinnamon', 'medium', false, 'kaneel', 'cannelle', 'cinnamon'),
  ('isoamyl_acetate', 'isoamylacetaat', 'fruity_ester', 'high', true, 'banaan, peer', 'banane, poire', 'banana, pear'),
  ('ethyl_hexanoate', 'ethylhexanoaat', 'fruity_ester', 'high', true, 'appel, ananas, tropisch', 'pomme, ananas, tropical', 'apple, pineapple, tropical'),
  ('hop_isobutyrates', 'hop-isobutyraten (o.a. 2-methylbutylisobutyraat)', 'fruity_ester', 'high', true, 'fruitig, abrikoos, appel', 'fruité, abricot, pomme', 'fruity, apricot, apple'),
  ('vanillin', 'vanilline', 'sweet_vanilla', 'low', true, 'vanille', 'vanille', 'vanilla'),
  ('cineole', '1,8-cineol (eucalyptol)', 'camphor_mint', 'high', false, 'eucalyptus, fris', 'eucalyptus, frais', 'eucalyptus, fresh'),
  ('camphor', 'kamfer', 'camphor_mint', 'high', false, 'kamfer, koel', 'camphre, frais', 'camphor, cooling'),
  ('menthol', 'menthol', 'camphor_mint', 'high', false, 'pepermunt, koel', 'menthe poivrée, frais', 'peppermint, cooling'),
  ('menthone', 'menthon', 'camphor_mint', 'high', false, 'munt, kruidig', 'menthe, herbacé', 'mint, herbal'),
  ('fenchone', 'fenchon', 'camphor_mint', 'high', false, 'kamferachtig, venkel', 'camphré, fenouil', 'camphoraceous, fennel'),
  ('pyrazines', 'alkylpyrazinen', 'roasted', 'high', false, 'geroosterd, koffie, cacao', 'torréfié, café, cacao', 'roasted, coffee, cocoa'),
  ('maltol', 'maltol', 'caramel_bread', 'low', false, 'karamel, gebakken', 'caramel, cuit', 'caramel, baked'),
  ('furaneol', 'furaneol (HDMF)', 'caramel_bread', 'medium', false, 'karamel, aardbei', 'caramel, fraise', 'caramel, strawberry'),
  ('methylbutanal', '3-methylbutanal', 'caramel_bread', 'high', false, 'moutig, brood', 'malté, pain', 'malty, bread'),
  ('citronellal', 'citronellal', 'citrus_terpene', 'high', true, 'citronella, citrus', 'citronnelle, agrumes', 'citronella, citrus'),
  ('farnesol', 'farnesol', 'floral_terpene', 'low', false, 'zacht bloemig, lindebloesem', 'floral doux, tilleul', 'soft floral, linden'),
  ('beta_phellandrene', 'β-phellandreen', 'resinous_terpene', 'high', false, 'munt, terpentijn, citrus', 'menthe, térébenthine, agrumes', 'minty, turpentine, citrus'),
  ('terpinolene', 'terpinoleen', 'resinous_terpene', 'high', false, 'zoet, den, citrus', 'doux, pin, agrumes', 'sweet, pine, citrus'),
  ('sesquiphellandrene', 'β-sesquiphellandreen', 'woody_spicy', 'high', false, 'kruidig, houtig (gember)', 'épicé, boisé (gingembre)', 'spicy, woody (ginger)'),
  ('caryophyllene_oxide', 'caryofylleenoxide', 'woody_spicy', 'low', false, 'houtig, kruidig, droog', 'boisé, épicé, sec', 'woody, spicy, dry'),
  ('menthadienal', 'p-mentha-1,4-dien-7-al', 'woody_spicy', 'medium', false, 'komijn, kruidig', 'cumin, épicé', 'cumin, spicy'),
  ('chamazulene', 'chamazuleen', 'woody_spicy', 'high', false, 'zoet, kruidig (kamille)', 'doux, épicé (camomille)', 'sweet, herbal (chamomile)'),
  ('methyl_eugenol', 'methyleugenol', 'clove_phenol', 'medium', false, 'kruidnagel, laurier', 'girofle, laurier', 'clove, bay'),
  ('menthyl_acetate', 'menthylacetaat', 'camphor_mint', 'medium', false, 'zachte munt, fruitig', 'menthe douce, fruité', 'mild mint, fruity'),
  ('alpha_terpineol', 'α-terpineol', 'floral_terpene', 'medium', false, 'seringen, den', 'lilas, pin', 'lilac, pine'),
  ('rose_oxide', 'cis-roosoxide', 'floral_terpene', 'high', true, 'roos, lychee', 'rose, litchi', 'rose, lychee'),
  ('hotrienol', 'hotrienol', 'floral_terpene', 'high', false, 'vlierbloesem, hyacint', 'sureau, jacinthe', 'elderflower, hyacinth'),
  ('phenylacetaldehyde', 'fenylaceetaldehyde', 'floral_terpene', 'high', true, 'honing, hyacint', 'miel, jacinthe', 'honey, hyacinth'),
  ('nerolidol', 'nerolidol', 'floral_terpene', 'low', false, 'houtig, bloemig', 'boisé, floral', 'woody, floral'),
  ('nonanal', 'nonanal', 'citrus_terpene', 'high', true, 'citrus, wasachtig', 'agrumes, cireux', 'citrus, waxy'),
  ('damascenone', 'β-damascenon', 'fruity_ester', 'low', true, 'gekookte appel, honing', 'pomme cuite, miel', 'cooked apple, honey'),
  ('gamma_nonalactone', 'γ-nonalacton', 'sweet_vanilla', 'medium', true, 'kokos, zoet', 'noix de coco, doux', 'coconut, sweet'),
  ('carvacrol', 'carvacrol', 'clove_phenol', 'medium', false, 'oregano, kruidig', 'origan, épicé', 'oregano, spicy'),
  ('delta_cadinene', 'δ-cadineen', 'woody_spicy', 'high', false, 'houtig, droog', 'boisé, sec', 'woody, dry'),
  ('borneol', 'borneol', 'camphor_mint', 'high', false, 'kamfer, aards', 'camphre, terreux', 'camphor, earthy'),
  ('bornyl_acetate', 'bornylacetaat', 'resinous_terpene', 'medium', false, 'dennennaald, balsamico', 'aiguille de pin, balsamique', 'pine needle, balsamic'),
  ('acetylpyrroline', '2-acetyl-1-pyrroline', 'roasted', 'high', true, 'popcorn, broodkorst', 'pop-corn, croûte de pain', 'popcorn, bread crust'),
  ('furfurylthiol', '2-furfurylthiol', 'roasted', 'high', true, 'koffie, geroosterd', 'café, torréfié', 'coffee, roasted'),
  ('guaiacol', 'guaiacol', 'roasted', 'high', true, 'rokerig, fenolisch', 'fumé, phénolique', 'smoky, phenolic'),
  ('ibmp', '2-isobutyl-3-methoxypyrazine', 'green', 'medium', true, 'groene paprika, aards', 'poivron vert, terreux', 'green bell pepper, earthy'),
  ('hexenal', '(Z)-3-hexenal', 'green', 'high', true, 'vers gemaaid gras', 'herbe coupée', 'cut grass'),
  ('hexanal', 'hexanal', 'green', 'high', false, 'groen, grasachtig', 'vert, herbacé', 'green, grassy'),
  ('nonadienal', '(E,Z)-2,6-nonadienal', 'green', 'high', true, 'komkommer', 'concombre', 'cucumber')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family_id = EXCLUDED.family_id, volatility = EXCLUDED.volatility, aroma_active = EXCLUDED.aroma_active, descriptor_nl = EXCLUDED.descriptor_nl, descriptor_fr = EXCLUDED.descriptor_fr, descriptor_en = EXCLUDED.descriptor_en;

INSERT INTO flavour_sources (id, title, url, type, accessed_on, note) VALUES
  ('lawrence1980cor', 'Lawrence B.M. (1980) Perfumer & Flavorist 5(4):6–16 – korianderzaadolie', 'https://scent.vn/en/pages/oil/coriander-fruit-1-1018', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('supelco776', 'Supelco Bulletin 776 (1978) – zoete sinaasappelolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('dugo1993', 'Dugo G. et al. (1993) Flavour and Fragrance Journal 8:25–33 – bittere sinaasappelolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('dugo1983', 'Dugo G. et al. (1983) Essenze Derivati Agrumari 53:173–217 – citroenolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('boelens1991', 'Boelens M.H. (1991) Perfumer & Flavorist 16:17–34 – grapefruitolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('lawrence1988gin', 'Lawrence B.M. (1988) Perfumer & Flavorist 13:69–74 – gemberolie (India)', 'https://scent.vn/en/pages/oil/ginger-india-1-301', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('bernhard1971', 'Bernhard R.A. et al. (1971) Phytochemistry 10:177–184 – kardemomolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('jirovetz1998', 'Jirovetz L. et al. (1998) – kaneelolie, zoals geciteerd door scent.vn', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'REVIEW: scent.vn citeert een studie over bladolie (Kameroen) bij een bastolie-samenstelling'),
  ('viudamartos2007', 'Viuda-Martos M. et al. (2007) Acta Chimica Slovenica 54:921–926 – kruidnagel, rozemarijn, salie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('maack1982', 'Maack et al. (1982) Annales des Falsifications et de l''Expertise Chimique 75:357–367 – steranijsolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('lawrence1980ani', 'Lawrence B.M. (1980) Perfumer & Flavorist 5:10–16 – anijsolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('ashokkumar2021', 'Ashokkumar K. et al. (2021) National Academy Science Letters 44(6):503–506 – venkel en komijn', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('wrolstad', 'Wrolstad R.E. et al. (1965/1971) Journal of Food Science – zwarte peperolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; exacte publicatie en URL aanvullen'),
  ('lawrence1984pp', 'Lawrence B.M. (1984) Perfumer & Flavorist 8(5) – Schinus-olie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'REVIEW: plantendeel niet vermeld'),
  ('menut1991', 'Menut C. et al. (1991) Flavour and Fragrance Journal 6:183–186 – Aframomum melegueta', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('depascual1976', 'De Pascual Teresa J. et al. (1976) Anales de Química 72:657–660 – jeneverbesolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('formacek1982', 'Formácek V. & Kubeczka K.-H. (1982) Essential Oils Analysis by Capillary Gas Chromatography and Carbon-13 NMR Spectroscopy (Wiley)', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn'),
  ('brunke1992', 'Brunke E.-J. et al. (1992) Dragoco Report 1:3–31 – kamilleolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('mohammad1981', 'Mohammad et al. (1981) Perfumer & Flavorist 6(2):29–31 – citroengrasolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('akgul1989', 'Akgül A. et al. (1989) Journal of Essential Oil Research 1:277–280 – laurierolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('piccaglia1991', 'Piccaglia R. & Marotti M. (1991) Flavour and Fragrance Journal 6:241–244 – tijmolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('lawrence1980mint', 'Lawrence B.M. (1980) Perfumer & Flavorist 5:6–17 – pepermuntolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('lawrence1982tur', 'Lawrence B.M. (1982) Perfumer & Flavorist 7(1):45 – kurkumaolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('baldry1976', 'Baldry J. et al. (1976) International Flavours and Food Additives 7:28–30 – nootmuskaatolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('forest1972', 'Forrest J.E. et al. (1972) Journal of Chromatography 69:115–121 – foelieolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; auteursnaam en URL controleren'),
  ('boelens1997', 'Boelens M.H. & Boelens H. (1997) Perfumer & Flavorist 22:31–35 – rozenolie', NULL, 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'via scent.vn; pagina-URL aanvullen'),
  ('cai2019', 'Cai Y. et al. (2019) Molecules 24(15):2781 – vanilline in gecuratteerde vanillepeulen', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6696495/', 'literatuur', '2026-11-14'::DATE, NULL),
  ('bh2022', 'BarthHaas Hop Harvest Guide 2022', 'https://www.barthhaas.com/fileadmin/user_upload/01-barthhaas-2022/Downloads/Reports_Broschures/Hop_Harvest_Guide/English/BarthHaas_Hop_Harvest_Guide_2022.pdf', 'producentgids (hopolie)', '2026-11-14'::DATE, NULL),
  ('bh2021', 'BarthHaas Hop Harvest Guide 2021', NULL, 'producentgids (hopolie)', '2026-11-14'::DATE, 'URL aanvullen'),
  ('hga', 'Hop Growers of America – Variety Manual (update maart 2011)', 'https://static1.squarespace.com/static/54130deae4b00794c96d9ac7/t/541461afe4b0c99c6b1d2d40/1410621871282/HGA+Variety+Manual+-+English+(updated+March+2011).pdf', 'telersgids (hopolie)', '2026-11-14'::DATE, 'geen linalool/geraniol'),
  ('faram', 'Charles Faram – rassenfiches', NULL, 'handelaar (hopolie)', '2026-11-14'::DATE, 'geen linalool; URL aanvullen'),
  ('hopsconnect', 'Hops Connect – rassenfiches (PDF)', NULL, 'handelaar (hopolie)', '2026-11-14'::DATE, 'geen linalool; URL aanvullen'),
  ('fm_wb06', 'Fermentis – SafAle WB-06 productpagina', 'https://fermentis.com/en/product/safale-wb-06/', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('fm_t58', 'Fermentis – SafAle T-58 specificatieblad', 'https://rahrbsg.ca/wp-content/uploads/2021/12/SPEC-Fermentis-SafAle-T-58-030118.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('fm_be134', 'Fermentis – SafAle BE-134 specificatieblad', 'https://rahrbsg.ca/wp-content/uploads/2021/12/SPEC-Fermentis-SafAle-BE-134-030118.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('fm_range', 'Fermentis – Masterfile brewing range 2023', 'https://www.castlemalting.com/Certificates/Masterfile_Gamme_Brewing_Fermentis_2023.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_wit', 'Lallemand – LalBrew Wit TDS', 'https://cdn.shopify.com/s/files/1/0323/8825/1780/files/Wit_TDS_ENG_Print_A4_LalBrew.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_abbaye', 'Lallemand – LalBrew Abbaye TDS', 'https://cdn.shopify.com/s/files/1/0323/8825/1780/files/Abbaye_TDS_ENG_Print_A4_LalBrew.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_farmhouse', 'Lallemand – LalBrew Farmhouse TDS', 'https://cdn.shopify.com/s/files/1/0323/8825/1780/files/Farmhouse_TDS_ENGPrint_A4_LalBrew.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_belle', 'Lallemand – LalBrew Belle Saison TDS', 'https://files.scottlab.com/uploads/BELLE%20SAISON%20TDS.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_munich', 'Lallemand – LalBrew Munich Classic TDS', 'https://files.scottlab.com/uploads/MUNICH%20TDS.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_nott', 'Lallemand – LalBrew Nottingham TDS', 'https://cdn.shopify.com/s/files/1/0323/8825/1780/files/Nottingham_TDS_ENG_Print_A4_LalBrew.pdf', 'producent (datasheet)', '2026-11-14'::DATE, NULL),
  ('ll_bifold', 'Lallemand – LalBrew brewing yeast range (bifold, aug. 2020)', 'https://doemens.org/uploads/2021/02/bifold_lps_lalbrew_eng_a3_aug2020.pdf', 'producent (overzicht)', '2026-11-14'::DATE, NULL),
  ('own', 'BrewBindr – eigen inschatting (ter review)', NULL, 'eigen inschatting', '2026-11-14'::DATE, 'geen meetwaarden; intensiteit afgeleid uit de omschrijving'),
  ('rogner2021', 'Rögner N.S., Mall V., Steinhaus M. (2021) Eur Food Res Technol 247:1263–1275 – odoranten in vloeibare moutextracten', 'https://link.springer.com/article/10.1007/s00217-021-03707-z', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'moutextracten: maltol hoger bij donker, HDMF bij licht'),
  ('fickert1998', 'Fickert B. & Schieberle P. (1998) Nahrung 42(6):371–375 – sleutelodoranten in karamelmout (caramalt)', 'https://doi.org/10.1002/(sici)1521-3803(199812)42:06<371::aid-food371>3.0.co;2-v', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, NULL),
  ('fechir2021', 'Féchir M. et al. (2021) J. Agric. Food Chem. 69(29):8190–8199 – bijdrage van speciale moutsoorten aan het aroma van lager', 'https://doi.org/10.1021/acs.jafc.1c01846', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'karamelmout: damascenon, 2-acetyl-1-pyrroline, pyrazine, HDMF; gebrande mout: guaiacol'),
  ('kumar2023', 'Kumar A. et al. (2023) Foods 12(5):1064 – invloed van giststam op hoparoma en vluchtige stoffen (o.a. US-05, BE-256, WB-06)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10000826/', 'literatuur (meting, relatief)', '2026-11-14'::DATE, 'WB-06: significant meer 4-VG en ethylhexanoaat; US-05, BE-256: sporen 4-VG'),
  ('roberts2023', 'Roberts R. et al. (2023) J. Mass Spectrom. 58(10):e4959 – esters en hogere alcoholen tijdens de vergisting (US-05, WB-06)', 'https://openpub.fmach.it/retrieve/c283e271-ec27-4b8c-bc1b-6a8dd17add17/2023%20JMS%20Biasioli.pdf', 'literatuur (meting)', '2026-11-14'::DATE, 'ethylhexanoaat einde vergisting: WB-06 77 ppbv, US-05 45 ppbv'),
  ('nabney1972', 'Nabney J. & Robinson F.V. (1972) Flavour Industry 3:50–51 – pimentbesolie', 'https://scent.vn/en/pages/oil/pimento-allspice-1-602', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('chemworld2016', 'Chemistry World (2016) – Secret of liquorice''s unique smell unravelled', 'https://chemistryworld.com/news/secret-of-liquorices-unique-smell-unravelled/2500020.article', 'vakpers', '2026-11-14'::DATE, 'noemt anethol, estragol, eugenol, cineol'),
  ('wagner2016', 'Wagner J., Granvogl M., Schieberle P. (2016) J. Agric. Food Chem. 64(44):8388–8396 – sleutelaromastoffen in zoethout', 'https://doi.org/10.1021/acs.jafc.6b03676', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'geen percentages; FD-factoren en OAV'),
  ('jorgensen2000', 'Jørgensen U. et al. (2000) J. Agric. Food Chem. 48(6):2376–2383 – aromastoffen in vlierbloesemdrank', 'https://doi.org/10.1021/jf000005f', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'geen concentraties in de samenvatting'),
  ('orav1998', 'Orav A., Kailas T., Koel M. (1998) Journal of Essential Oil Research 10:387–393 – naaldolie Picea abies (Estland)', 'https://scent.vn/en/pages/oil/picea-abies-estonia-fir-needle-2905', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'naalden, geen jonge scheuten'),
  ('haro1985', 'Haro L. & Faas W.E. (1985) Perfumer & Flavorist 10:67–72 – Key- en Perzische limoenolie (koudgeperst)', 'https://scent.vn/en/pages/oil/lime-persian-1-390', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('moreuil1973', 'Moreuil C. & Huet R. (1973) Fruits 28:703–708 – combava (Madagaskar), bladolie', 'https://scent.vn/en/pages/oil/swangi-citrus-hystrix-leaf-madagascar-1795', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, NULL),
  ('njoroge1994', 'Njoroge S.M. et al. (1994) Flavour and Fragrance Journal 9:159–166 – vluchtige componenten van Japanse yuzu- en citroenolie', 'https://scent.vn/en/pages/oil/yuzu-japan-3-1672', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'scent.vn geeft ook JAFC 44:550–556 (1996)'),
  ('loziene2023', 'Ložienė K. et al. (2023) Plants 12(5):1050 – essentiële olie van Myrica gale (Litouwen)', 'https://mdpi.com/2223-7747/12/5/1050', 'literatuur (oliesamenstelling)', '2026-11-14'::DATE, 'tabelwaarden niet uitgelezen'),
  ('frauendorfer2006', 'Frauendorfer F. & Schieberle P. (2006) J. Agric. Food Chem. 54(15):5521–5529 – sleutelaromastoffen in cacaopoeder', 'https://doi.org/10.1021/jf060728k', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'cacaopoeder, geen nibs'),
  ('grosch_coffee', 'Grosch W.; Blank I. et al. – sleutelaromastoffen van gebrande koffie (samengevat door Coffee Research Institute)', 'https://coffeeresearch.org/science/aromamain.htm', 'secundaire bron (aroma-analyse)', '2026-11-14'::DATE, 'originele publicaties aanvullen'),
  ('azcarate2010', 'Azcarate C. & Barringer S.A. (2010) Journal of Food Science – vluchtige stoffen in jalapeño (SIFT-MS)', 'https://pubmed.ncbi.nlm.nih.gov/21535582/', 'literatuur (aroma-analyse)', '2026-11-14'::DATE, 'volume/pagina''s aanvullen')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, type = EXCLUDED.type, accessed_on = EXCLUDED.accessed_on, note = EXCLUDED.note;

INSERT INTO flavour_ingredients (id, category, name_nl, name_fr, name_en, aliases, dose_min_g_per_l, dose_max_g_per_l, preferred_stage, form, yeast_pof, notes_nl, notes_fr, notes_en) VALUES
  ('coriander', 'spice', 'Koriander', 'Coriandre', 'Coriander', ARRAY['coriander', 'coriander seed', 'coriandre', 'koriander', 'korianderzaad', 'koriandre']::TEXT[], 0.3, 1.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('orange_sweet', 'spice', 'Zoete sinaasappelschil', 'Écorce d''orange douce', 'Sweet orange peel', ARRAY['orange peel', 'orange zest', 'sinaasappelschil', 'sinaasappelzeste', 'sweet orange peel', 'écorce d''orange douce']::TEXT[], 0.5, 2, 'boil_short', 'zest', NULL, NULL, NULL, NULL),
  ('orange_bitter', 'spice', 'Bittere sinaasappelschil (curaçao)', 'Écorce d''orange amère (curaçao)', 'Bitter orange peel (curaçao)', ARRAY['bitter orange', 'bitter orange peel', 'curacao', 'curaçao', 'pomerans', 'écorce d''orange amère']::TEXT[], 0.3, 1.5, 'boil_short', 'zest', NULL, NULL, NULL, NULL),
  ('lemon', 'spice', 'Citroenschil', 'Zeste de citron', 'Lemon peel', ARRAY['citroen', 'lemon peel', 'lemon zest', 'zeste de citron']::TEXT[], 0.5, 2, 'boil_short', 'zest', NULL, 'Alleen de gele schil, zonder het witte vlies.', 'Uniquement le zeste jaune, sans la peau blanche.', 'Yellow zest only, without the white pith.'),
  ('grapefruit', 'spice', 'Grapefruitschil', 'Zeste de pamplemousse', 'Grapefruit peel', ARRAY['grapefruit', 'grapefruit peel', 'zeste de pamplemousse']::TEXT[], 0.5, 2, 'boil_short', 'zest', NULL, 'Alleen de schil, zonder het witte vlies.', 'Uniquement le zeste, sans la peau blanche.', 'Zest only, without the white pith.'),
  ('ginger', 'spice', 'Gember', 'Gingembre', 'Ginger', ARRAY['gember', 'gingembre', 'ginger']::TEXT[], 0.5, 3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('cardamom', 'spice', 'Kardemom', 'Cardamome', 'Cardamom', ARRAY['cardamom', 'cardamome']::TEXT[], 0.05, 0.3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('cinnamon', 'spice', 'Kaneel', 'Cannelle', 'Cinnamon', ARRAY['cannelle', 'Ceylon kaneel', 'cinnamon']::TEXT[], 0.1, 0.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('clove', 'spice', 'Kruidnagel', 'Clou de girofle', 'Clove', ARRAY['clou de girofle', 'clove']::TEXT[], 0.02, 0.1, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('star_anise', 'spice', 'Steranijs', 'Badiane (anis étoilé)', 'Star anise', ARRAY['anis étoilé', 'badiane', 'star anise']::TEXT[], 0.05, 0.3, 'boil_short', 'whole', NULL, 'Alleen Chinese steranijs (Illicium verum); Japanse steranijs is giftig.', 'Uniquement la badiane de Chine (Illicium verum) ; la badiane du Japon est toxique.', 'Only Chinese star anise (Illicium verum); Japanese star anise is poisonous.'),
  ('aniseed', 'spice', 'Anijszaad', 'Anis vert', 'Aniseed', ARRAY['anis vert', 'aniseed']::TEXT[], 0.1, 0.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('fennel', 'spice', 'Venkelzaad', 'Graines de fenouil', 'Fennel seed', ARRAY['fennel seed', 'graines de fenouil']::TEXT[], 0.1, 0.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('cumin', 'spice', 'Komijn', 'Cumin', 'Cumin', ARRAY['cumin', 'komijnzaad']::TEXT[], 0.05, 0.3, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('black_pepper', 'spice', 'Zwarte peper', 'Poivre noir', 'Black pepper', ARRAY['black pepper', 'poivre noir']::TEXT[], 0.05, 0.3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('pink_pepper', 'spice', 'Roze peper', 'Baies roses', 'Pink peppercorn', ARRAY['baies roses', 'pink peppercorn', 'Schinus']::TEXT[], 0.1, 0.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('grains_of_paradise', 'spice', 'Paradijskorrels', 'Maniguette', 'Grains of paradise', ARRAY['Aframomum melegueta', 'grains of paradise', 'maniguette']::TEXT[], 0.05, 0.3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('juniper', 'spice', 'Jeneverbes', 'Baies de genièvre', 'Juniper berries', ARRAY['baies de genièvre', 'juniper berry']::TEXT[], 0.5, 3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('lavender', 'spice', 'Lavendel', 'Lavande', 'Lavender', ARRAY['lavande', 'lavender']::TEXT[], 0.05, 0.3, 'whirlpool', 'whole', NULL, NULL, NULL, NULL),
  ('chamomile', 'spice', 'Kamille', 'Camomille', 'Chamomile', ARRAY['camomille', 'chamomile', 'Matricaria']::TEXT[], 0.5, 2, 'whirlpool', 'whole', NULL, NULL, NULL, NULL),
  ('lemongrass', 'spice', 'Citroengras', 'Citronnelle', 'Lemongrass', ARRAY['citronnelle', 'lemongrass']::TEXT[], 0.5, 2, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('bay_leaf', 'spice', 'Laurier', 'Laurier', 'Bay leaf', ARRAY['bay leaf', 'laurier']::TEXT[], 0.05, 0.2, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('rosemary', 'spice', 'Rozemarijn', 'Romarin', 'Rosemary', ARRAY['romarin', 'rosemary']::TEXT[], 0.1, 0.5, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('sage', 'spice', 'Salie', 'Sauge', 'Sage', ARRAY['sage', 'sauge']::TEXT[], 0.1, 0.5, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('thyme', 'spice', 'Tijm', 'Thym', 'Thyme', ARRAY['thym', 'thyme']::TEXT[], 0.1, 0.5, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('peppermint', 'spice', 'Munt (pepermunt)', 'Menthe poivrée', 'Peppermint', ARRAY['menthe', 'menthe poivrée', 'mint', 'munt', 'peppermint']::TEXT[], 0.2, 1, 'whirlpool', 'whole', NULL, 'In bier met munt gelden maxima voor pulegon en menthofuran (EU 1334/2008); bij een normale dosis blijf je ruim onder.', 'Les boissons alcoolisées à la menthe ont des teneurs maximales en pulégone et menthofurane (UE 1334/2008) ; à dose normale, on reste bien en dessous.', 'Alcoholic drinks with mint have maximum levels of pulegone and menthofuran (EU 1334/2008); a normal dose stays well below them.'),
  ('turmeric', 'spice', 'Kurkuma', 'Curcuma', 'Turmeric', ARRAY['curcuma', 'geelwortel', 'turmeric']::TEXT[], 0.1, 0.5, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('nutmeg', 'spice', 'Nootmuskaat', 'Muscade', 'Nutmeg', ARRAY['muscade', 'nutmeg']::TEXT[], 0.02, 0.1, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('mace', 'spice', 'Foelie', 'Macis', 'Mace', ARRAY['mace', 'macis']::TEXT[], 0.02, 0.1, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('rose', 'spice', 'Roos (gedroogde blaadjes)', 'Pétales de rose', 'Rose petals', ARRAY['pétales de rose', 'rose petals']::TEXT[], 0.2, 1, 'whirlpool', 'whole', NULL, NULL, NULL, NULL),
  ('vanilla', 'spice', 'Vanille', 'Vanille', 'Vanilla', ARRAY['gousse de vanille', 'vanilla bean', 'vanille', 'vanillestokje']::TEXT[], 0.1, 0.5, 'secondary', 'whole', NULL, 'Opengesneden peul in de lagering, één tot twee weken.', 'Gousse fendue en garde, une à deux semaines.', 'Split pod in conditioning, one to two weeks.'),
  ('ariana', 'hop', 'Ariana', 'Ariana', 'Ariana', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('callista', 'hop', 'Callista', 'Callista', 'Callista', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('comet', 'hop', 'Comet', 'Comet', 'Comet', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hallertau_blanc', 'hop', 'Hallertau Blanc', 'Hallertau Blanc', 'Hallertau Blanc', ARRAY['Hallertauer Blanc']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hallertau_magnum', 'hop', 'Hallertauer Magnum', 'Hallertauer Magnum', 'Hallertauer Magnum', ARRAY['HMG', 'Magnum']::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hallertau_mittelfrueh', 'hop', 'Hallertau Mittelfrüh', 'Hallertau Mittelfrüh', 'Hallertau Mittelfrüh', ARRAY['Hallertau Mittelfrueh', 'Hallertauer', 'Hallertauer MF', 'Hallertauer Mittelfrüh', 'HMF']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hallertau_tradition', 'hop', 'Hallertauer Tradition', 'Hallertauer Tradition', 'Hallertauer Tradition', ARRAY['HTR', 'Tradition']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('herkules', 'hop', 'Herkules', 'Herkules', 'Herkules', ARRAY['Hercules', 'HKS']::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('huell_melon', 'hop', 'Huell Melon', 'Huell Melon', 'Huell Melon', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mandarina_bavaria', 'hop', 'Mandarina Bavaria', 'Mandarina Bavaria', 'Mandarina Bavaria', ARRAY['Mandarina']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('perle', 'hop', 'Perle', 'Perle', 'Perle', ARRAY['Hallertauer Perle']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('spalter_select', 'hop', 'Spalter Select', 'Spalter Select', 'Spalter Select', ARRAY['Select']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tango', 'hop', 'Tango', 'Tango', 'Tango', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tettnanger', 'hop', 'Tettnanger', 'Tettnanger', 'Tettnanger', ARRAY['Tettnang', 'Tettnanger Tettnanger']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('titan', 'hop', 'Titan', 'Titan', 'Titan', '{}'::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('aurora', 'hop', 'Aurora', 'Aurora', 'Aurora', ARRAY['Styrian Aurora', 'Super Styrian']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('celeia', 'hop', 'Celeia', 'Celeia', 'Celeia', ARRAY['Styrian Celeia']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('saaz', 'hop', 'Saaz', 'Saaz', 'Saaz', ARRAY['Saazer', 'Zatec', 'Žatec', 'Žatecký poloraný červeňák']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cascade', 'hop', 'Cascade', 'Cascade', 'Cascade', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('centennial', 'hop', 'Centennial', 'Centennial', 'Centennial', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('chinook', 'hop', 'Chinook', 'Chinook', 'Chinook', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('citra', 'hop', 'Citra', 'Citra', 'Citra', ARRAY['HBC 394']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('columbus', 'hop', 'Columbus', 'Columbus', 'Columbus', ARRAY['CTZ', 'Tomahawk', 'Zeus']::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ekuanot', 'hop', 'Ekuanot', 'Ekuanot', 'Ekuanot', ARRAY['Equinox', 'HBC 366']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mosaic', 'hop', 'Mosaic', 'Mosaic', 'Mosaic', ARRAY['HBC 369']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sabro', 'hop', 'Sabro', 'Sabro', 'Sabro', ARRAY['HBC 438']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('talus', 'hop', 'Talus', 'Talus', 'Talus', ARRAY['HBC 692']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('eclipse', 'hop', 'Eclipse', 'Eclipse', 'Eclipse', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ella', 'hop', 'Ella', 'Ella', 'Ella', ARRAY['Stella']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('enigma', 'hop', 'Enigma', 'Enigma', 'Enigma', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('galaxy', 'hop', 'Galaxy', 'Galaxy', 'Galaxy', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('topaz', 'hop', 'Topaz', 'Topaz', 'Topaz', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('vic_secret', 'hop', 'Vic Secret', 'Vic Secret', 'Vic Secret', '{}'::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('loral', 'hop', 'Loral', 'Loral', 'Loral', ARRAY['HBC 291']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('simcoe', 'hop', 'Simcoe', 'Simcoe', 'Simcoe', ARRAY['YCR 14']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('amarillo', 'hop', 'Amarillo', 'Amarillo', 'Amarillo', ARRAY['VGXP01']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('willamette', 'hop', 'Willamette', 'Willamette', 'Willamette', '{}'::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('northern_brewer', 'hop', 'Northern Brewer (US)', 'Northern Brewer (US)', 'Northern Brewer (US)', ARRAY['Northern Brewer']::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mt_hood', 'hop', 'Mt. Hood', 'Mt. Hood', 'Mt. Hood', ARRAY['Mount Hood']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('crystal', 'hop', 'Crystal', 'Crystal', 'Crystal', '{}'::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ekg', 'hop', 'East Kent Goldings', 'East Kent Goldings', 'East Kent Goldings', ARRAY['EKG', 'Goldings', 'Kent Golding']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fuggle', 'hop', 'Fuggle', 'Fuggle', 'Fuggle', ARRAY['Fuggles']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('savinjski_golding', 'hop', 'Savinjski Golding', 'Savinjski Golding', 'Savinjski Golding', ARRAY['Styrian Golding', 'Styrian Goldings']::TEXT[], 0.5, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  ('challenger', 'hop', 'Challenger', 'Challenger', 'Challenger', '{}'::TEXT[], 0.3, 1.5, NULL, NULL, NULL, NULL, NULL, NULL),
  ('nelson_sauvin', 'hop', 'Nelson Sauvin', 'Nelson Sauvin', 'Nelson Sauvin', ARRAY['Nelson']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('motueka', 'hop', 'Motueka', 'Motueka', 'Motueka', ARRAY['B Saaz']::TEXT[], 2, 6, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wb06', 'yeast', 'SafAle WB-06', 'SafAle WB-06', 'SafAle WB-06', ARRAY['Fermentis WB06', 'WB-06']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('t58', 'yeast', 'SafAle T-58', 'SafAle T-58', 'SafAle T-58', ARRAY['Fermentis T58', 'T-58']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('be134', 'yeast', 'SafAle BE-134', 'SafAle BE-134', 'SafAle BE-134', ARRAY['BE-134']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('lb_wit', 'yeast', 'LalBrew Wit', 'LalBrew Wit', 'LalBrew Wit', ARRAY['Belgian Wit', 'Lallemand Wit', 'wit']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('lb_abbaye', 'yeast', 'LalBrew Abbaye', 'LalBrew Abbaye', 'LalBrew Abbaye', ARRAY['Lallemand Abbaye']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('lb_farmhouse', 'yeast', 'LalBrew Farmhouse', 'LalBrew Farmhouse', 'LalBrew Farmhouse', ARRAY['Lallemand Farmhouse']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('lb_belle', 'yeast', 'LalBrew Belle Saison', 'LalBrew Belle Saison', 'LalBrew Belle Saison', ARRAY['Belle Saison']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('lb_munich', 'yeast', 'LalBrew Munich Classic', 'LalBrew Munich Classic', 'LalBrew Munich Classic', ARRAY['Munich Classic']::TEXT[], NULL, NULL, NULL, NULL, true, NULL, NULL, NULL),
  ('us05', 'yeast', 'SafAle US-05', 'SafAle US-05', 'SafAle US-05', ARRAY['Fermentis US05', 'US-05']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_nottingham', 'yeast', 'LalBrew Nottingham', 'LalBrew Nottingham', 'LalBrew Nottingham', ARRAY['Nottingham']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_bry97', 'yeast', 'LalBrew BRY-97', 'LalBrew BRY-97', 'LalBrew BRY-97', ARRAY['BRY-97', 'West Coast']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_diamond', 'yeast', 'LalBrew Diamond', 'LalBrew Diamond', 'LalBrew Diamond', ARRAY['Diamond Lager']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_verdant', 'yeast', 'LalBrew Verdant IPA', 'LalBrew Verdant IPA', 'LalBrew Verdant IPA', ARRAY['Verdant']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_ne', 'yeast', 'LalBrew New England', 'LalBrew New England', 'LalBrew New England', ARRAY['New England']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_voss', 'yeast', 'LalBrew Voss Kveik', 'LalBrew Voss Kveik', 'LalBrew Voss Kveik', ARRAY['Voss', 'Voss Kveik']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_london', 'yeast', 'LalBrew London', 'LalBrew London', 'LalBrew London', ARRAY['London ESB']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_windsor', 'yeast', 'LalBrew Windsor', 'LalBrew Windsor', 'LalBrew Windsor', ARRAY['Windsor']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('lb_koln', 'yeast', 'LalBrew Köln', 'LalBrew Köln', 'LalBrew Köln', ARRAY['Kolsch', 'Köln', 'Kölsch']::TEXT[], NULL, NULL, NULL, NULL, false, NULL, NULL, NULL),
  ('malt_pils', 'malt', 'Pilsmout', 'Malt pils', 'Pilsner malt', ARRAY['malt pils', 'pils', 'pils malt', 'pilsener malt', 'pilsner', 'pilsner malt']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_pale', 'malt', 'Pale ale-mout', 'Malt pale ale', 'Pale ale malt', ARRAY['golden promise', 'malt pale', 'maris otter', 'pale ale', 'pale ale malt', 'pale malt']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_vienna', 'malt', 'Weense mout', 'Malt de Vienne', 'Vienna malt', ARRAY['malt de Vienne', 'vienna', 'Vienna malt', 'weense mout']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_munich', 'malt', 'Münchener mout', 'Malt munich', 'Munich malt', ARRAY['malt munich', 'munchener', 'munich', 'munich dark', 'munich light', 'Munich malt']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_wheat', 'malt', 'Tarwemout', 'Malt de blé', 'Wheat malt', ARRAY['malt de blé', 'tarwe', 'weizenmalz', 'wheat', 'wheat malt', 'wheat malt light']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_biscuit', 'malt', 'Biscuit-/amberkleurige mout', 'Malt biscuit / ambré', 'Biscuit / amber malt', ARRAY['amber', 'amber malt', 'aromatic', 'biscuit', 'biscuit malt', 'malt ambré', 'melanoidin']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_crystal', 'malt', 'Karamelmout (crystal)', 'Malt caramel (crystal)', 'Crystal / caramel malt', ARRAY['cara', 'carahell', 'caramalt', 'caramel', 'caramel malt', 'CaraMunich', 'caramunich', 'caravienne', 'crystal', 'crystal malt', 'malt caramel', 'special b']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_chocolate', 'malt', 'Chocolademout', 'Malt chocolat', 'Chocolate malt', ARRAY['chocolade', 'chocolate', 'chocolate malt', 'malt chocolat']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_roasted_barley', 'malt', 'Gebrande gerst', 'Orge torréfiée', 'Roasted barley', ARRAY['gebrande gerst', 'orge torréfiée', 'roasted barley']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('malt_black', 'malt', 'Zwarte mout', 'Malt noir', 'Black malt', ARRAY['black malt', 'black patent', 'carafa', 'malt noir']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('allspice', 'spice', 'Piment', 'Piment de la Jamaïque', 'Allspice', ARRAY['allspice', 'jamaicapeper', 'piment de la Jamaïque']::TEXT[], 0.05, 0.3, 'boil_short', 'crushed', NULL, NULL, NULL, NULL),
  ('licorice', 'spice', 'Zoethoutwortel', 'Racine de réglisse', 'Liquorice root', ARRAY['Glycyrrhiza', 'licorice', 'liquorice root', 'réglisse']::TEXT[], 0.2, 1, 'boil_long', 'whole', NULL, 'Vanaf 100 mg/L glycyrrhizine moet "bevat zoethout" op het etiket (EU 1169/2011).', 'À partir de 100 mg/L de glycyrrhizine, l''étiquette doit mentionner « contient de la réglisse » (UE 1169/2011).', 'From 100 mg/L glycyrrhizin the label must say "contains liquorice" (EU 1169/2011).'),
  ('elderflower', 'spice', 'Vlierbloesem', 'Fleur de sureau', 'Elderflower', ARRAY['elderflower', 'fleur de sureau', 'Sambucus nigra']::TEXT[], 0.5, 2, 'whirlpool', 'whole', NULL, NULL, NULL, NULL),
  ('spruce', 'spice', 'Sparrentoppen', 'Bourgeons d''épicéa', 'Spruce tips', ARRAY['bourgeons d''épicéa', 'Picea abies', 'spruce', 'spruce tips']::TEXT[], 2, 8, 'boil_short', 'whole', NULL, NULL, NULL, NULL),
  ('lime', 'spice', 'Limoenschil', 'Zeste de citron vert', 'Lime peel', ARRAY['lime zest', 'Persian lime', 'zeste de citron vert']::TEXT[], 0.5, 2, 'boil_short', 'zest', NULL, 'Alleen de groene schil, zonder het witte vlies.', 'Uniquement le zeste vert, sans la peau blanche.', 'Green zest only, without the white pith.'),
  ('kaffir_lime', 'spice', 'Kaffirlimoenblad', 'Feuille de combava', 'Kaffir lime leaf', ARRAY['Citrus hystrix', 'combava', 'kaffir lime leaf', 'makrut']::TEXT[], 0.1, 0.5, 'whirlpool', 'whole', NULL, NULL, NULL, NULL),
  ('yuzu', 'spice', 'Yuzuschil', 'Zeste de yuzu', 'Yuzu peel', ARRAY['Citrus junos', 'yuzu', 'yuzu zest']::TEXT[], 0.3, 1.5, 'boil_short', 'zest', NULL, NULL, NULL, NULL),
  ('sweet_gale', 'spice', 'Wilde gagel', 'Piment royal (myrique)', 'Sweet gale', ARRAY['bog myrtle', 'gagel', 'Myrica gale', 'piment royal', 'sweet gale']::TEXT[], 0.5, 2, 'boil_long', 'whole', NULL, NULL, NULL, NULL),
  ('cacao_nibs', 'spice', 'Cacaonibs', 'Éclats de fèves de cacao', 'Cacao nibs', ARRAY['cacao', 'cacao nibs', 'cocoa', 'cocoa nibs', 'éclats de fèves de cacao']::TEXT[], 3, 10, 'secondary', 'whole', NULL, NULL, NULL, NULL),
  ('coffee', 'spice', 'Koffie (bonen)', 'Café (grains)', 'Coffee beans', ARRAY['café', 'coffee', 'coffee beans', 'cold brew', 'koffie']::TEXT[], 1, 5, 'secondary', 'crushed', NULL, NULL, NULL, NULL),
  ('jalapeno', 'spice', 'Jalapeño', 'Jalapeño', 'Jalapeño', ARRAY['chili', 'jalapeño', 'piment jalapeño']::TEXT[], 2, 10, 'secondary', 'whole', NULL, 'Flavour Lab rekent alleen met het aroma, niet met hoe pikant het is.', 'Flavour Lab ne tient compte que de l''arôme, pas du piquant.', 'Flavour Lab counts the aroma only, not the heat.')
ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, name_nl = EXCLUDED.name_nl, name_fr = EXCLUDED.name_fr, name_en = EXCLUDED.name_en, aliases = EXCLUDED.aliases, dose_min_g_per_l = EXCLUDED.dose_min_g_per_l, dose_max_g_per_l = EXCLUDED.dose_max_g_per_l, preferred_stage = EXCLUDED.preferred_stage, form = EXCLUDED.form, yeast_pof = EXCLUDED.yeast_pof, notes_nl = EXCLUDED.notes_nl, notes_fr = EXCLUDED.notes_fr, notes_en = EXCLUDED.notes_en;

DELETE FROM flavour_ingredient_compounds l WHERE NOT EXISTS (SELECT 1 FROM (VALUES
  ('coriander', 'linalool'),
  ('coriander', 'gamma_terpinene'),
  ('coriander', 'camphor'),
  ('coriander', 'alpha_pinene'),
  ('coriander', 'geranyl_acetate'),
  ('coriander', 'limonene'),
  ('coriander', 'geraniol'),
  ('orange_sweet', 'limonene'),
  ('orange_sweet', 'myrcene'),
  ('orange_sweet', 'linalool'),
  ('orange_bitter', 'limonene'),
  ('orange_bitter', 'myrcene'),
  ('orange_bitter', 'linalool'),
  ('lemon', 'limonene'),
  ('lemon', 'beta_pinene'),
  ('lemon', 'gamma_terpinene'),
  ('lemon', 'alpha_pinene'),
  ('lemon', 'citral'),
  ('lemon', 'sabinene'),
  ('lemon', 'myrcene'),
  ('grapefruit', 'limonene'),
  ('grapefruit', 'myrcene'),
  ('grapefruit', 'nootkatone'),
  ('ginger', 'zingiberene'),
  ('ginger', 'sesquiphellandrene'),
  ('ginger', 'camphene'),
  ('ginger', 'ar_curcumene'),
  ('ginger', 'beta_phellandrene'),
  ('ginger', 'limonene'),
  ('ginger', 'alpha_pinene'),
  ('ginger', 'citronellol'),
  ('cardamom', 'terpinyl_acetate'),
  ('cardamom', 'cineole'),
  ('cardamom', 'linalyl_acetate'),
  ('cardamom', 'sabinene'),
  ('cardamom', 'linalool'),
  ('cardamom', 'limonene'),
  ('cardamom', 'myrcene'),
  ('cardamom', 'alpha_pinene'),
  ('cinnamon', 'cinnamaldehyde'),
  ('cinnamon', 'caryophyllene'),
  ('cinnamon', 'eugenol'),
  ('cinnamon', 'limonene'),
  ('cinnamon', 'linalool'),
  ('clove', 'eugenol'),
  ('clove', 'caryophyllene'),
  ('clove', 'humulene'),
  ('star_anise', 'anethole'),
  ('star_anise', 'linalool'),
  ('aniseed', 'anethole'),
  ('aniseed', 'estragole'),
  ('fennel', 'anethole'),
  ('fennel', 'estragole'),
  ('fennel', 'fenchone'),
  ('fennel', 'limonene'),
  ('cumin', 'menthadienal'),
  ('cumin', 'cuminaldehyde'),
  ('cumin', 'beta_pinene'),
  ('cumin', 'gamma_terpinene'),
  ('black_pepper', 'sabinene'),
  ('black_pepper', 'alpha_pinene'),
  ('black_pepper', 'limonene'),
  ('black_pepper', 'delta3_carene'),
  ('black_pepper', 'caryophyllene'),
  ('black_pepper', 'humulene'),
  ('pink_pepper', 'myrcene'),
  ('pink_pepper', 'p_cymene'),
  ('pink_pepper', 'alpha_phellandrene'),
  ('pink_pepper', 'limonene'),
  ('pink_pepper', 'beta_phellandrene'),
  ('pink_pepper', 'alpha_pinene'),
  ('pink_pepper', 'humulene'),
  ('grains_of_paradise', 'humulene'),
  ('grains_of_paradise', 'caryophyllene_oxide'),
  ('grains_of_paradise', 'caryophyllene'),
  ('grains_of_paradise', 'linalool'),
  ('juniper', 'alpha_pinene'),
  ('juniper', 'myrcene'),
  ('juniper', 'terpinen4ol'),
  ('juniper', 'limonene'),
  ('juniper', 'terpinolene'),
  ('juniper', 'citronellal'),
  ('lavender', 'linalool'),
  ('lavender', 'linalyl_acetate'),
  ('lavender', 'terpinen4ol'),
  ('lavender', 'cineole'),
  ('lavender', 'camphor'),
  ('lavender', 'caryophyllene'),
  ('lavender', 'limonene'),
  ('chamomile', 'bisabolol_oxides'),
  ('chamomile', 'chamazulene'),
  ('chamomile', 'farnesene'),
  ('lemongrass', 'citral'),
  ('lemongrass', 'farnesol'),
  ('lemongrass', 'geraniol'),
  ('bay_leaf', 'cineole'),
  ('bay_leaf', 'terpinyl_acetate'),
  ('bay_leaf', 'sabinene'),
  ('bay_leaf', 'alpha_pinene'),
  ('bay_leaf', 'methyl_eugenol'),
  ('bay_leaf', 'linalool'),
  ('bay_leaf', 'eugenol'),
  ('rosemary', 'alpha_pinene'),
  ('rosemary', 'camphor'),
  ('rosemary', 'beta_pinene'),
  ('sage', 'camphor'),
  ('sage', 'cineole'),
  ('sage', 'camphene'),
  ('thyme', 'thymol'),
  ('thyme', 'p_cymene'),
  ('thyme', 'gamma_terpinene'),
  ('thyme', 'caryophyllene'),
  ('thyme', 'linalool'),
  ('thyme', 'cineole'),
  ('thyme', 'myrcene'),
  ('peppermint', 'menthol'),
  ('peppermint', 'menthone'),
  ('peppermint', 'menthyl_acetate'),
  ('peppermint', 'cineole'),
  ('peppermint', 'limonene'),
  ('turmeric', 'turmerones'),
  ('turmeric', 'alpha_phellandrene'),
  ('turmeric', 'caryophyllene'),
  ('turmeric', 'ar_curcumene'),
  ('turmeric', 'farnesene'),
  ('nutmeg', 'sabinene'),
  ('nutmeg', 'alpha_pinene'),
  ('nutmeg', 'beta_pinene'),
  ('nutmeg', 'terpinen4ol'),
  ('nutmeg', 'limonene'),
  ('nutmeg', 'cineole'),
  ('nutmeg', 'gamma_terpinene'),
  ('nutmeg', 'myrcene'),
  ('mace', 'alpha_pinene'),
  ('mace', 'sabinene'),
  ('mace', 'beta_pinene'),
  ('mace', 'myrcene'),
  ('mace', 'limonene'),
  ('mace', 'terpinen4ol'),
  ('mace', 'myristicin'),
  ('rose', 'citronellol'),
  ('rose', 'geraniol'),
  ('rose', 'nerol'),
  ('rose', 'linalool'),
  ('rose', 'phenylethanol'),
  ('rose', 'methyl_eugenol'),
  ('rose', 'eugenol'),
  ('vanilla', 'vanillin'),
  ('ariana', 'myrcene'),
  ('ariana', 'humulene'),
  ('ariana', 'caryophyllene'),
  ('ariana', 'linalool'),
  ('ariana', 'geraniol'),
  ('ariana', 'hop_isobutyrates'),
  ('callista', 'myrcene'),
  ('callista', 'humulene'),
  ('callista', 'caryophyllene'),
  ('callista', 'linalool'),
  ('callista', 'hop_isobutyrates'),
  ('comet', 'myrcene'),
  ('comet', 'humulene'),
  ('comet', 'caryophyllene'),
  ('comet', 'linalool'),
  ('comet', 'geraniol'),
  ('comet', 'hop_isobutyrates'),
  ('hallertau_blanc', 'myrcene'),
  ('hallertau_blanc', 'humulene'),
  ('hallertau_blanc', 'caryophyllene'),
  ('hallertau_blanc', 'linalool'),
  ('hallertau_blanc', 'geraniol'),
  ('hallertau_blanc', 'hop_isobutyrates'),
  ('hallertau_magnum', 'myrcene'),
  ('hallertau_magnum', 'humulene'),
  ('hallertau_magnum', 'caryophyllene'),
  ('hallertau_magnum', 'linalool'),
  ('hallertau_magnum', 'geraniol'),
  ('hallertau_magnum', 'hop_isobutyrates'),
  ('hallertau_mittelfrueh', 'myrcene'),
  ('hallertau_mittelfrueh', 'humulene'),
  ('hallertau_mittelfrueh', 'caryophyllene'),
  ('hallertau_mittelfrueh', 'farnesene'),
  ('hallertau_mittelfrueh', 'linalool'),
  ('hallertau_mittelfrueh', 'geraniol'),
  ('hallertau_mittelfrueh', 'hop_isobutyrates'),
  ('hallertau_tradition', 'myrcene'),
  ('hallertau_tradition', 'humulene'),
  ('hallertau_tradition', 'caryophyllene'),
  ('hallertau_tradition', 'linalool'),
  ('hallertau_tradition', 'hop_isobutyrates'),
  ('herkules', 'myrcene'),
  ('herkules', 'humulene'),
  ('herkules', 'caryophyllene'),
  ('herkules', 'linalool'),
  ('herkules', 'geraniol'),
  ('herkules', 'hop_isobutyrates'),
  ('huell_melon', 'myrcene'),
  ('huell_melon', 'caryophyllene'),
  ('huell_melon', 'farnesene'),
  ('huell_melon', 'linalool'),
  ('huell_melon', 'geraniol'),
  ('huell_melon', 'hop_isobutyrates'),
  ('mandarina_bavaria', 'myrcene'),
  ('mandarina_bavaria', 'humulene'),
  ('mandarina_bavaria', 'caryophyllene'),
  ('mandarina_bavaria', 'farnesene'),
  ('mandarina_bavaria', 'linalool'),
  ('mandarina_bavaria', 'geraniol'),
  ('mandarina_bavaria', 'hop_isobutyrates'),
  ('perle', 'myrcene'),
  ('perle', 'humulene'),
  ('perle', 'caryophyllene'),
  ('spalter_select', 'myrcene'),
  ('spalter_select', 'humulene'),
  ('spalter_select', 'caryophyllene'),
  ('spalter_select', 'farnesene'),
  ('spalter_select', 'linalool'),
  ('spalter_select', 'geraniol'),
  ('tango', 'myrcene'),
  ('tango', 'humulene'),
  ('tango', 'caryophyllene'),
  ('tango', 'farnesene'),
  ('tango', 'linalool'),
  ('tango', 'geraniol'),
  ('tango', 'hop_isobutyrates'),
  ('tettnanger', 'myrcene'),
  ('tettnanger', 'caryophyllene'),
  ('tettnanger', 'farnesene'),
  ('tettnanger', 'linalool'),
  ('tettnanger', 'geraniol'),
  ('titan', 'myrcene'),
  ('titan', 'humulene'),
  ('titan', 'caryophyllene'),
  ('titan', 'linalool'),
  ('titan', 'geraniol'),
  ('titan', 'hop_isobutyrates'),
  ('aurora', 'myrcene'),
  ('aurora', 'humulene'),
  ('aurora', 'caryophyllene'),
  ('aurora', 'farnesene'),
  ('aurora', 'linalool'),
  ('aurora', 'geraniol'),
  ('celeia', 'myrcene'),
  ('celeia', 'humulene'),
  ('celeia', 'caryophyllene'),
  ('celeia', 'farnesene'),
  ('celeia', 'linalool'),
  ('saaz', 'myrcene'),
  ('saaz', 'humulene'),
  ('saaz', 'caryophyllene'),
  ('saaz', 'farnesene'),
  ('saaz', 'linalool'),
  ('saaz', 'geraniol'),
  ('cascade', 'myrcene'),
  ('cascade', 'humulene'),
  ('cascade', 'caryophyllene'),
  ('cascade', 'farnesene'),
  ('cascade', 'linalool'),
  ('cascade', 'geraniol'),
  ('centennial', 'myrcene'),
  ('centennial', 'humulene'),
  ('centennial', 'caryophyllene'),
  ('centennial', 'linalool'),
  ('centennial', 'geraniol'),
  ('chinook', 'myrcene'),
  ('chinook', 'humulene'),
  ('chinook', 'caryophyllene'),
  ('chinook', 'linalool'),
  ('chinook', 'geraniol'),
  ('citra', 'myrcene'),
  ('citra', 'humulene'),
  ('citra', 'caryophyllene'),
  ('citra', 'linalool'),
  ('citra', 'geraniol'),
  ('columbus', 'myrcene'),
  ('columbus', 'humulene'),
  ('columbus', 'caryophyllene'),
  ('columbus', 'farnesene'),
  ('columbus', 'linalool'),
  ('columbus', 'geraniol'),
  ('ekuanot', 'myrcene'),
  ('ekuanot', 'humulene'),
  ('ekuanot', 'caryophyllene'),
  ('ekuanot', 'farnesene'),
  ('mosaic', 'myrcene'),
  ('mosaic', 'humulene'),
  ('mosaic', 'caryophyllene'),
  ('mosaic', 'linalool'),
  ('mosaic', 'geraniol'),
  ('mosaic', 'hop_isobutyrates'),
  ('sabro', 'myrcene'),
  ('sabro', 'humulene'),
  ('sabro', 'caryophyllene'),
  ('sabro', 'linalool'),
  ('sabro', 'geraniol'),
  ('talus', 'myrcene'),
  ('talus', 'humulene'),
  ('talus', 'caryophyllene'),
  ('talus', 'linalool'),
  ('talus', 'geraniol'),
  ('talus', 'hop_isobutyrates'),
  ('eclipse', 'myrcene'),
  ('eclipse', 'humulene'),
  ('eclipse', 'caryophyllene'),
  ('eclipse', 'linalool'),
  ('eclipse', 'geraniol'),
  ('ella', 'myrcene'),
  ('ella', 'humulene'),
  ('ella', 'caryophyllene'),
  ('ella', 'linalool'),
  ('ella', 'geraniol'),
  ('enigma', 'myrcene'),
  ('enigma', 'humulene'),
  ('enigma', 'caryophyllene'),
  ('enigma', 'farnesene'),
  ('enigma', 'linalool'),
  ('enigma', 'geraniol'),
  ('galaxy', 'myrcene'),
  ('galaxy', 'humulene'),
  ('galaxy', 'caryophyllene'),
  ('galaxy', 'farnesene'),
  ('galaxy', 'linalool'),
  ('galaxy', 'geraniol'),
  ('topaz', 'myrcene'),
  ('topaz', 'humulene'),
  ('topaz', 'caryophyllene'),
  ('topaz', 'linalool'),
  ('topaz', 'geraniol'),
  ('vic_secret', 'myrcene'),
  ('vic_secret', 'humulene'),
  ('vic_secret', 'caryophyllene'),
  ('vic_secret', 'linalool'),
  ('vic_secret', 'geraniol'),
  ('loral', 'myrcene'),
  ('loral', 'humulene'),
  ('loral', 'caryophyllene'),
  ('loral', 'linalool'),
  ('loral', 'geraniol'),
  ('simcoe', 'myrcene'),
  ('simcoe', 'humulene'),
  ('simcoe', 'caryophyllene'),
  ('amarillo', 'myrcene'),
  ('amarillo', 'humulene'),
  ('amarillo', 'caryophyllene'),
  ('amarillo', 'farnesene'),
  ('willamette', 'myrcene'),
  ('willamette', 'humulene'),
  ('willamette', 'caryophyllene'),
  ('willamette', 'farnesene'),
  ('northern_brewer', 'myrcene'),
  ('northern_brewer', 'humulene'),
  ('northern_brewer', 'caryophyllene'),
  ('mt_hood', 'myrcene'),
  ('mt_hood', 'humulene'),
  ('mt_hood', 'caryophyllene'),
  ('crystal', 'myrcene'),
  ('crystal', 'humulene'),
  ('crystal', 'caryophyllene'),
  ('ekg', 'myrcene'),
  ('ekg', 'humulene'),
  ('fuggle', 'myrcene'),
  ('fuggle', 'humulene'),
  ('fuggle', 'farnesene'),
  ('savinjski_golding', 'myrcene'),
  ('savinjski_golding', 'humulene'),
  ('savinjski_golding', 'farnesene'),
  ('challenger', 'myrcene'),
  ('challenger', 'humulene'),
  ('nelson_sauvin', 'myrcene'),
  ('nelson_sauvin', 'humulene'),
  ('nelson_sauvin', 'caryophyllene'),
  ('motueka', 'myrcene'),
  ('motueka', 'humulene'),
  ('motueka', 'caryophyllene'),
  ('motueka', 'farnesene'),
  ('wb06', 'vinylguaiacol'),
  ('wb06', 'isoamyl_acetate'),
  ('wb06', 'ethyl_hexanoate'),
  ('t58', 'vinylguaiacol'),
  ('t58', 'isoamyl_acetate'),
  ('t58', 'ethyl_hexanoate'),
  ('be134', 'vinylguaiacol'),
  ('be134', 'isoamyl_acetate'),
  ('be134', 'ethyl_hexanoate'),
  ('be134', 'phenylethanol'),
  ('lb_wit', 'vinylguaiacol'),
  ('lb_wit', 'isoamyl_acetate'),
  ('lb_abbaye', 'vinylguaiacol'),
  ('lb_abbaye', 'isoamyl_acetate'),
  ('lb_abbaye', 'ethyl_hexanoate'),
  ('lb_farmhouse', 'vinylguaiacol'),
  ('lb_farmhouse', 'isoamyl_acetate'),
  ('lb_farmhouse', 'ethyl_hexanoate'),
  ('lb_belle', 'vinylguaiacol'),
  ('lb_belle', 'isoamyl_acetate'),
  ('lb_belle', 'ethyl_hexanoate'),
  ('lb_munich', 'vinylguaiacol'),
  ('lb_munich', 'isoamyl_acetate'),
  ('us05', 'isoamyl_acetate'),
  ('us05', 'ethyl_hexanoate'),
  ('lb_nottingham', 'isoamyl_acetate'),
  ('lb_nottingham', 'ethyl_hexanoate'),
  ('lb_bry97', 'isoamyl_acetate'),
  ('lb_diamond', 'isoamyl_acetate'),
  ('lb_verdant', 'isoamyl_acetate'),
  ('lb_verdant', 'ethyl_hexanoate'),
  ('lb_ne', 'isoamyl_acetate'),
  ('lb_ne', 'ethyl_hexanoate'),
  ('lb_voss', 'isoamyl_acetate'),
  ('lb_voss', 'ethyl_hexanoate'),
  ('lb_london', 'isoamyl_acetate'),
  ('lb_london', 'ethyl_hexanoate'),
  ('lb_windsor', 'isoamyl_acetate'),
  ('lb_windsor', 'ethyl_hexanoate'),
  ('lb_koln', 'isoamyl_acetate'),
  ('lb_koln', 'ethyl_hexanoate'),
  ('malt_pils', 'methylbutanal'),
  ('malt_pale', 'methylbutanal'),
  ('malt_pale', 'maltol'),
  ('malt_vienna', 'methylbutanal'),
  ('malt_vienna', 'maltol'),
  ('malt_vienna', 'furaneol'),
  ('malt_munich', 'methylbutanal'),
  ('malt_munich', 'maltol'),
  ('malt_munich', 'furaneol'),
  ('malt_wheat', 'methylbutanal'),
  ('malt_biscuit', 'methylbutanal'),
  ('malt_biscuit', 'pyrazines'),
  ('malt_biscuit', 'acetylpyrroline'),
  ('malt_biscuit', 'maltol'),
  ('malt_crystal', 'furaneol'),
  ('malt_crystal', 'damascenone'),
  ('malt_crystal', 'acetylpyrroline'),
  ('malt_crystal', 'pyrazines'),
  ('malt_crystal', 'methylbutanal'),
  ('malt_crystal', 'vanillin'),
  ('malt_crystal', 'maltol'),
  ('malt_chocolate', 'pyrazines'),
  ('malt_chocolate', 'guaiacol'),
  ('malt_chocolate', 'maltol'),
  ('malt_roasted_barley', 'pyrazines'),
  ('malt_roasted_barley', 'guaiacol'),
  ('malt_black', 'pyrazines'),
  ('malt_black', 'guaiacol'),
  ('allspice', 'eugenol'),
  ('allspice', 'methyl_eugenol'),
  ('allspice', 'caryophyllene'),
  ('allspice', 'alpha_terpineol'),
  ('allspice', 'cineole'),
  ('allspice', 'p_cymene'),
  ('allspice', 'alpha_phellandrene'),
  ('licorice', 'gamma_nonalactone'),
  ('licorice', 'furaneol'),
  ('licorice', 'vanillin'),
  ('licorice', 'linalool'),
  ('licorice', 'carvacrol'),
  ('licorice', 'nonadienal'),
  ('licorice', 'anethole'),
  ('licorice', 'estragole'),
  ('licorice', 'eugenol'),
  ('licorice', 'cineole'),
  ('elderflower', 'rose_oxide'),
  ('elderflower', 'hotrienol'),
  ('elderflower', 'linalool'),
  ('elderflower', 'alpha_terpineol'),
  ('elderflower', 'nonanal'),
  ('elderflower', 'damascenone'),
  ('elderflower', 'hexanal'),
  ('spruce', 'bornyl_acetate'),
  ('spruce', 'camphene'),
  ('spruce', 'delta3_carene'),
  ('spruce', 'alpha_pinene'),
  ('spruce', 'limonene'),
  ('spruce', 'beta_phellandrene'),
  ('spruce', 'beta_pinene'),
  ('spruce', 'borneol'),
  ('spruce', 'caryophyllene'),
  ('spruce', 'terpinolene'),
  ('lime', 'limonene'),
  ('lime', 'gamma_terpinene'),
  ('lime', 'beta_pinene'),
  ('lime', 'citral'),
  ('lime', 'sabinene'),
  ('lime', 'alpha_pinene'),
  ('lime', 'myrcene'),
  ('kaffir_lime', 'citronellal'),
  ('kaffir_lime', 'sabinene'),
  ('kaffir_lime', 'linalool'),
  ('kaffir_lime', 'beta_pinene'),
  ('kaffir_lime', 'myrcene'),
  ('kaffir_lime', 'gamma_terpinene'),
  ('yuzu', 'limonene'),
  ('yuzu', 'gamma_terpinene'),
  ('yuzu', 'myrcene'),
  ('yuzu', 'alpha_pinene'),
  ('yuzu', 'linalool'),
  ('sweet_gale', 'alpha_pinene'),
  ('sweet_gale', 'limonene'),
  ('sweet_gale', 'cineole'),
  ('sweet_gale', 'delta_cadinene'),
  ('sweet_gale', 'nerolidol'),
  ('cacao_nibs', 'methylbutanal'),
  ('cacao_nibs', 'pyrazines'),
  ('cacao_nibs', 'furaneol'),
  ('cacao_nibs', 'phenylacetaldehyde'),
  ('coffee', 'furfurylthiol'),
  ('coffee', 'pyrazines'),
  ('coffee', 'guaiacol'),
  ('coffee', 'damascenone'),
  ('coffee', 'furaneol'),
  ('coffee', 'vinylguaiacol'),
  ('coffee', 'vanillin'),
  ('jalapeno', 'ibmp'),
  ('jalapeno', 'hexenal'),
  ('jalapeno', 'hexanal'),
  ('jalapeno', 'nonadienal')
) AS k(ingredient_id, compound_id) WHERE k.ingredient_id = l.ingredient_id AND k.compound_id = l.compound_id);

DELETE FROM flavour_ingredients WHERE id <> ALL (ARRAY['coriander', 'orange_sweet', 'orange_bitter', 'lemon', 'grapefruit', 'ginger', 'cardamom', 'cinnamon', 'clove', 'star_anise', 'aniseed', 'fennel', 'cumin', 'black_pepper', 'pink_pepper', 'grains_of_paradise', 'juniper', 'lavender', 'chamomile', 'lemongrass', 'bay_leaf', 'rosemary', 'sage', 'thyme', 'peppermint', 'turmeric', 'nutmeg', 'mace', 'rose', 'vanilla', 'ariana', 'callista', 'comet', 'hallertau_blanc', 'hallertau_magnum', 'hallertau_mittelfrueh', 'hallertau_tradition', 'herkules', 'huell_melon', 'mandarina_bavaria', 'perle', 'spalter_select', 'tango', 'tettnanger', 'titan', 'aurora', 'celeia', 'saaz', 'cascade', 'centennial', 'chinook', 'citra', 'columbus', 'ekuanot', 'mosaic', 'sabro', 'talus', 'eclipse', 'ella', 'enigma', 'galaxy', 'topaz', 'vic_secret', 'loral', 'simcoe', 'amarillo', 'willamette', 'northern_brewer', 'mt_hood', 'crystal', 'ekg', 'fuggle', 'savinjski_golding', 'challenger', 'nelson_sauvin', 'motueka', 'wb06', 't58', 'be134', 'lb_wit', 'lb_abbaye', 'lb_farmhouse', 'lb_belle', 'lb_munich', 'us05', 'lb_nottingham', 'lb_bry97', 'lb_diamond', 'lb_verdant', 'lb_ne', 'lb_voss', 'lb_london', 'lb_windsor', 'lb_koln', 'malt_pils', 'malt_pale', 'malt_vienna', 'malt_munich', 'malt_wheat', 'malt_biscuit', 'malt_crystal', 'malt_chocolate', 'malt_roasted_barley', 'malt_black', 'allspice', 'licorice', 'elderflower', 'spruce', 'lime', 'kaffir_lime', 'yuzu', 'sweet_gale', 'cacao_nibs', 'coffee', 'jalapeno']::TEXT[]);

INSERT INTO flavour_ingredient_compounds (ingredient_id, compound_id, intensity, source_id) VALUES
  ('coriander', 'linalool', 5, 'lawrence1980cor'),
  ('coriander', 'gamma_terpinene', 2, 'lawrence1980cor'),
  ('coriander', 'camphor', 2, 'lawrence1980cor'),
  ('coriander', 'alpha_pinene', 2, 'lawrence1980cor'),
  ('coriander', 'geranyl_acetate', 1, 'lawrence1980cor'),
  ('coriander', 'limonene', 1, 'lawrence1980cor'),
  ('coriander', 'geraniol', 2, 'lawrence1980cor'),
  ('orange_sweet', 'limonene', 5, 'supelco776'),
  ('orange_sweet', 'myrcene', 1, 'supelco776'),
  ('orange_sweet', 'linalool', 1, 'supelco776'),
  ('orange_bitter', 'limonene', 5, 'dugo1993'),
  ('orange_bitter', 'myrcene', 1, 'dugo1993'),
  ('orange_bitter', 'linalool', 1, 'dugo1993'),
  ('lemon', 'limonene', 5, 'dugo1983'),
  ('lemon', 'beta_pinene', 3, 'dugo1983'),
  ('lemon', 'gamma_terpinene', 2, 'dugo1983'),
  ('lemon', 'alpha_pinene', 1, 'dugo1983'),
  ('lemon', 'citral', 4, 'dugo1983'),
  ('lemon', 'sabinene', 1, 'dugo1983'),
  ('lemon', 'myrcene', 1, 'dugo1983'),
  ('grapefruit', 'limonene', 5, 'boelens1991'),
  ('grapefruit', 'myrcene', 1, 'boelens1991'),
  ('grapefruit', 'nootkatone', 2, 'boelens1991'),
  ('ginger', 'zingiberene', 4, 'lawrence1988gin'),
  ('ginger', 'sesquiphellandrene', 2, 'lawrence1988gin'),
  ('ginger', 'camphene', 2, 'lawrence1988gin'),
  ('ginger', 'ar_curcumene', 2, 'lawrence1988gin'),
  ('ginger', 'beta_phellandrene', 2, 'lawrence1988gin'),
  ('ginger', 'limonene', 2, 'lawrence1988gin'),
  ('ginger', 'alpha_pinene', 1, 'lawrence1988gin'),
  ('ginger', 'citronellol', 4, 'lawrence1988gin'),
  ('cardamom', 'terpinyl_acetate', 5, 'bernhard1971'),
  ('cardamom', 'cineole', 4, 'bernhard1971'),
  ('cardamom', 'linalyl_acetate', 2, 'bernhard1971'),
  ('cardamom', 'sabinene', 2, 'bernhard1971'),
  ('cardamom', 'linalool', 4, 'bernhard1971'),
  ('cardamom', 'limonene', 1, 'bernhard1971'),
  ('cardamom', 'myrcene', 1, 'bernhard1971'),
  ('cardamom', 'alpha_pinene', 1, 'bernhard1971'),
  ('cinnamon', 'cinnamaldehyde', 5, 'jirovetz1998'),
  ('cinnamon', 'caryophyllene', 2, 'jirovetz1998'),
  ('cinnamon', 'eugenol', 2, 'jirovetz1998'),
  ('cinnamon', 'limonene', 2, 'jirovetz1998'),
  ('cinnamon', 'linalool', 4, 'jirovetz1998'),
  ('clove', 'eugenol', 5, 'viudamartos2007'),
  ('clove', 'caryophyllene', 3, 'viudamartos2007'),
  ('clove', 'humulene', 2, 'viudamartos2007'),
  ('star_anise', 'anethole', 5, 'maack1982'),
  ('star_anise', 'linalool', 3, 'maack1982'),
  ('aniseed', 'anethole', 5, 'lawrence1980ani'),
  ('aniseed', 'estragole', 1, 'lawrence1980ani'),
  ('fennel', 'anethole', 5, 'ashokkumar2021'),
  ('fennel', 'estragole', 3, 'ashokkumar2021'),
  ('fennel', 'fenchone', 3, 'ashokkumar2021'),
  ('fennel', 'limonene', 2, 'ashokkumar2021'),
  ('cumin', 'menthadienal', 4, 'ashokkumar2021'),
  ('cumin', 'cuminaldehyde', 4, 'ashokkumar2021'),
  ('cumin', 'beta_pinene', 3, 'ashokkumar2021'),
  ('cumin', 'gamma_terpinene', 3, 'ashokkumar2021'),
  ('black_pepper', 'sabinene', 4, 'wrolstad'),
  ('black_pepper', 'alpha_pinene', 3, 'wrolstad'),
  ('black_pepper', 'limonene', 3, 'wrolstad'),
  ('black_pepper', 'delta3_carene', 3, 'wrolstad'),
  ('black_pepper', 'caryophyllene', 2, 'wrolstad'),
  ('black_pepper', 'humulene', 1, 'wrolstad'),
  ('pink_pepper', 'myrcene', 3, 'lawrence1984pp'),
  ('pink_pepper', 'p_cymene', 2, 'lawrence1984pp'),
  ('pink_pepper', 'alpha_phellandrene', 2, 'lawrence1984pp'),
  ('pink_pepper', 'limonene', 2, 'lawrence1984pp'),
  ('pink_pepper', 'beta_phellandrene', 2, 'lawrence1984pp'),
  ('pink_pepper', 'alpha_pinene', 1, 'lawrence1984pp'),
  ('pink_pepper', 'humulene', 1, 'lawrence1984pp'),
  ('grains_of_paradise', 'humulene', 4, 'menut1991'),
  ('grains_of_paradise', 'caryophyllene_oxide', 3, 'menut1991'),
  ('grains_of_paradise', 'caryophyllene', 2, 'menut1991'),
  ('grains_of_paradise', 'linalool', 5, 'menut1991'),
  ('juniper', 'alpha_pinene', 4, 'depascual1976'),
  ('juniper', 'myrcene', 3, 'depascual1976'),
  ('juniper', 'terpinen4ol', 3, 'depascual1976'),
  ('juniper', 'limonene', 2, 'depascual1976'),
  ('juniper', 'terpinolene', 2, 'depascual1976'),
  ('juniper', 'citronellal', 3, 'depascual1976'),
  ('lavender', 'linalool', 5, 'formacek1982'),
  ('lavender', 'linalyl_acetate', 4, 'formacek1982'),
  ('lavender', 'terpinen4ol', 2, 'formacek1982'),
  ('lavender', 'cineole', 2, 'formacek1982'),
  ('lavender', 'camphor', 2, 'formacek1982'),
  ('lavender', 'caryophyllene', 1, 'formacek1982'),
  ('lavender', 'limonene', 1, 'formacek1982'),
  ('chamomile', 'bisabolol_oxides', 5, 'brunke1992'),
  ('chamomile', 'chamazulene', 4, 'brunke1992'),
  ('chamomile', 'farnesene', 1, 'brunke1992'),
  ('lemongrass', 'citral', 5, 'mohammad1981'),
  ('lemongrass', 'farnesol', 2, 'mohammad1981'),
  ('lemongrass', 'geraniol', 3, 'mohammad1981'),
  ('bay_leaf', 'cineole', 5, 'akgul1989'),
  ('bay_leaf', 'terpinyl_acetate', 3, 'akgul1989'),
  ('bay_leaf', 'sabinene', 2, 'akgul1989'),
  ('bay_leaf', 'alpha_pinene', 2, 'akgul1989'),
  ('bay_leaf', 'methyl_eugenol', 2, 'akgul1989'),
  ('bay_leaf', 'linalool', 4, 'akgul1989'),
  ('bay_leaf', 'eugenol', 1, 'akgul1989'),
  ('rosemary', 'alpha_pinene', 4, 'viudamartos2007'),
  ('rosemary', 'camphor', 3, 'viudamartos2007'),
  ('rosemary', 'beta_pinene', 3, 'viudamartos2007'),
  ('sage', 'camphor', 4, 'viudamartos2007'),
  ('sage', 'cineole', 4, 'viudamartos2007'),
  ('sage', 'camphene', 2, 'viudamartos2007'),
  ('thyme', 'thymol', 4, 'piccaglia1991'),
  ('thyme', 'p_cymene', 4, 'piccaglia1991'),
  ('thyme', 'gamma_terpinene', 3, 'piccaglia1991'),
  ('thyme', 'caryophyllene', 2, 'piccaglia1991'),
  ('thyme', 'linalool', 4, 'piccaglia1991'),
  ('thyme', 'cineole', 1, 'piccaglia1991'),
  ('thyme', 'myrcene', 1, 'piccaglia1991'),
  ('peppermint', 'menthol', 5, 'lawrence1980mint'),
  ('peppermint', 'menthone', 4, 'lawrence1980mint'),
  ('peppermint', 'menthyl_acetate', 2, 'lawrence1980mint'),
  ('peppermint', 'cineole', 1, 'lawrence1980mint'),
  ('peppermint', 'limonene', 1, 'lawrence1980mint'),
  ('turmeric', 'turmerones', 5, 'lawrence1982tur'),
  ('turmeric', 'alpha_phellandrene', 1, 'lawrence1982tur'),
  ('turmeric', 'caryophyllene', 1, 'lawrence1982tur'),
  ('turmeric', 'ar_curcumene', 1, 'lawrence1982tur'),
  ('turmeric', 'farnesene', 1, 'lawrence1982tur'),
  ('nutmeg', 'sabinene', 5, 'baldry1976'),
  ('nutmeg', 'alpha_pinene', 3, 'baldry1976'),
  ('nutmeg', 'beta_pinene', 2, 'baldry1976'),
  ('nutmeg', 'terpinen4ol', 2, 'baldry1976'),
  ('nutmeg', 'limonene', 2, 'baldry1976'),
  ('nutmeg', 'cineole', 2, 'baldry1976'),
  ('nutmeg', 'gamma_terpinene', 2, 'baldry1976'),
  ('nutmeg', 'myrcene', 1, 'baldry1976'),
  ('mace', 'alpha_pinene', 4, 'forest1972'),
  ('mace', 'sabinene', 3, 'forest1972'),
  ('mace', 'beta_pinene', 3, 'forest1972'),
  ('mace', 'myrcene', 3, 'forest1972'),
  ('mace', 'limonene', 2, 'forest1972'),
  ('mace', 'terpinen4ol', 2, 'forest1972'),
  ('mace', 'myristicin', 2, 'forest1972'),
  ('rose', 'citronellol', 5, 'boelens1997'),
  ('rose', 'geraniol', 5, 'boelens1997'),
  ('rose', 'nerol', 5, 'boelens1997'),
  ('rose', 'linalool', 4, 'boelens1997'),
  ('rose', 'phenylethanol', 1, 'boelens1997'),
  ('rose', 'methyl_eugenol', 1, 'boelens1997'),
  ('rose', 'eugenol', 1, 'boelens1997'),
  ('vanilla', 'vanillin', 5, 'cai2019'),
  ('ariana', 'myrcene', 5, 'bh2022'),
  ('ariana', 'humulene', 3, 'bh2022'),
  ('ariana', 'caryophyllene', 2, 'bh2022'),
  ('ariana', 'linalool', 2, 'bh2022'),
  ('ariana', 'geraniol', 1, 'bh2022'),
  ('ariana', 'hop_isobutyrates', 3, 'bh2022'),
  ('callista', 'myrcene', 5, 'bh2022'),
  ('callista', 'humulene', 3, 'bh2022'),
  ('callista', 'caryophyllene', 2, 'bh2022'),
  ('callista', 'linalool', 3, 'bh2022'),
  ('callista', 'hop_isobutyrates', 2, 'bh2022'),
  ('comet', 'myrcene', 5, 'bh2022'),
  ('comet', 'humulene', 1, 'bh2022'),
  ('comet', 'caryophyllene', 4, 'bh2022'),
  ('comet', 'linalool', 2, 'bh2022'),
  ('comet', 'geraniol', 2, 'bh2022'),
  ('comet', 'hop_isobutyrates', 2, 'bh2022'),
  ('hallertau_blanc', 'myrcene', 5, 'bh2022'),
  ('hallertau_blanc', 'humulene', 1, 'bh2022'),
  ('hallertau_blanc', 'caryophyllene', 1, 'bh2022'),
  ('hallertau_blanc', 'linalool', 2, 'bh2022'),
  ('hallertau_blanc', 'geraniol', 1, 'bh2022'),
  ('hallertau_blanc', 'hop_isobutyrates', 2, 'bh2022'),
  ('hallertau_magnum', 'myrcene', 5, 'bh2022'),
  ('hallertau_magnum', 'humulene', 5, 'bh2022'),
  ('hallertau_magnum', 'caryophyllene', 3, 'bh2022'),
  ('hallertau_magnum', 'linalool', 2, 'bh2022'),
  ('hallertau_magnum', 'geraniol', 2, 'bh2022'),
  ('hallertau_magnum', 'hop_isobutyrates', 3, 'bh2022'),
  ('hallertau_mittelfrueh', 'myrcene', 4, 'bh2022'),
  ('hallertau_mittelfrueh', 'humulene', 3, 'bh2022'),
  ('hallertau_mittelfrueh', 'caryophyllene', 2, 'bh2022'),
  ('hallertau_mittelfrueh', 'farnesene', 1, 'bh2022'),
  ('hallertau_mittelfrueh', 'linalool', 2, 'bh2022'),
  ('hallertau_mittelfrueh', 'geraniol', 1, 'bh2022'),
  ('hallertau_mittelfrueh', 'hop_isobutyrates', 2, 'bh2022'),
  ('hallertau_tradition', 'myrcene', 3, 'bh2022'),
  ('hallertau_tradition', 'humulene', 3, 'bh2022'),
  ('hallertau_tradition', 'caryophyllene', 2, 'bh2022'),
  ('hallertau_tradition', 'linalool', 2, 'bh2022'),
  ('hallertau_tradition', 'hop_isobutyrates', 2, 'bh2022'),
  ('herkules', 'myrcene', 5, 'bh2022'),
  ('herkules', 'humulene', 4, 'bh2022'),
  ('herkules', 'caryophyllene', 2, 'bh2022'),
  ('herkules', 'linalool', 1, 'bh2022'),
  ('herkules', 'geraniol', 2, 'bh2022'),
  ('herkules', 'hop_isobutyrates', 4, 'bh2022'),
  ('huell_melon', 'myrcene', 5, 'bh2022'),
  ('huell_melon', 'caryophyllene', 1, 'bh2022'),
  ('huell_melon', 'farnesene', 2, 'bh2022'),
  ('huell_melon', 'linalool', 2, 'bh2022'),
  ('huell_melon', 'geraniol', 3, 'bh2022'),
  ('huell_melon', 'hop_isobutyrates', 4, 'bh2022'),
  ('mandarina_bavaria', 'myrcene', 4, 'bh2022'),
  ('mandarina_bavaria', 'humulene', 3, 'bh2022'),
  ('mandarina_bavaria', 'caryophyllene', 2, 'bh2022'),
  ('mandarina_bavaria', 'farnesene', 1, 'bh2022'),
  ('mandarina_bavaria', 'linalool', 1, 'bh2022'),
  ('mandarina_bavaria', 'geraniol', 2, 'bh2022'),
  ('mandarina_bavaria', 'hop_isobutyrates', 3, 'bh2022'),
  ('perle', 'myrcene', 4, 'bh2022'),
  ('perle', 'humulene', 4, 'bh2022'),
  ('perle', 'caryophyllene', 3, 'bh2022'),
  ('spalter_select', 'myrcene', 4, 'bh2022'),
  ('spalter_select', 'humulene', 2, 'bh2022'),
  ('spalter_select', 'caryophyllene', 1, 'bh2022'),
  ('spalter_select', 'farnesene', 2, 'bh2022'),
  ('spalter_select', 'linalool', 2, 'bh2022'),
  ('spalter_select', 'geraniol', 2, 'bh2022'),
  ('tango', 'myrcene', 5, 'bh2022'),
  ('tango', 'humulene', 3, 'bh2022'),
  ('tango', 'caryophyllene', 2, 'bh2022'),
  ('tango', 'farnesene', 3, 'bh2022'),
  ('tango', 'linalool', 2, 'bh2022'),
  ('tango', 'geraniol', 4, 'bh2022'),
  ('tango', 'hop_isobutyrates', 4, 'bh2022'),
  ('tettnanger', 'myrcene', 3, 'bh2022'),
  ('tettnanger', 'caryophyllene', 1, 'bh2022'),
  ('tettnanger', 'farnesene', 2, 'bh2022'),
  ('tettnanger', 'linalool', 2, 'bh2022'),
  ('tettnanger', 'geraniol', 1, 'bh2022'),
  ('titan', 'myrcene', 5, 'bh2022'),
  ('titan', 'humulene', 4, 'bh2022'),
  ('titan', 'caryophyllene', 2, 'bh2022'),
  ('titan', 'linalool', 2, 'bh2022'),
  ('titan', 'geraniol', 2, 'bh2022'),
  ('titan', 'hop_isobutyrates', 3, 'bh2022'),
  ('aurora', 'myrcene', 5, 'bh2022'),
  ('aurora', 'humulene', 3, 'bh2022'),
  ('aurora', 'caryophyllene', 2, 'bh2022'),
  ('aurora', 'farnesene', 2, 'bh2022'),
  ('aurora', 'linalool', 2, 'bh2022'),
  ('aurora', 'geraniol', 1, 'bh2022'),
  ('celeia', 'myrcene', 4, 'bh2022'),
  ('celeia', 'humulene', 4, 'bh2022'),
  ('celeia', 'caryophyllene', 2, 'bh2022'),
  ('celeia', 'farnesene', 1, 'bh2022'),
  ('celeia', 'linalool', 2, 'bh2022'),
  ('saaz', 'myrcene', 3, 'bh2022'),
  ('saaz', 'humulene', 2, 'bh2022'),
  ('saaz', 'caryophyllene', 1, 'bh2022'),
  ('saaz', 'farnesene', 2, 'bh2022'),
  ('saaz', 'linalool', 1, 'bh2022'),
  ('saaz', 'geraniol', 1, 'bh2022'),
  ('cascade', 'myrcene', 5, 'bh2022'),
  ('cascade', 'humulene', 2, 'bh2022'),
  ('cascade', 'caryophyllene', 2, 'bh2022'),
  ('cascade', 'farnesene', 2, 'bh2022'),
  ('cascade', 'linalool', 2, 'bh2022'),
  ('cascade', 'geraniol', 1, 'bh2022'),
  ('centennial', 'myrcene', 5, 'bh2022'),
  ('centennial', 'humulene', 3, 'bh2022'),
  ('centennial', 'caryophyllene', 2, 'bh2022'),
  ('centennial', 'linalool', 3, 'bh2022'),
  ('centennial', 'geraniol', 4, 'bh2022'),
  ('chinook', 'myrcene', 4, 'bh2022'),
  ('chinook', 'humulene', 4, 'bh2022'),
  ('chinook', 'caryophyllene', 3, 'bh2022'),
  ('chinook', 'linalool', 2, 'bh2022'),
  ('chinook', 'geraniol', 2, 'bh2022'),
  ('citra', 'myrcene', 5, 'bh2022'),
  ('citra', 'humulene', 3, 'bh2022'),
  ('citra', 'caryophyllene', 3, 'bh2022'),
  ('citra', 'linalool', 3, 'bh2022'),
  ('citra', 'geraniol', 2, 'bh2022'),
  ('columbus', 'myrcene', 5, 'bh2022'),
  ('columbus', 'humulene', 4, 'bh2022'),
  ('columbus', 'caryophyllene', 3, 'bh2022'),
  ('columbus', 'farnesene', 1, 'bh2022'),
  ('columbus', 'linalool', 3, 'bh2022'),
  ('columbus', 'geraniol', 2, 'bh2022'),
  ('ekuanot', 'myrcene', 5, 'bh2022'),
  ('ekuanot', 'humulene', 4, 'bh2022'),
  ('ekuanot', 'caryophyllene', 4, 'bh2022'),
  ('ekuanot', 'farnesene', 1, 'bh2022'),
  ('mosaic', 'myrcene', 5, 'bh2022'),
  ('mosaic', 'humulene', 3, 'bh2022'),
  ('mosaic', 'caryophyllene', 2, 'bh2022'),
  ('mosaic', 'linalool', 2, 'bh2022'),
  ('mosaic', 'geraniol', 2, 'bh2022'),
  ('mosaic', 'hop_isobutyrates', 3, 'bh2022'),
  ('sabro', 'myrcene', 5, 'bh2022'),
  ('sabro', 'humulene', 3, 'bh2022'),
  ('sabro', 'caryophyllene', 4, 'bh2022'),
  ('sabro', 'linalool', 2, 'bh2022'),
  ('sabro', 'geraniol', 4, 'bh2022'),
  ('talus', 'myrcene', 5, 'bh2022'),
  ('talus', 'humulene', 4, 'bh2022'),
  ('talus', 'caryophyllene', 3, 'bh2022'),
  ('talus', 'linalool', 2, 'bh2022'),
  ('talus', 'geraniol', 4, 'bh2022'),
  ('talus', 'hop_isobutyrates', 5, 'bh2022'),
  ('eclipse', 'myrcene', 5, 'bh2022'),
  ('eclipse', 'humulene', 1, 'bh2022'),
  ('eclipse', 'caryophyllene', 3, 'bh2022'),
  ('eclipse', 'linalool', 2, 'bh2022'),
  ('eclipse', 'geraniol', 2, 'bh2022'),
  ('ella', 'myrcene', 5, 'bh2022'),
  ('ella', 'humulene', 4, 'bh2022'),
  ('ella', 'caryophyllene', 3, 'bh2022'),
  ('ella', 'linalool', 2, 'bh2022'),
  ('ella', 'geraniol', 1, 'bh2022'),
  ('enigma', 'myrcene', 5, 'bh2022'),
  ('enigma', 'humulene', 4, 'bh2022'),
  ('enigma', 'caryophyllene', 3, 'bh2022'),
  ('enigma', 'farnesene', 3, 'bh2022'),
  ('enigma', 'linalool', 2, 'bh2022'),
  ('enigma', 'geraniol', 1, 'bh2022'),
  ('galaxy', 'myrcene', 5, 'bh2022'),
  ('galaxy', 'humulene', 1, 'bh2022'),
  ('galaxy', 'caryophyllene', 3, 'bh2022'),
  ('galaxy', 'farnesene', 2, 'bh2022'),
  ('galaxy', 'linalool', 3, 'bh2022'),
  ('galaxy', 'geraniol', 2, 'bh2022'),
  ('topaz', 'myrcene', 5, 'bh2022'),
  ('topaz', 'humulene', 3, 'bh2022'),
  ('topaz', 'caryophyllene', 3, 'bh2022'),
  ('topaz', 'linalool', 2, 'bh2022'),
  ('topaz', 'geraniol', 2, 'bh2022'),
  ('vic_secret', 'myrcene', 5, 'bh2022'),
  ('vic_secret', 'humulene', 3, 'bh2022'),
  ('vic_secret', 'caryophyllene', 3, 'bh2022'),
  ('vic_secret', 'linalool', 2, 'bh2022'),
  ('vic_secret', 'geraniol', 1, 'bh2022'),
  ('loral', 'myrcene', 5, 'bh2021'),
  ('loral', 'humulene', 4, 'bh2021'),
  ('loral', 'caryophyllene', 2, 'bh2021'),
  ('loral', 'linalool', 3, 'bh2021'),
  ('loral', 'geraniol', 2, 'bh2021'),
  ('simcoe', 'myrcene', 5, 'hga'),
  ('simcoe', 'humulene', 3, 'hga'),
  ('simcoe', 'caryophyllene', 2, 'hga'),
  ('amarillo', 'myrcene', 5, 'hga'),
  ('amarillo', 'humulene', 3, 'hga'),
  ('amarillo', 'caryophyllene', 2, 'hga'),
  ('amarillo', 'farnesene', 2, 'hga'),
  ('willamette', 'myrcene', 4, 'hga'),
  ('willamette', 'humulene', 3, 'hga'),
  ('willamette', 'caryophyllene', 2, 'hga'),
  ('willamette', 'farnesene', 2, 'hga'),
  ('northern_brewer', 'myrcene', 5, 'hga'),
  ('northern_brewer', 'humulene', 4, 'hga'),
  ('northern_brewer', 'caryophyllene', 2, 'hga'),
  ('mt_hood', 'myrcene', 4, 'hga'),
  ('mt_hood', 'humulene', 4, 'hga'),
  ('mt_hood', 'caryophyllene', 3, 'hga'),
  ('crystal', 'myrcene', 5, 'hga'),
  ('crystal', 'humulene', 3, 'hga'),
  ('crystal', 'caryophyllene', 2, 'hga'),
  ('ekg', 'myrcene', 3, 'faram'),
  ('ekg', 'humulene', 3, 'faram'),
  ('fuggle', 'myrcene', 3, 'faram'),
  ('fuggle', 'humulene', 4, 'faram'),
  ('fuggle', 'farnesene', 2, 'faram'),
  ('savinjski_golding', 'myrcene', 3, 'faram'),
  ('savinjski_golding', 'humulene', 3, 'faram'),
  ('savinjski_golding', 'farnesene', 1, 'faram'),
  ('challenger', 'myrcene', 4, 'faram'),
  ('challenger', 'humulene', 4, 'faram'),
  ('nelson_sauvin', 'myrcene', 3, 'hopsconnect'),
  ('nelson_sauvin', 'humulene', 4, 'hopsconnect'),
  ('nelson_sauvin', 'caryophyllene', 2, 'hopsconnect'),
  ('motueka', 'myrcene', 4, 'hopsconnect'),
  ('motueka', 'humulene', 1, 'hopsconnect'),
  ('motueka', 'caryophyllene', 1, 'hopsconnect'),
  ('motueka', 'farnesene', 2, 'hopsconnect'),
  ('wb06', 'vinylguaiacol', 4, 'kumar2023'),
  ('wb06', 'isoamyl_acetate', 3, 'fm_wb06'),
  ('wb06', 'ethyl_hexanoate', 2, 'roberts2023'),
  ('t58', 'vinylguaiacol', 3, 'fm_t58'),
  ('t58', 'isoamyl_acetate', 3, 'fm_t58'),
  ('t58', 'ethyl_hexanoate', 2, 'fm_t58'),
  ('be134', 'vinylguaiacol', 3, 'fm_be134'),
  ('be134', 'isoamyl_acetate', 2, 'fm_be134'),
  ('be134', 'ethyl_hexanoate', 2, 'fm_be134'),
  ('be134', 'phenylethanol', 2, 'fm_be134'),
  ('lb_wit', 'vinylguaiacol', 3, 'll_wit'),
  ('lb_wit', 'isoamyl_acetate', 2, 'll_wit'),
  ('lb_abbaye', 'vinylguaiacol', 2, 'll_abbaye'),
  ('lb_abbaye', 'isoamyl_acetate', 3, 'll_abbaye'),
  ('lb_abbaye', 'ethyl_hexanoate', 2, 'll_abbaye'),
  ('lb_farmhouse', 'vinylguaiacol', 3, 'll_farmhouse'),
  ('lb_farmhouse', 'isoamyl_acetate', 2, 'll_farmhouse'),
  ('lb_farmhouse', 'ethyl_hexanoate', 2, 'll_farmhouse'),
  ('lb_belle', 'vinylguaiacol', 4, 'll_belle'),
  ('lb_belle', 'isoamyl_acetate', 1, 'll_belle'),
  ('lb_belle', 'ethyl_hexanoate', 1, 'll_belle'),
  ('lb_munich', 'vinylguaiacol', 4, 'll_munich'),
  ('lb_munich', 'isoamyl_acetate', 4, 'll_munich'),
  ('us05', 'isoamyl_acetate', 1, 'fm_range'),
  ('us05', 'ethyl_hexanoate', 1, 'roberts2023'),
  ('lb_nottingham', 'isoamyl_acetate', 1, 'll_nott'),
  ('lb_nottingham', 'ethyl_hexanoate', 1, 'll_nott'),
  ('lb_bry97', 'isoamyl_acetate', 1, 'll_bifold'),
  ('lb_diamond', 'isoamyl_acetate', 1, 'll_bifold'),
  ('lb_verdant', 'isoamyl_acetate', 2, 'll_bifold'),
  ('lb_verdant', 'ethyl_hexanoate', 3, 'll_bifold'),
  ('lb_ne', 'isoamyl_acetate', 2, 'll_bifold'),
  ('lb_ne', 'ethyl_hexanoate', 3, 'll_bifold'),
  ('lb_voss', 'isoamyl_acetate', 1, 'll_bifold'),
  ('lb_voss', 'ethyl_hexanoate', 2, 'll_bifold'),
  ('lb_london', 'isoamyl_acetate', 3, 'll_bifold'),
  ('lb_london', 'ethyl_hexanoate', 2, 'll_bifold'),
  ('lb_windsor', 'isoamyl_acetate', 3, 'll_bifold'),
  ('lb_windsor', 'ethyl_hexanoate', 2, 'll_bifold'),
  ('lb_koln', 'isoamyl_acetate', 2, 'll_bifold'),
  ('lb_koln', 'ethyl_hexanoate', 1, 'll_bifold'),
  ('malt_pils', 'methylbutanal', 1, 'own'),
  ('malt_pale', 'methylbutanal', 2, 'own'),
  ('malt_pale', 'maltol', 1, 'own'),
  ('malt_vienna', 'methylbutanal', 2, 'own'),
  ('malt_vienna', 'maltol', 1, 'own'),
  ('malt_vienna', 'furaneol', 1, 'own'),
  ('malt_munich', 'methylbutanal', 3, 'own'),
  ('malt_munich', 'maltol', 2, 'rogner2021'),
  ('malt_munich', 'furaneol', 2, 'own'),
  ('malt_wheat', 'methylbutanal', 1, 'own'),
  ('malt_biscuit', 'methylbutanal', 3, 'own'),
  ('malt_biscuit', 'pyrazines', 2, 'own'),
  ('malt_biscuit', 'acetylpyrroline', 2, 'own'),
  ('malt_biscuit', 'maltol', 2, 'own'),
  ('malt_crystal', 'furaneol', 4, 'fechir2021'),
  ('malt_crystal', 'damascenone', 3, 'fechir2021'),
  ('malt_crystal', 'acetylpyrroline', 3, 'fechir2021'),
  ('malt_crystal', 'pyrazines', 2, 'fechir2021'),
  ('malt_crystal', 'methylbutanal', 3, 'fickert1998'),
  ('malt_crystal', 'vanillin', 2, 'fickert1998'),
  ('malt_crystal', 'maltol', 3, 'rogner2021'),
  ('malt_chocolate', 'pyrazines', 4, 'own'),
  ('malt_chocolate', 'guaiacol', 2, 'fechir2021'),
  ('malt_chocolate', 'maltol', 2, 'rogner2021'),
  ('malt_roasted_barley', 'pyrazines', 5, 'own'),
  ('malt_roasted_barley', 'guaiacol', 3, 'fechir2021'),
  ('malt_black', 'pyrazines', 4, 'own'),
  ('malt_black', 'guaiacol', 3, 'fechir2021'),
  ('allspice', 'eugenol', 5, 'nabney1972'),
  ('allspice', 'methyl_eugenol', 2, 'nabney1972'),
  ('allspice', 'caryophyllene', 2, 'nabney1972'),
  ('allspice', 'alpha_terpineol', 1, 'nabney1972'),
  ('allspice', 'cineole', 1, 'nabney1972'),
  ('allspice', 'p_cymene', 1, 'nabney1972'),
  ('allspice', 'alpha_phellandrene', 1, 'nabney1972'),
  ('licorice', 'gamma_nonalactone', 3, 'wagner2016'),
  ('licorice', 'furaneol', 3, 'wagner2016'),
  ('licorice', 'vanillin', 3, 'wagner2016'),
  ('licorice', 'linalool', 2, 'wagner2016'),
  ('licorice', 'carvacrol', 2, 'wagner2016'),
  ('licorice', 'nonadienal', 2, 'wagner2016'),
  ('licorice', 'anethole', 3, 'chemworld2016'),
  ('licorice', 'estragole', 2, 'chemworld2016'),
  ('licorice', 'eugenol', 2, 'chemworld2016'),
  ('licorice', 'cineole', 2, 'chemworld2016'),
  ('elderflower', 'rose_oxide', 4, 'jorgensen2000'),
  ('elderflower', 'hotrienol', 3, 'jorgensen2000'),
  ('elderflower', 'linalool', 3, 'jorgensen2000'),
  ('elderflower', 'alpha_terpineol', 2, 'jorgensen2000'),
  ('elderflower', 'nonanal', 2, 'jorgensen2000'),
  ('elderflower', 'damascenone', 2, 'jorgensen2000'),
  ('elderflower', 'hexanal', 1, 'jorgensen2000'),
  ('spruce', 'bornyl_acetate', 4, 'orav1998'),
  ('spruce', 'camphene', 4, 'orav1998'),
  ('spruce', 'delta3_carene', 3, 'orav1998'),
  ('spruce', 'alpha_pinene', 3, 'orav1998'),
  ('spruce', 'limonene', 2, 'orav1998'),
  ('spruce', 'beta_phellandrene', 2, 'orav1998'),
  ('spruce', 'beta_pinene', 1, 'orav1998'),
  ('spruce', 'borneol', 1, 'orav1998'),
  ('spruce', 'caryophyllene', 1, 'orav1998'),
  ('spruce', 'terpinolene', 1, 'orav1998'),
  ('lime', 'limonene', 5, 'haro1985'),
  ('lime', 'gamma_terpinene', 3, 'haro1985'),
  ('lime', 'beta_pinene', 3, 'haro1985'),
  ('lime', 'citral', 4, 'haro1985'),
  ('lime', 'sabinene', 1, 'haro1985'),
  ('lime', 'alpha_pinene', 1, 'haro1985'),
  ('lime', 'myrcene', 1, 'haro1985'),
  ('kaffir_lime', 'citronellal', 5, 'moreuil1973'),
  ('kaffir_lime', 'sabinene', 2, 'moreuil1973'),
  ('kaffir_lime', 'linalool', 4, 'moreuil1973'),
  ('kaffir_lime', 'beta_pinene', 1, 'moreuil1973'),
  ('kaffir_lime', 'myrcene', 1, 'moreuil1973'),
  ('kaffir_lime', 'gamma_terpinene', 1, 'moreuil1973'),
  ('yuzu', 'limonene', 5, 'njoroge1994'),
  ('yuzu', 'gamma_terpinene', 2, 'njoroge1994'),
  ('yuzu', 'myrcene', 1, 'njoroge1994'),
  ('yuzu', 'alpha_pinene', 1, 'njoroge1994'),
  ('yuzu', 'linalool', 3, 'njoroge1994'),
  ('sweet_gale', 'alpha_pinene', 4, 'loziene2023'),
  ('sweet_gale', 'limonene', 3, 'loziene2023'),
  ('sweet_gale', 'cineole', 3, 'loziene2023'),
  ('sweet_gale', 'delta_cadinene', 2, 'loziene2023'),
  ('sweet_gale', 'nerolidol', 2, 'loziene2023'),
  ('cacao_nibs', 'methylbutanal', 4, 'frauendorfer2006'),
  ('cacao_nibs', 'pyrazines', 4, 'frauendorfer2006'),
  ('cacao_nibs', 'furaneol', 3, 'frauendorfer2006'),
  ('cacao_nibs', 'phenylacetaldehyde', 3, 'frauendorfer2006'),
  ('coffee', 'furfurylthiol', 5, 'grosch_coffee'),
  ('coffee', 'pyrazines', 4, 'grosch_coffee'),
  ('coffee', 'guaiacol', 3, 'grosch_coffee'),
  ('coffee', 'damascenone', 3, 'grosch_coffee'),
  ('coffee', 'furaneol', 3, 'grosch_coffee'),
  ('coffee', 'vinylguaiacol', 2, 'grosch_coffee'),
  ('coffee', 'vanillin', 2, 'grosch_coffee'),
  ('jalapeno', 'ibmp', 5, 'azcarate2010'),
  ('jalapeno', 'hexenal', 3, 'azcarate2010'),
  ('jalapeno', 'hexanal', 2, 'azcarate2010'),
  ('jalapeno', 'nonadienal', 2, 'azcarate2010')
ON CONFLICT (ingredient_id, compound_id) DO UPDATE SET intensity = EXCLUDED.intensity, source_id = EXCLUDED.source_id;

INSERT INTO flavour_meta (key, value) VALUES ('version', '2026-11-14') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
