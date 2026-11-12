-- App admins edit public items in place (#169); others cannot
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'app-admin@test.local');
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000f1';
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;

-- Public items of brewery A (approved as the database owner would after review)
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h1', '{"name":"Saaz","alpha":3.5}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h2', '{"name":"Citra","alpha":12}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;
INSERT INTO equipment (id, data, user_id, brewery_id, status)
  SELECT 'e1', '{"name":"Testkit"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;
INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT 'r1', '{"name":"Tripel"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;

-- The brewery admin who submitted them cannot change them any more
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$UPDATE hops SET data = '{"name":"Saaz","alpha":4}' WHERE id = 'h1'$$,
  '42501', NULL, 'a brewery admin cannot change a public item');
RESET ROLE;

-- The app admin edits them; owner, brewery and status stay
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE hops SET data = '{"name":"Saaz","alpha":4}', user_id = user_id, brewery_id = brewery_id, status = 'approved' WHERE id = 'h1'$$,
  'the app admin edits a public hop');
SELECT lives_ok($$UPDATE equipment SET data = '{"name":"Testkit","batch_size":23}' WHERE id = 'e1'$$, 'the app admin edits a public installation');
SELECT lives_ok($$UPDATE recipes SET data = '{"name":"Tripel","notes":"fixed"}' WHERE id = 'r1'$$, 'the app admin edits a public recipe');
SELECT throws_ok($$UPDATE hops SET data = '{"name":"CITRA "}' WHERE id = 'h1'$$,
  '23505', NULL, 'a public name still exists once');
RESET ROLE;

SELECT results_eq(
  $$SELECT data->>'alpha', user_id::text, brewery_id = (SELECT brewery_a FROM t), status FROM hops WHERE id = 'h1'$$,
  $$VALUES ('4'::text, '00000000-0000-0000-0000-0000000000a1'::text, true, 'approved'::text)$$,
  'the edit keeps owner, brewery and status');
SELECT is((SELECT data->>'notes' FROM recipes WHERE id = 'r1'), 'fixed', 'the recipe edit is stored');

SELECT * FROM finish();
ROLLBACK;
