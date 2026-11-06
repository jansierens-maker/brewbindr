-- Tasters on tasting notes: display name, notes in your own name, who may change or delete
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- Brewery A: a1 admin, a2 taster, a3 brewer. Brewery C: c1 admin.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'taster-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'brewer-a@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin-c@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'taster'
  WHERE id = '00000000-0000-0000-0000-0000000000a2';
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewer'
  WHERE id = '00000000-0000-0000-0000-0000000000a3';

-- n3: a note of the brewer
INSERT INTO tasting_notes (id, data, user_id, brewery_id)
  SELECT 'n3', '{"brewLogId":"b1"}', '00000000-0000-0000-0000-0000000000a3', brewery_a FROM t;

-- The taster
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($$UPDATE profiles SET display_name = 'Piet' WHERE id = auth.uid()$$,
  'a user sets their own display name');
SELECT throws_ok($$UPDATE profiles SET display_name = repeat('x', 41) WHERE id = auth.uid()$$,
  '23514', NULL, 'a display name is at most 40 characters');
SELECT throws_ok($$UPDATE profiles SET display_name = '' WHERE id = auth.uid()$$,
  '23514', NULL, 'an empty display name is not allowed (use NULL)');
SELECT lives_ok(
  $$INSERT INTO tasting_notes (id, data, user_id, brewery_id)
    SELECT 'n2', '{"brewLogId":"b1","guest_name":"Jef"}', auth.uid(), brewery_a FROM t$$,
  'a taster adds a note in their own name, also for a guest');
SELECT throws_ok(
  $$INSERT INTO tasting_notes (id, data, user_id, brewery_id)
    SELECT 'nx', '{}', '00000000-0000-0000-0000-0000000000a3', brewery_a FROM t$$,
  '42501', NULL, 'a note cannot be added in someone else''s name');
SELECT lives_ok($$UPDATE tasting_notes SET data = data || '{"overall":4}' WHERE id = 'n2'$$,
  'a taster changes their own note');
UPDATE tasting_notes SET data = data || '{"overall":1}' WHERE id = 'n3';
DELETE FROM tasting_notes WHERE id = 'n3';
RESET ROLE;
SELECT is((SELECT data->>'overall' FROM tasting_notes WHERE id = 'n3'), NULL,
  'a taster cannot change a colleague''s note');
SELECT is((SELECT count(*)::int FROM tasting_notes WHERE id = 'n3'), 1,
  'a taster cannot delete a colleague''s note');

-- The brewer cannot take over the taster's note
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT display_name FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a2'), 'Piet',
  'brewery members see each other''s display name');
DELETE FROM tasting_notes WHERE id = 'n2';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM tasting_notes WHERE id = 'n2'), 1,
  'a brewer cannot delete a colleague''s note');

-- The brewery admin manages all notes of the brewery
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE tasting_notes SET data = data || '{"overall":5}' WHERE id = 'n2'$$,
  'a brewery admin changes a member''s note');
RESET ROLE;
SELECT is((SELECT user_id FROM tasting_notes WHERE id = 'n2'), '00000000-0000-0000-0000-0000000000a2'::uuid,
  'the note keeps its taster after an admin edit');

-- An admin of another brewery cannot touch them
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DELETE FROM tasting_notes WHERE id IN ('n2', 'n3');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM tasting_notes WHERE id IN ('n2', 'n3')), 2,
  'an admin of another brewery cannot delete the notes');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DELETE FROM tasting_notes WHERE id = 'n3';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM tasting_notes WHERE id = 'n3'), 0,
  'a brewery admin deletes a member''s note');

SELECT * FROM finish();
ROLLBACK;
