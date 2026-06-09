-- 1. Create Breweries table
CREATE TABLE IF NOT EXISTS breweries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Update Profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_role TEXT CHECK (brewery_role IN ('admin', 'brewmaster', 'brewer', 'taster'));

-- 3. Create Invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'brewmaster', 'brewer', 'taster')),
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

-- 4. Add brewery_id to all data tables
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE brew_logs ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE tasting_notes ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE fermentables ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE hops ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE styles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE miscs ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE mash_profiles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE waters ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);

-- 5. Helper Functions for RLS
CREATE OR REPLACE FUNCTION get_user_brewery_id() RETURNS UUID AS $$
  SELECT brewery_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_brewery_role() RETURNS TEXT AS $$
  SELECT brewery_role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Enable RLS on new tables
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Breweries
CREATE POLICY "Members can view their brewery" ON breweries
  FOR SELECT USING (id = get_user_brewery_id());

CREATE POLICY "Admins can update brewery" ON breweries
  FOR UPDATE USING (id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- 8. RLS Policies for Invitations
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- 9. Update existing data tables RLS Policies
-- We need to DROP old policies and CREATE new ones that check for brewery_id

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables)
  LOOP
    -- Everyone can read approved items (if applicable)
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow read approved %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'');', t, t);
    END IF;

    -- Drop old user-only policy
    EXECUTE format('DROP POLICY IF EXISTS "Allow user manage own %I" ON %I;', t, t);

    -- SELECT: Any member of the brewery
    EXECUTE format('CREATE POLICY "Allow brewery members read %I" ON %I FOR SELECT USING (brewery_id = get_user_brewery_id());', t, t);

    -- INSERT/UPDATE/DELETE based on roles
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters') THEN
      -- admin and brewmaster can manage
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster''));', t, t);
    ELSIF t = 'brew_logs' THEN
      -- admin, brewmaster, brewer can manage
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster/brewer manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'', ''brewer''));', t, t);
    ELSIF t = 'tasting_notes' THEN
      -- everyone in brewery can manage
      EXECUTE format('CREATE POLICY "Allow brewery members manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id());', t, t);
    END IF;

    -- Admins of the app (global role) can still do everything
    EXECUTE format('CREATE POLICY "Allow global admin manage %I" ON %I FOR ALL USING (is_admin());', t, t);
  END LOOP;
END $$;

-- 10. Migration for existing users: Create a default brewery for each user and link their data
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
    UPDATE recipes SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE brew_logs SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE tasting_notes SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE fermentables SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE hops SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE cultures SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE styles SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE miscs SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE mash_profiles SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE equipment SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
    UPDATE waters SET brewery_id = new_brewery_id WHERE user_id = u_record.id;
  END LOOP;
END $$;
