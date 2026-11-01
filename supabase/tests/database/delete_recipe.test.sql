-- Deleting a recipe with its brews and tasting notes (#106)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- a1: admin of brewery A; a2: taster in A; c1: admin of brewery C
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'taster-a@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin-c@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000c1') AS brewery_c;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'taster'
  WHERE id = '00000000-0000-0000-0000-0000000000a2';

-- r1: two brews with a tasting note each; r2: no brews; r3: approved, brewed by brewery C
INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT id, jsonb_build_object('name', name), '00000000-0000-0000-0000-0000000000a1', brewery_a, status
  FROM t, (VALUES ('r1', 'Tripel', 'private'), ('r2', 'Wit', 'private'), ('r3', 'Saison', 'approved')) v(id, name, status);
INSERT INTO brew_logs (id, data, user_id, brewery_id)
  SELECT v.id, v.data::jsonb, v.user_id::uuid, CASE v.brewery WHEN 'a' THEN brewery_a ELSE brewery_c END
  FROM t, (VALUES
    ('b1', '{"recipeId":"r1"}', '00000000-0000-0000-0000-0000000000a1', 'a'),
    ('b2', '{"recipeId":"r1"}', '00000000-0000-0000-0000-0000000000a1', 'a'),
    ('b3', '{"recipeId":"r3"}', '00000000-0000-0000-0000-0000000000c1', 'c')
  ) v(id, data, user_id, brewery);
INSERT INTO tasting_notes (id, data, user_id, brewery_id)
  SELECT v.id, v.data::jsonb, v.user_id::uuid, brewery_a
  FROM t, (VALUES
    ('n1', '{"brewLogId":"b1","recipeId":"r1"}', '00000000-0000-0000-0000-0000000000a2'),
    ('n2', '{"brewLogId":"b2","recipeId":"r1"}', '00000000-0000-0000-0000-0000000000a1')
  ) v(id, data, user_id);

-- A taster may not delete recipes
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.delete_recipe('r2')$$, '42501', 'Not allowed to delete this recipe',
  'a taster cannot delete a recipe');
RESET ROLE;

-- Admin of another brewery may not delete them either
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.delete_recipe('r2')$$, '42501', 'Not allowed to delete this recipe',
  'an admin of another brewery cannot delete the recipe');
SELECT is(public.recipe_dependents('r1'), '{"brews":0,"notes":0,"foreign":0}'::jsonb,
  'another brewery learns nothing about a private recipe');
RESET ROLE;

-- Brewery admin
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.recipe_dependents('r1'), '{"brews":2,"notes":2,"foreign":0}'::jsonb,
  'recipe_dependents counts the brews and their tasting notes');
SELECT throws_ok($$SELECT public.delete_recipe('r1')$$, 'P0001', 'Recipe has brews',
  'without consent a recipe with brews is not deleted');
SELECT is((SELECT count(*)::int FROM brew_logs WHERE data->>'recipeId' = 'r1'), 2, 'its brews are still there');
SELECT is(public.delete_recipe('r1', true), '{"brews":2,"notes":2}'::jsonb,
  'with consent the recipe, its brews and their notes are deleted');
SELECT is((SELECT count(*)::int FROM recipes WHERE id = 'r1'), 0, 'the recipe is gone');
SELECT is((SELECT count(*)::int FROM brew_logs WHERE id IN ('b1', 'b2')), 0, 'its brews are gone');
SELECT is((SELECT count(*)::int FROM tasting_notes WHERE id IN ('n1', 'n2')), 0, 'their tasting notes are gone');
SELECT is(public.delete_recipe('r2'), '{"brews":0,"notes":0}'::jsonb, 'a recipe without brews is deleted as before');
SELECT is((public.recipe_dependents('r3')->>'foreign')::int, 1, 'brews of another brewery are counted as foreign');
SELECT throws_ok($$SELECT public.delete_recipe('r3', true)$$, 'P0001', 'Recipe is used by brews of another brewery',
  'a recipe brewed by another brewery is never deleted');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM brew_logs WHERE id = 'b3'), 1, 'the other brewery''s brew is untouched');

SELECT * FROM finish();
ROLLBACK;
