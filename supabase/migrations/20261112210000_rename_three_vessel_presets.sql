-- "3-vatten" is the wrong term: rename the two public 3-vessel presets (#164) to "3 ketels".
-- Only while they still have their original name, so a correction by the app admin stays.
-- Idempotent; compatible with the previous app version (only data changes).

UPDATE equipment
SET data = data || jsonb_build_object('name', v.new_name, 'preset', v.new_name)
FROM (VALUES
  ('preset-klassiek-3-vatten-20l', 'Klassiek 3-vatten 20L', 'Klassiek 3 ketels 20L'),
  ('preset-klassiek-3-vatten-30l', 'Klassiek 3-vatten 30L', 'Klassiek 3 ketels 30L')
) AS v(id, old_name, new_name)
WHERE equipment.id = v.id AND equipment.data->>'name' = v.old_name;
