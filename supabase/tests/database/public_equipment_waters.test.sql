-- Brewing installations and water profiles in the public library
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

-- Brewery A: a1 admin, a2 brewmaster; b1 admin of brewery B; f1 is the app admin
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'master-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'app-admin@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewmaster'
  WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000f1';

-- The brewmaster: private rows yes, submissions no
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO equipment (id, data, user_id, brewery_id) SELECT 'e1', '{"name":"Testkit"}', auth.uid(), brewery_a FROM t$$,
  'a brewmaster adds an installation (private by default)');
SELECT is((SELECT status FROM equipment WHERE id = 'e1'), 'private', 'a row without status is private');
SELECT throws_ok(
  $$INSERT INTO waters (id, data, user_id, brewery_id, status) SELECT 'w0', '{"name":"Aalst"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  '42501', 'Only the brewery admin can submit to the public library',
  'a brewmaster cannot submit a water profile');
RESET ROLE;

-- The brewery admin submits, but cannot approve
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO equipment (id, data, user_id, brewery_id, status) SELECT 'e2', '{"name":"Testkit"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  'the brewery admin submits an installation');
SELECT lives_ok(
  $$INSERT INTO waters (id, data, user_id, brewery_id, status) SELECT 'w1', '{"name":"Aalst"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  'the brewery admin submits a water profile');
SELECT throws_ok($$UPDATE waters SET status = 'approved' WHERE id = 'w1'$$,
  '42501', NULL, 'the brewery admin cannot approve');
SELECT throws_ok($$UPDATE equipment SET status = 'banana' WHERE id = 'e1'$$,
  '23514', NULL, 'only known statuses');
RESET ROLE;

-- The app admin approves
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE equipment SET status = 'approved' WHERE id = 'e2'$$, 'the app admin approves an installation');
UPDATE waters SET status = 'approved' WHERE id = 'w1';
RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO equipment (id, data, user_id, brewery_id, status) SELECT 'e3', '{"name":"TESTKIT "}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t$$,
  '23505', NULL, 'one public installation per name');

-- Another brewery sees the public rows, not the private ones
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT results_eq($$SELECT id FROM equipment WHERE id NOT LIKE 'preset-%' ORDER BY id$$, ARRAY['e2'], 'another brewery reads only the approved installation');
SELECT results_eq($$SELECT id FROM waters ORDER BY id$$, ARRAY['w1'], 'another brewery reads the approved water profile');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
