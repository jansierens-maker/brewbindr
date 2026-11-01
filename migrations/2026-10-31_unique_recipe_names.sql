-- Unique recipe names (2026-10-31)
-- Idempotent: safe to run more than once, and also included in the full setup script.
--
-- * Private recipes: a name can be used once per brewery.
-- * Public library (approved): a name can be used once in total.
-- Names are compared case-insensitively, ignoring extra spaces.
-- When a recipe becomes private again (rejected, removed from public) or moves to
-- another brewery (join_brewery), a taken name gets a suffix: "Burton Ale (2)".
-- Saving a new or renamed recipe with a taken name is refused (unique violation).

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
