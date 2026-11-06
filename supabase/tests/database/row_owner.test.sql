-- Who made a row (#124): new rows are in the caller's name, updates keep the maker
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

-- Brewery A: a1 admin, a2 brewmaster, a3 brewer; g1 is the app admin (own brewery)
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'master-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'brewer-a@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'app-admin@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewmaster'
  WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer'
  WHERE id = '00000000-0000-0000-0000-0000000000a3';
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000f1';

-- The brewmaster tries to store a recipe in the admin's name
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r1', '{"name":"Blond"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'private' FROM t$$,
  'a brewmaster adds a recipe');
RESET ROLE;
SELECT is((SELECT user_id FROM recipes WHERE id = 'r1'), '00000000-0000-0000-0000-0000000000a2'::uuid,
  'a new row is always in the caller''s name');

-- The brewery admin edits it and tries to take it over
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
UPDATE recipes SET data = '{"name":"Blond 2"}', user_id = auth.uid() WHERE id = 'r1';
RESET ROLE;
SELECT is((SELECT data->>'name' FROM recipes WHERE id = 'r1'), 'Blond 2', 'the admin''s change is saved');
SELECT is((SELECT user_id FROM recipes WHERE id = 'r1'), '00000000-0000-0000-0000-0000000000a2'::uuid,
  'the recipe keeps its maker after someone else edits it');

-- Upsert as the app does it (insert ... on conflict update) keeps the maker too
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO brew_logs (id, data, user_id, brewery_id)
  SELECT 'b1', '{"recipeId":"r1"}', auth.uid(), brewery_a FROM t;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO brew_logs (id, data, user_id, brewery_id)
  SELECT 'b1', '{"recipeId":"r1","finished":true}', auth.uid(), brewery_a FROM t
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, user_id = EXCLUDED.user_id;
RESET ROLE;
SELECT is((SELECT data->>'finished' FROM brew_logs WHERE id = 'b1'), 'true', 'the upsert is saved');
SELECT is((SELECT user_id FROM brew_logs WHERE id = 'b1'), '00000000-0000-0000-0000-0000000000a3'::uuid,
  'an upsert by a colleague keeps the brewer');

-- Tasting notes are covered too
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO tasting_notes (id, data, user_id, brewery_id)
    SELECT 'n1', '{"brewLogId":"b1"}', auth.uid(), brewery_a FROM t$$,
  'a member adds a tasting note in their own name');
RESET ROLE;

-- The app admin may set any maker (e.g. when repairing data)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
UPDATE recipes SET user_id = '00000000-0000-0000-0000-0000000000a1' WHERE id = 'r1';
RESET ROLE;
SELECT is((SELECT user_id FROM recipes WHERE id = 'r1'), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the app admin can change the maker');

-- Server-side code (not anon/authenticated) is not affected
INSERT INTO hops (id, data, user_id, brewery_id)
  SELECT 'h1', '{"name":"Saaz"}', '00000000-0000-0000-0000-0000000000a1', brewery_a FROM t;
SELECT is((SELECT user_id FROM hops WHERE id = 'h1'), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'server-side inserts keep the given maker');

SELECT * FROM finish();
ROLLBACK;
