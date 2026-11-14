-- Flavour Lab: the knowledge base is read-only for everyone; links are per brewery
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- Brewery A: admin a1, brewer a2, taster a3. Brewery B: admin b1.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b1') AS brewery_b;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer' WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'taster' WHERE id = '00000000-0000-0000-0000-0000000000a3';

-- The seed data
SELECT ok((SELECT count(*) FROM flavour_ingredients) >= 100, 'the knowledge base holds the seed ingredients');
SELECT is((SELECT count(*) FROM flavour_ingredient_compounds WHERE source_id IS NULL), 0::bigint, 'every link has a source (AC-11)');
SELECT throws_ok(
  $$INSERT INTO flavour_ingredient_compounds (ingredient_id, compound_id, intensity, source_id) VALUES ('coriander', 'eugenol', 2, NULL)$$,
  '23502', NULL, 'a link without source is refused');
SELECT throws_ok(
  $$INSERT INTO flavour_ingredient_compounds (ingredient_id, compound_id, intensity, source_id) VALUES ('coriander', 'eugenol', 6, 'own')$$,
  '23514', NULL, 'intensity is 0 to 5');

-- Anyone reads, nobody writes the knowledge base
SET LOCAL ROLE anon;
SELECT ok((SELECT count(*) FROM flavour_compounds) > 0, 'anon reads the compounds');
SELECT throws_ok($$UPDATE flavour_ingredients SET name_nl = 'x' WHERE id = 'coriander'$$, '42501', NULL, 'anon cannot change the knowledge base');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$DELETE FROM flavour_ingredient_compounds$$, '42501', NULL, 'a brewery admin cannot change the knowledge base');
RESET ROLE;

-- Links: the brewer adds one for the brewery
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO flavour_mappings (brewery_id, category, name_key, ingredient_id, created_by)
    SELECT brewery_a, 'hop', 'hallertauer mf', 'hallertau_mittelfrueh', '00000000-0000-0000-0000-0000000000a2' FROM t$$,
  'a brewer links a recipe name');
SELECT lives_ok(
  $$INSERT INTO flavour_mappings (brewery_id, category, name_key, ingredient_id) SELECT brewery_a, 'malt', 'kandijsuiker', NULL FROM t$$,
  'a name can be left out (no ingredient)');
SELECT throws_ok(
  $$INSERT INTO flavour_mappings (brewery_id, category, name_key, ingredient_id) SELECT brewery_b, 'hop', 'x', 'citra' FROM t$$,
  '42501', NULL, 'not for another brewery');
RESET ROLE;

-- The taster reads, but does not change
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM flavour_mappings), 2::bigint, 'members read the brewery links');
SELECT throws_ok(
  $$INSERT INTO flavour_mappings (brewery_id, category, name_key, ingredient_id) SELECT brewery_a, 'hop', 'y', 'citra' FROM t$$,
  '42501', NULL, 'a taster cannot add links');
RESET ROLE;

-- Another brewery sees nothing
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM flavour_mappings), 0::bigint, 'another brewery does not see the links');
UPDATE flavour_mappings SET ingredient_id = 'citra';
RESET ROLE;
SELECT is((SELECT ingredient_id FROM flavour_mappings WHERE name_key = 'hallertauer mf'), 'hallertau_mittelfrueh', 'and cannot change them');

SELECT * FROM finish();
ROLLBACK;
