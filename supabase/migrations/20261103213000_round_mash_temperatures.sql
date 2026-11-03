-- Round stored mash temperatures (#111)
-- BeerXML stores °F converted to °C, e.g. 65.555556. The app now rounds mash steps on
-- import, save and load (normalizeMash); this cleans up what is already stored, with
-- the same rules: temperatures 0.1 °C, times whole minutes, infuse water 0.1 L.
-- Idempotent: rounded values stay the same, and only rows that change are updated.

CREATE OR REPLACE FUNCTION pg_temp.round_keys(obj JSONB, keys TEXT[], decimals INT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(obj, '{}'::jsonb) || coalesce((
    SELECT jsonb_object_agg(k, round((obj->>k)::numeric, decimals))
    FROM unnest(keys) k
    WHERE jsonb_typeof(obj->k) = 'number'
  ), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION pg_temp.round_mash(mash JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.round_keys(mash, ARRAY['grain_temp', 'sparge_temp'], 1)
    || CASE WHEN jsonb_typeof(mash->'steps') = 'array' THEN jsonb_build_object('steps', (
         SELECT coalesce(jsonb_agg(
           pg_temp.round_keys(
             pg_temp.round_keys(
               pg_temp.round_keys(s, ARRAY['step_temp', 'temperature', 'end_temp'], 1),
               ARRAY['step_time', 'duration', 'ramp_time'], 0),
             ARRAY['infuse_amount'], 1)
           ORDER BY i), '[]'::jsonb)
         FROM jsonb_array_elements(mash->'steps') WITH ORDINALITY AS e(s, i)))
       ELSE '{}'::jsonb END
$$;

UPDATE recipes
SET data = jsonb_set(data, '{mash}', pg_temp.round_mash(data->'mash'))
WHERE jsonb_typeof(data->'mash') = 'object'
  AND pg_temp.round_mash(data->'mash') IS DISTINCT FROM data->'mash';

UPDATE mash_profiles
SET data = pg_temp.round_mash(data)
WHERE jsonb_typeof(data) = 'object'
  AND pg_temp.round_mash(data) IS DISTINCT FROM data;
