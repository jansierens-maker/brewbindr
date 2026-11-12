-- Water presets in the public library (#174)
-- The fixed water profiles in the app become public water profiles (approved, no owner;
-- the app admin maintains them): the classic waters as base water, the colour and beer
-- style profiles as target profiles (data->>'water_kind'). data->>'preset_key' keeps the
-- old 'preset:<key>' references in recipes working. Water profiles without a kind are
-- base water, so existing rows need no change.
-- Idempotent: fixed ids, and a preset is skipped when a public water profile with the same
-- name already exists. Compatible with the previous app version: it only adds approved
-- rows, which that version shows in the public library.

INSERT INTO waters (id, data, user_id, brewery_id, status)
SELECT p.id, p.data, NULL, NULL, 'approved'
FROM (VALUES
  ('preset-water-ro', '{"id":"preset-water-ro","name":"Osmose / gedemineraliseerd","type":"water","status":"approved","water_kind":"base","preset_key":"ro","calcium":0,"magnesium":0,"sodium":0,"chloride":0,"sulfate":0,"bicarbonate":0}'::jsonb),
  ('preset-water-pilsen', '{"id":"preset-water-pilsen","name":"Pilsen","type":"water","status":"approved","water_kind":"base","preset_key":"pilsen","calcium":7,"magnesium":2,"sodium":2,"chloride":5,"sulfate":5,"bicarbonate":15}'::jsonb),
  ('preset-water-munich', '{"id":"preset-water-munich","name":"München","type":"water","status":"approved","water_kind":"base","preset_key":"munich","calcium":77,"magnesium":17,"sodium":4,"chloride":8,"sulfate":18,"bicarbonate":295}'::jsonb),
  ('preset-water-vienna', '{"id":"preset-water-vienna","name":"Wenen","type":"water","status":"approved","water_kind":"base","preset_key":"vienna","calcium":200,"magnesium":60,"sodium":8,"chloride":12,"sulfate":125,"bicarbonate":120}'::jsonb),
  ('preset-water-dortmund', '{"id":"preset-water-dortmund","name":"Dortmund","type":"water","status":"approved","water_kind":"base","preset_key":"dortmund","calcium":225,"magnesium":40,"sodium":60,"chloride":60,"sulfate":120,"bicarbonate":220}'::jsonb),
  ('preset-water-dublin', '{"id":"preset-water-dublin","name":"Dublin","type":"water","status":"approved","water_kind":"base","preset_key":"dublin","calcium":118,"magnesium":4,"sodium":12,"chloride":19,"sulfate":54,"bicarbonate":319}'::jsonb),
  ('preset-water-edinburgh', '{"id":"preset-water-edinburgh","name":"Edinburgh","type":"water","status":"approved","water_kind":"base","preset_key":"edinburgh","calcium":120,"magnesium":25,"sodium":55,"chloride":65,"sulfate":140,"bicarbonate":225}'::jsonb),
  ('preset-water-london', '{"id":"preset-water-london","name":"Londen","type":"water","status":"approved","water_kind":"base","preset_key":"london","calcium":52,"magnesium":32,"sodium":86,"chloride":34,"sulfate":32,"bicarbonate":104}'::jsonb),
  ('preset-water-burton', '{"id":"preset-water-burton","name":"Burton-on-Trent","type":"water","status":"approved","water_kind":"base","preset_key":"burton","calcium":352,"magnesium":24,"sodium":44,"chloride":16,"sulfate":820,"bicarbonate":320}'::jsonb),
  ('preset-water-light-balanced', '{"id":"preset-water-light-balanced","name":"Licht – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"light_balanced","calcium":50,"magnesium":7,"sodium":5,"chloride":60,"sulfate":75,"bicarbonate":0}'::jsonb),
  ('preset-water-light-hoppy', '{"id":"preset-water-light-hoppy","name":"Licht – hoppig","type":"water","status":"approved","water_kind":"target","preset_key":"light_hoppy","calcium":75,"magnesium":7,"sodium":5,"chloride":50,"sulfate":150,"bicarbonate":0}'::jsonb),
  ('preset-water-light-malty', '{"id":"preset-water-light-malty","name":"Licht – moutig","type":"water","status":"approved","water_kind":"target","preset_key":"light_malty","calcium":50,"magnesium":7,"sodium":5,"chloride":90,"sulfate":50,"bicarbonate":0}'::jsonb),
  ('preset-water-amber-balanced', '{"id":"preset-water-amber-balanced","name":"Amber – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"amber_balanced","calcium":50,"magnesium":10,"sodium":15,"chloride":60,"sulfate":80,"bicarbonate":40}'::jsonb),
  ('preset-water-dark-balanced', '{"id":"preset-water-dark-balanced","name":"Donker – gebalanceerd","type":"water","status":"approved","water_kind":"target","preset_key":"dark_balanced","calcium":50,"magnesium":10,"sodium":15,"chloride":65,"sulfate":70,"bicarbonate":120}'::jsonb),
  ('preset-water-style-west-coast-ipa', '{"id":"preset-water-style-west-coast-ipa","name":"West Coast IPA / DIPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_west_coast_ipa","calcium":160,"magnesium":8,"sodium":20,"chloride":60,"sulfate":300,"bicarbonate":25}'::jsonb),
  ('preset-water-style-american-ipa', '{"id":"preset-water-style-american-ipa","name":"American IPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_american_ipa","calcium":125,"magnesium":8,"sodium":25,"chloride":75,"sulfate":225,"bicarbonate":25}'::jsonb),
  ('preset-water-style-neipa', '{"id":"preset-water-style-neipa","name":"New England IPA","type":"water","status":"approved","water_kind":"target","preset_key":"style_neipa","calcium":110,"magnesium":5,"sodium":10,"chloride":150,"sulfate":100,"bicarbonate":0}'::jsonb),
  ('preset-water-style-english-ipa', '{"id":"preset-water-style-english-ipa","name":"English IPA (Burton)","type":"water","status":"approved","water_kind":"target","preset_key":"style_english_ipa","calcium":300,"magnesium":30,"sodium":40,"chloride":30,"sulfate":600,"bicarbonate":140}'::jsonb),
  ('preset-water-style-pale-ale', '{"id":"preset-water-style-pale-ale","name":"Pale ale","type":"water","status":"approved","water_kind":"target","preset_key":"style_pale_ale","calcium":100,"magnesium":8,"sodium":20,"chloride":60,"sulfate":150,"bicarbonate":25}'::jsonb),
  ('preset-water-style-czech-pils', '{"id":"preset-water-style-czech-pils","name":"Tsjechische pils","type":"water","status":"approved","water_kind":"target","preset_key":"style_czech_pils","calcium":15,"magnesium":3,"sodium":5,"chloride":10,"sulfate":10,"bicarbonate":10}'::jsonb),
  ('preset-water-style-german-pils', '{"id":"preset-water-style-german-pils","name":"Duitse pils / lichte lager","type":"water","status":"approved","water_kind":"target","preset_key":"style_german_pils","calcium":60,"magnesium":10,"sodium":15,"chloride":40,"sulfate":50,"bicarbonate":15}'::jsonb),
  ('preset-water-style-belgian-blond', '{"id":"preset-water-style-belgian-blond","name":"Belgisch blond","type":"water","status":"approved","water_kind":"target","preset_key":"style_belgian_blond","calcium":75,"magnesium":10,"sodium":15,"chloride":70,"sulfate":60,"bicarbonate":40}'::jsonb),
  ('preset-water-style-tripel', '{"id":"preset-water-style-tripel","name":"Tripel","type":"water","status":"approved","water_kind":"target","preset_key":"style_tripel","calcium":65,"magnesium":10,"sodium":10,"chloride":60,"sulfate":60,"bicarbonate":25}'::jsonb),
  ('preset-water-style-saison', '{"id":"preset-water-style-saison","name":"Saison","type":"water","status":"approved","water_kind":"target","preset_key":"style_saison","calcium":100,"magnesium":10,"sodium":30,"chloride":75,"sulfate":60,"bicarbonate":75}'::jsonb),
  ('preset-water-style-witbier', '{"id":"preset-water-style-witbier","name":"Witbier","type":"water","status":"approved","water_kind":"target","preset_key":"style_witbier","calcium":60,"magnesium":5,"sodium":15,"chloride":60,"sulfate":40,"bicarbonate":30}'::jsonb),
  ('preset-water-style-weizen', '{"id":"preset-water-style-weizen","name":"Weizen","type":"water","status":"approved","water_kind":"target","preset_key":"style_weizen","calcium":75,"magnesium":10,"sodium":15,"chloride":50,"sulfate":50,"bicarbonate":75}'::jsonb),
  ('preset-water-style-dubbel', '{"id":"preset-water-style-dubbel","name":"Dubbel","type":"water","status":"approved","water_kind":"target","preset_key":"style_dubbel","calcium":75,"magnesium":10,"sodium":15,"chloride":75,"sulfate":50,"bicarbonate":100}'::jsonb),
  ('preset-water-style-quadrupel', '{"id":"preset-water-style-quadrupel","name":"Quadrupel","type":"water","status":"approved","water_kind":"target","preset_key":"style_quadrupel","calcium":75,"magnesium":10,"sodium":15,"chloride":80,"sulfate":50,"bicarbonate":125}'::jsonb),
  ('preset-water-style-amber', '{"id":"preset-water-style-amber","name":"Amber / Weense lager","type":"water","status":"approved","water_kind":"target","preset_key":"style_amber","calcium":100,"magnesium":12,"sodium":20,"chloride":75,"sulfate":75,"bicarbonate":75}'::jsonb),
  ('preset-water-style-marzen', '{"id":"preset-water-style-marzen","name":"Märzen / Dunkel","type":"water","status":"approved","water_kind":"target","preset_key":"style_marzen","calcium":80,"magnesium":18,"sodium":20,"chloride":15,"sulfate":20,"bicarbonate":175}'::jsonb),
  ('preset-water-style-irish-stout', '{"id":"preset-water-style-irish-stout","name":"Irish stout","type":"water","status":"approved","water_kind":"target","preset_key":"style_irish_stout","calcium":100,"magnesium":15,"sodium":30,"chloride":75,"sulfate":50,"bicarbonate":150}'::jsonb),
  ('preset-water-style-stout-porter', '{"id":"preset-water-style-stout-porter","name":"Stout / porter","type":"water","status":"approved","water_kind":"target","preset_key":"style_stout_porter","calcium":100,"magnesium":10,"sodium":20,"chloride":110,"sulfate":75,"bicarbonate":75}'::jsonb),
  ('preset-water-style-imperial-stout', '{"id":"preset-water-style-imperial-stout","name":"Imperial stout / Baltic porter","type":"water","status":"approved","water_kind":"target","preset_key":"style_imperial_stout","calcium":125,"magnesium":15,"sodium":30,"chloride":110,"sulfate":75,"bicarbonate":110}'::jsonb)
) AS p(id, data)
WHERE NOT EXISTS (
  SELECT 1 FROM waters w
  WHERE w.status = 'approved' AND name_key(w.data->>'name') = name_key(p.data->>'name')
)
ON CONFLICT (id) DO NOTHING;
