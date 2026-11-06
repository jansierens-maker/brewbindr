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
