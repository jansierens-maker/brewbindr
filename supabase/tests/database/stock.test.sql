-- Stock in its own table (#137)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- Brewery A: a1 admin, a2 brewmaster, a3 brewer, a4 taster; b1 admin of brewery B
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'master-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'brewer-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'taster-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewmaster' WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer' WHERE id = '00000000-0000-0000-0000-0000000000a3';
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'taster' WHERE id = '00000000-0000-0000-0000-0000000000a4';

-- The previous app version writes the stock in the data JSON: it lands in the table
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h1', '{"name":"Saaz","stock":{"amount":100,"unit":"g","stock_target":250}}', auth.uid(), brewery_a, 'private' FROM t;
SELECT results_eq($$SELECT amount, unit, target FROM stock WHERE ingredient_id = 'h1'$$,
  $$VALUES (100::numeric, 'g'::text, 250::numeric)$$, 'stock in the data JSON is copied into the table');
UPDATE hops SET data = '{"name":"Saaz","stock":{"amount":80,"unit":"g"}}' WHERE id = 'h1';
SELECT is((SELECT amount FROM stock WHERE ingredient_id = 'h1'), 80::numeric, 'and kept in sync');
UPDATE hops SET data = '{"name":"Saaz (new app)"}' WHERE id = 'h1';
SELECT is((SELECT amount FROM stock WHERE ingredient_id = 'h1'), 80::numeric, 'a row saved without stock keeps the table stock');

-- The brewmaster changes the stock in the table
SELECT lives_ok($$UPDATE stock SET amount = 60 WHERE ingredient_id = 'h1'$$, 'a brewmaster changes the stock');
SELECT is((SELECT updated_by FROM stock WHERE ingredient_id = 'h1'), auth.uid(), 'updated_by is the caller');
SELECT lives_ok($$INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit) SELECT 'fermentable', 'f1', brewery_a, 5, 'kg' FROM t$$,
  'a brewmaster adds stock');
RESET ROLE;

-- The brewer reads, but cannot change it
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM stock), 2::bigint, 'a brewer reads the stock');
UPDATE stock SET amount = 0 WHERE ingredient_id = 'h1';
SELECT is((SELECT amount FROM stock WHERE ingredient_id = 'h1'), 60::numeric, 'a brewer cannot change the stock');
SELECT throws_ok($$INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit) SELECT 'hop', 'h9', brewery_a, 1, 'g' FROM t$$,
  '42501', NULL, 'a brewer cannot add stock');
RESET ROLE;

-- The taster does not see it
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM stock), 0::bigint, 'a taster does not read the stock');
RESET ROLE;

-- Another brewery neither
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM stock), 0::bigint, 'another brewery does not read the stock');
SELECT throws_ok($$INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit) SELECT 'hop', 'h1x', brewery_a, 1, 'g' FROM t$$,
  '42501', NULL, 'another brewery cannot add stock to brewery A');
RESET ROLE;

-- A public copy has no stock; deleting the ingredient removes its stock
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'h2', '{"name":"Saaz (public)","stock":{"amount":5,"unit":"g"}}', auth.uid(), brewery_a, 'submitted' FROM t;
SELECT is((SELECT count(*) FROM stock WHERE ingredient_id = 'h2'), 0::bigint, 'a submitted copy gets no stock');
DELETE FROM hops WHERE id = 'h1';
SELECT is((SELECT count(*) FROM stock WHERE ingredient_id = 'h1'), 0::bigint, 'deleting the ingredient removes its stock');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
