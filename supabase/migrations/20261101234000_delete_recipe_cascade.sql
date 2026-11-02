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
