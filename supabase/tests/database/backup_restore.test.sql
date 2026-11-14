-- Backup and restore: per brewery (brewery admin) and full (app admin)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'app-admin@test.local');
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000f1';
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a2', 'brewer-a@test.local');
CREATE TEMP TABLE t AS SELECT (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer' WHERE id = '00000000-0000-0000-0000-0000000000a2';

INSERT INTO recipes (id, data, user_id, brewery_id, status) SELECT 'r1', '{"name":"Tripel","notes":"old"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'private' FROM t;
INSERT INTO hops (id, data, user_id, brewery_id, status) SELECT 'h-pub', '{"name":"Publieke hop"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'approved' FROM t;

CREATE TEMP TABLE backup AS SELECT '{
  "recipes": [{"id":"r1","data":{"name":"Tripel","notes":"restored"},"status":"private"},
              {"id":"r2","data":{"name":"Dubbel"},"status":"approved"}],
  "hops": [{"id":"h1","data":{"name":"Saaz","alpha":3.5},"status":"private"},
           {"id":"h-pub","data":{"name":"Publieke hop","alpha":99},"status":"private"}],
  "brew_logs": [{"id":"l1","data":{"recipeId":"r1"}}],
  "tasting_notes": [{"id":"n1","data":{"brewLogId":"l1"}}],
  "stock": [{"ingredient_type":"hop","ingredient_id":"h1","amount":100,"unit":"g","target":50}]
}'::jsonb AS tables;
GRANT SELECT ON backup TO authenticated;

-- A brewer cannot restore
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT restore_brewery_backup((SELECT tables FROM backup))$$, '42501', NULL, 'a brewer cannot restore a backup');
RESET ROLE;

-- The brewery admin restores: merge
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT restore_brewery_backup((SELECT tables FROM backup))$$, 'the brewery admin restores a backup');
RESET ROLE;
SELECT is((SELECT data->>'notes' FROM recipes WHERE id = 'r1'), 'restored', 'an existing recipe is overwritten');
SELECT is((SELECT status FROM recipes WHERE id = 'r2'), 'private', 'a restored recipe is never public');
SELECT is((SELECT brewery_id FROM hops WHERE id = 'h1'), (SELECT brewery_a FROM t), 'a new item lands in the brewery');
SELECT is((SELECT (data->>'alpha')::numeric FROM hops WHERE id = 'h-pub'), NULL::numeric, 'a public item is not overwritten');
SELECT is((SELECT count(*) FROM brew_logs WHERE id = 'l1') + (SELECT count(*) FROM tasting_notes WHERE id = 'n1'), 2::bigint, 'brews and tasting notes are added');
SELECT is((SELECT amount FROM stock WHERE ingredient_id = 'h1'), 100::numeric, 'the stock is restored');

-- Full backup and restore: only the app admin
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT admin_full_backup()$$, '42501', NULL, 'a brewery admin cannot make a full backup');
SELECT throws_ok($$SELECT admin_full_restore('{"format":"brewbindr-full-backup"}'::jsonb)$$, '42501', NULL, 'a brewery admin cannot restore one');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE full_backup AS SELECT admin_full_backup() AS b;
RESET ROLE;
SELECT is((SELECT jsonb_array_length(b -> 'tables' -> 'recipes') FROM full_backup) >= 2, true, 'the full backup holds the recipes');
SELECT is((SELECT b -> 'tables' -> 'hops' @> '[{"id":"h-pub","status":"approved"}]' FROM full_backup), true, '... and public items with their status');

-- Lose data and a user, then restore
DELETE FROM tasting_notes WHERE id = 'n1';
DELETE FROM recipes WHERE id = 'r2';
UPDATE recipes SET data = '{"name":"Tripel","notes":"changed"}' WHERE id = 'r1';
DELETE FROM brew_logs WHERE id = 'l1';
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000a2';

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT (admin_full_restore((SELECT b FROM full_backup), true) -> 'recipes' ->> 'added')::int), 1, 'a dry run counts what would be added');
SELECT is((SELECT data->>'notes' FROM recipes WHERE id = 'r1'), 'changed', '... and changes nothing');
SELECT lives_ok($$SELECT admin_full_restore((SELECT b FROM full_backup))$$, 'the app admin restores the full backup');
RESET ROLE;
SELECT is((SELECT data->>'notes' FROM recipes WHERE id = 'r1'), 'restored', 'changed rows are back');
SELECT is((SELECT count(*) FROM recipes WHERE id = 'r2') + (SELECT count(*) FROM brew_logs WHERE id = 'l1') + (SELECT count(*) FROM tasting_notes WHERE id = 'n1'), 3::bigint, 'deleted rows are back');

SELECT * FROM finish();
ROLLBACK;
