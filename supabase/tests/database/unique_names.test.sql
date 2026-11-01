-- Unique names: private once per brewery, public once in total (recipes and library)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

-- Two users; the signup trigger gives each their own brewery
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-00000000000a') AS brewery_a,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-00000000000b') AS brewery_b;

SELECT isnt((SELECT brewery_a FROM t), (SELECT brewery_b FROM t), 'each new user gets their own brewery');

INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT 'r1', '{"name":"Dry Stout"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'private' FROM t;

SELECT throws_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r2', '{"name":"  dry   STOUT "}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'private' FROM t$$,
  '23505', NULL, 'same recipe name (other case/spaces) in the same brewery is refused');

SELECT lives_ok(
  $$INSERT INTO recipes (id, data, user_id, brewery_id, status)
    SELECT 'r3', '{"name":"Dry Stout"}', '00000000-0000-0000-0000-00000000000b', brewery_b, 'private' FROM t$$,
  'same recipe name in another brewery is allowed');

INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT 'r4', '{"name":"Dry Stout"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'approved' FROM t;

SELECT throws_ok(
  $$INSERT INTO recipes (id, data, status) VALUES ('r5', '{"name":"DRY STOUT"}', 'approved')$$,
  '23505', NULL, 'a second public recipe with the same name is refused');

UPDATE recipes SET status = 'private' WHERE id = 'r4';
SELECT is((SELECT data->>'name' FROM recipes WHERE id = 'r4'), 'Dry Stout (2)',
  'a recipe removed from public gets a free name');

-- Library tables follow the same rules (per table = per type)
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h1', '{"name":"Cascade","type":"hop"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'private' FROM t;

SELECT throws_ok(
  $$INSERT INTO hops (id, data, user_id, brewery_id, status)
    SELECT 'h2', '{"name":"CASCADE","type":"hop"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'private' FROM t$$,
  '23505', NULL, 'same hop name in the same brewery is refused');

SELECT lives_ok(
  $$INSERT INTO fermentables (id, data, user_id, brewery_id, status)
    SELECT 'f1', '{"name":"Cascade","type":"fermentable"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'private' FROM t$$,
  'the same name for another type is allowed');

INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h3', '{"name":"Cascade","type":"hop"}', '00000000-0000-0000-0000-00000000000a', brewery_a, 'submitted' FROM t;
UPDATE hops SET status = 'private' WHERE id = 'h3';
SELECT is((SELECT data->>'name' FROM hops WHERE id = 'h3'), 'Cascade (2)',
  'a rejected submission gets a free name');

SELECT is(public.name_key('  Burton   ALE '), 'burton ale', 'name_key ignores case and extra spaces');

SELECT * FROM finish();
ROLLBACK;
