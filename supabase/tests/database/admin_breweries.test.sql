-- App admin sees all breweries and deletes one with everything under it
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

-- Brewery A (to delete): admin a1, brewer a2. Brewery B: admin b1. App admin f1 (own brewery F).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'app-admin@test.local');
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000f1';
UPDATE breweries SET name = 'Brouwerij A' WHERE id = (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b1') AS brewery_b,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000f1') AS brewery_f;
GRANT SELECT ON t TO authenticated;

-- a2 joins brewery A as brewer
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local');
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer' WHERE id = '00000000-0000-0000-0000-0000000000a2';

-- Brewery A's data
INSERT INTO recipes (id, data, user_id, brewery_id, status) SELECT 'ra1', '{"name":"Eigen tripel"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'private' FROM t;
INSERT INTO recipes (id, data, user_id, brewery_id, status) SELECT 'ra2', '{"name":"Ingediend"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'submitted' FROM t;
INSERT INTO recipes (id, data, user_id, brewery_id, status) SELECT 'ra3', '{"name":"Publieke saison"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;
INSERT INTO hops (id, data, user_id, brewery_id, status) SELECT 'ha1', '{"name":"Saaz"}', '00000000-0000-0000-0000-0000000000a2', brewery_a, 'private' FROM t;
INSERT INTO brew_logs (id, data, user_id, brewery_id) SELECT 'la1', '{"recipeId":"ra1"}', '00000000-0000-0000-0000-0000000000a2', brewery_a FROM t;
INSERT INTO tasting_notes (id, data, user_id, brewery_id) SELECT 'na1', '{"brewLogId":"la1"}', '00000000-0000-0000-0000-0000000000a2', brewery_a FROM t;
INSERT INTO invitations (brewery_id, role, email, code) SELECT brewery_a, 'brewer', 'x@test.local', 'CODEA123' FROM t;
-- Something a2 made earlier in brewery B stays there
INSERT INTO recipes (id, data, user_id, brewery_id, status) SELECT 'rb1', '{"name":"Van B"}', '00000000-0000-0000-0000-0000000000a2', brewery_b, 'private' FROM t;

-- Others cannot list or delete
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM admin_breweries()$$, '42501', NULL, 'a brewery admin cannot list all breweries');
SELECT throws_ok($$SELECT admin_delete_brewery((SELECT brewery_a FROM t), 'Brouwerij A')$$, '42501', NULL, 'a brewery admin cannot delete a brewery');
RESET ROLE;

-- The app admin
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT member_count FROM admin_breweries() WHERE id = (SELECT brewery_a FROM t)), 2::bigint, 'the list counts the members');
SELECT is((SELECT recipe_count FROM admin_breweries() WHERE id = (SELECT brewery_a FROM t)), 2::bigint, 'the list counts the own recipes');
SELECT is((SELECT admins FROM admin_breweries() WHERE id = (SELECT brewery_a FROM t)), ARRAY['a1@test.local'], 'the list shows the brewery admins');
SELECT throws_ok($$SELECT admin_delete_brewery((SELECT brewery_a FROM t), 'Brouwerij B')$$, '22023', NULL, 'the name must match');
SELECT throws_ok($$SELECT admin_delete_brewery((SELECT brewery_f FROM t), (SELECT name FROM breweries WHERE id = (SELECT brewery_f FROM t)))$$, '42501', NULL, 'not your own brewery');
SELECT lives_ok($$SELECT admin_delete_brewery((SELECT brewery_a FROM t), ' Brouwerij A ')$$, 'the app admin deletes brewery A');
RESET ROLE;

SELECT is((SELECT count(*) FROM breweries WHERE id = (SELECT brewery_a FROM t)), 0::bigint, 'the brewery is gone');
SELECT is((SELECT count(*) FROM auth.users WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2')), 0::bigint, 'the members'' accounts are gone');
SELECT is((SELECT count(*) FROM profiles WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2')), 0::bigint, 'their profiles are gone');
SELECT is((SELECT count(*) FROM recipes WHERE id IN ('ra1', 'ra2')), 0::bigint, 'own and submitted recipes are gone');
SELECT is((SELECT count(*) FROM hops WHERE id = 'ha1'), 0::bigint, 'own ingredients are gone');
SELECT is((SELECT count(*) FROM brew_logs WHERE id = 'la1') + (SELECT count(*) FROM tasting_notes WHERE id = 'na1'), 0::bigint, 'brews and tasting notes are gone');
SELECT is((SELECT count(*) FROM invitations WHERE code = 'CODEA123'), 0::bigint, 'invitations are gone');
SELECT is((SELECT status FROM recipes WHERE id = 'ra3'), 'approved', 'the public recipe stays');
SELECT is((SELECT user_id FROM recipes WHERE id = 'ra3'), '00000000-0000-0000-0000-0000000000f1'::uuid, 'it is now the app admin''s');
SELECT is((SELECT brewery_id FROM recipes WHERE id = 'rb1'), (SELECT brewery_b FROM t), 'what a member made in brewery B stays there');
SELECT is((SELECT user_id FROM recipes WHERE id = 'rb1'), NULL::uuid, '... without a maker');
SELECT is((SELECT count(*) FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b1'), 1::bigint, 'other breweries are untouched');

SELECT * FROM finish();
ROLLBACK;
