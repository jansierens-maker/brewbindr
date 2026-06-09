-- 1. Create/Update Tables Idempotently
CREATE TABLE IF NOT EXISTS breweries (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'My Brewery';
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE breweries ALTER COLUMN name DROP DEFAULT;

CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_role TEXT CHECK (brewery_role IN ('admin', 'brewmaster', 'brewer', 'taster'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"units": "metric", "colorScale": "srm", "language": "en"}'::jsonb;

CREATE TABLE IF NOT EXISTS invitations (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL CHECK (role IN ('admin', 'brewmaster', 'brewer', 'taster'));
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

-- Helper Functions for RLS
CREATE OR REPLACE FUNCTION get_user_brewery_id() RETURNS UUID AS $$
  SELECT brewery_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_brewery_role() RETURNS TEXT AS $$
  SELECT brewery_role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Policies for invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- RLS Policies for Data Tables
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
