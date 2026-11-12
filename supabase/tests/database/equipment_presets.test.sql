-- Installation presets in the public library (#164)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

SELECT ok((SELECT count(*) FROM equipment WHERE id LIKE 'preset-%' AND status = 'approved') >= 13,
  'the presets are public installations');
SELECT is((SELECT data->>'preset' FROM equipment WHERE id = 'preset-brew-monk-b50'), 'Brew Monk B50',
  'a preset keeps its preset name (capacity fallback)');
SELECT is((SELECT (data->>'max_grain_kg')::numeric FROM equipment WHERE id = 'preset-brew-monk-b50'), 12::numeric,
  'a preset keeps its settings');

-- Running the migration again adds nothing
SELECT is((SELECT count(*) FROM equipment WHERE status = 'approved' GROUP BY name_key(data->>'name') ORDER BY 1 DESC LIMIT 1), 1::bigint,
  'every public name exists once');

SELECT is((SELECT data->>'name' FROM equipment WHERE id = 'preset-klassiek-3-vatten-20l'), 'Klassiek 3 ketels 20L',
  'the 3-vessel presets are called "3 ketels"');

-- Every signed-in user sees them
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000b1', 'brewer@test.local');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*) FROM equipment WHERE id LIKE 'preset-%') >= 13, 'a brewer sees the presets');
UPDATE equipment SET data = data || '{"batch_size":1}' WHERE id = 'preset-brewie';
RESET ROLE;
SELECT is((SELECT (data->>'batch_size')::numeric FROM equipment WHERE id = 'preset-brewie'), 23::numeric,
  'a brewer cannot change a preset');

SELECT * FROM finish();
ROLLBACK;
