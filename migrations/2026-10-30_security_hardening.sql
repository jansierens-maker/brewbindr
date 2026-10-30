-- Security hardening (2026-10-30)
-- Idempotent: safe to run more than once, and also included in the full setup script.
--
-- 1. Users could change their own brewery_id / brewery_role through the API and so
--    join any brewery as admin. Brewery membership can now only change through the
--    signup trigger, the join_brewery / remove_brewery_member functions, or an app admin.
-- 2. Trigger functions were callable through the REST API (/rest/v1/rpc/...).

-- Guard profile changes made directly by app users (roles anon/authenticated).
-- SECURITY DEFINER functions (signup trigger, RPCs below) run as the function owner,
-- so their own updates pass this check.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_update ON profiles;
CREATE TRIGGER on_profile_update
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

-- Join a brewery with an invite code (for users without a brewery).
CREATE OR REPLACE FUNCTION public.join_brewery(invite_code TEXT)
RETURNS UUID AS $$
DECLARE
  inv RECORD;
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

  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND brewery_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You are already part of a brewery';
  END IF;

  UPDATE profiles SET brewery_id = inv.brewery_id, brewery_role = inv.role WHERE id = auth.uid();
  DELETE FROM invitations WHERE code = upper(trim(invite_code));
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
