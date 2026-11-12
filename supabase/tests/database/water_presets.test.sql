-- Water presets in the public library (#174)
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

SELECT is((SELECT count(*) FROM waters WHERE id LIKE 'preset-water-%' AND status = 'approved'), 33::bigint,
  'the water presets are public water profiles');
SELECT is((SELECT count(*) FROM waters WHERE id LIKE 'preset-water-%' AND data->>'water_kind' = 'base'), 9::bigint,
  'the classic waters are base water');
SELECT is((SELECT data->>'preset_key' FROM waters WHERE id = 'preset-water-burton'), 'burton',
  'a preset keeps its key for old references');
SELECT is((SELECT (data->>'sulfate')::numeric FROM waters WHERE id = 'preset-water-burton'), 820::numeric,
  'a preset keeps its minerals');

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000b2', 'brewer2@test.local');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM waters WHERE id LIKE 'preset-water-%'), 33::bigint, 'a brewer sees the water presets');
UPDATE waters SET data = data || '{"calcium":1}' WHERE id = 'preset-water-pilsen';
RESET ROLE;
SELECT is((SELECT (data->>'calcium')::numeric FROM waters WHERE id = 'preset-water-pilsen'), 7::numeric,
  'a brewer cannot change a water preset');

SELECT * FROM finish();
ROLLBACK;
