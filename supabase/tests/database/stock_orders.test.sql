-- Stock orders (ordered, ordered_at)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

SELECT has_column('public', 'stock', 'ordered', 'stock has an ordered amount');
SELECT has_column('public', 'stock', 'ordered_at', 'stock has an order date');

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c1', 'admin-c@test.local');
CREATE TEMP TABLE t AS SELECT (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000c1') AS brewery_c;
GRANT SELECT ON t TO authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO hops (id, data, user_id, brewery_id, status)
  SELECT 'oh1', '{"name":"Citra"}', auth.uid(), brewery_c, 'private' FROM t;
INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target, ordered, ordered_at)
  SELECT 'hop', 'oh1', brewery_c, 50, 'g', 200, 500, '2026-11-20' FROM t;
SELECT results_eq($$SELECT ordered, ordered_at FROM stock WHERE ingredient_id = 'oh1'$$,
  $$VALUES (500::numeric, '2026-11-20'::date)$$, 'the brewery admin records an order');

SELECT throws_ok($$UPDATE stock SET ordered = 0 WHERE ingredient_id = 'oh1'$$, '23514', NULL, 'an order is more than nothing');

-- An upsert without the order columns (previous app version) keeps the order
INSERT INTO stock (ingredient_type, ingredient_id, brewery_id, amount, unit, target)
  SELECT 'hop', 'oh1', brewery_c, 80, 'g', 200 FROM t
  ON CONFLICT (ingredient_type, ingredient_id) DO UPDATE SET amount = EXCLUDED.amount, unit = EXCLUDED.unit, target = EXCLUDED.target;
SELECT results_eq($$SELECT amount, ordered FROM stock WHERE ingredient_id = 'oh1'$$,
  $$VALUES (80::numeric, 500::numeric)$$, 'an update without the order columns leaves the order');

UPDATE stock SET ordered = NULL, ordered_at = NULL WHERE ingredient_id = 'oh1';
SELECT is((SELECT ordered FROM stock WHERE ingredient_id = 'oh1'), NULL, 'a delivered order is cleared');

SELECT * FROM finish();
ROLLBACK;
