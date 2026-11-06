-- Submitting to the public library (#138): only the brewery admin
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

-- Brewery A: a1 admin, a2 brewmaster, a3 brewer; f1 is the app admin
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

-- The brewmaster
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r1', '{"name":"Blond"}', auth.uid(), brewery_a, 'private' FROM t$$,
  'a brewmaster creates a private recipe');
SELECT lives_ok($$UPDATE recipes SET data = '{"name":"Blond 2"}' WHERE id = 'r1'$$,
  'a brewmaster changes a private recipe');
SELECT throws_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r2', '{"name":"Blond (public)"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  '42501', 'Only the brewery admin can submit to the public library',
  'a brewmaster cannot submit a recipe');
SELECT throws_ok($$UPDATE recipes SET status = 'submitted' WHERE id = 'r1'$$,
  '42501', 'Only the brewery admin can submit to the public library',
  'a brewmaster cannot turn a recipe into a submission');
SELECT throws_ok(
  $$INSERT INTO hops (id, data, user_id, brewery_id, status)
    SELECT 'h2', '{"name":"Saaz"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  '42501', 'Only the brewery admin can submit to the public library',
  'a brewmaster cannot submit an ingredient');
SELECT lives_ok(
  $$INSERT INTO hops (id, data, user_id, brewery_id, status)
    SELECT 'h1', '{"name":"Saaz"}', auth.uid(), brewery_a, 'private' FROM t$$,
  'a brewmaster adds a private ingredient');
RESET ROLE;

-- The brewery admin
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r3', '{"name":"Blond (public)"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  'the brewery admin submits a recipe');
SELECT lives_ok(
  $$INSERT INTO hops (id, data, user_id, brewery_id, status)
    SELECT 'h3', '{"name":"Saaz (public)"}', auth.uid(), brewery_a, 'submitted' FROM t$$,
  'the brewery admin submits an ingredient');
RESET ROLE;

-- The brewmaster cannot withdraw it either
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$UPDATE recipes SET status = 'private' WHERE id = 'r3'$$,
  '42501', 'Only the brewery admin can submit to the public library',
  'a brewmaster cannot take a submission back');
RESET ROLE;

-- The app admin approves, as before
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE recipes SET status = 'approved' WHERE id = 'r3'$$,
  'the app admin approves a submission');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
