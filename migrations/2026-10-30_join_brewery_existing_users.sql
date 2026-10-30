-- Let existing users join another brewery with an invite code (2026-10-30)
-- Idempotent: safe to run more than once, and also included in the full setup script.
--
-- Every user gets their own brewery at signup, so join_brewery() used to refuse
-- everyone who was not signing up. Now a user who is the only member of their
-- current brewery can join another one: their recipes, brew logs, tasting notes
-- and library items move along, and the empty old brewery is removed.
-- Users in a brewery with other members still have to be removed from it first.

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

REVOKE EXECUTE ON FUNCTION public.join_brewery(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_brewery(TEXT) TO authenticated;
