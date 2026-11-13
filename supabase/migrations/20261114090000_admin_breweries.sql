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
