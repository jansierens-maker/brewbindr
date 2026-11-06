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
