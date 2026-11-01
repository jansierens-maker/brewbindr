-- Profile guard, brewery membership and the daily AI limit
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-of-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'solo-b@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a,
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b1') AS brewery_b;
GRANT SELECT ON t TO authenticated;

-- User B owns a recipe whose name also exists in brewery A
INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT 'rb', '{"name":"House Ale"}', '00000000-0000-0000-0000-0000000000b1', brewery_b, 'private' FROM t;
INSERT INTO recipes (id, data, user_id, brewery_id, status)
  SELECT 'ra', '{"name":"House Ale"}', '00000000-0000-0000-0000-0000000000a1', brewery_a, 'private' FROM t;
INSERT INTO invitations (brewery_id, role, code, email)
  SELECT brewery_a, 'brewer', 'TESTCODE', 'solo-b@test.local' FROM t;

-- Act as user B
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'admin' WHERE id = auth.uid()$$,
  'P0001', 'Brewery membership cannot be changed directly',
  'a user cannot move themselves into another brewery');

-- B is admin of their own (new) brewery; even a downgrade is refused
SELECT throws_ok(
  $$UPDATE profiles SET brewery_role = 'taster' WHERE id = auth.uid()$$,
  'P0001', 'Brewery membership cannot be changed directly',
  'a user cannot change their own brewery role');

SELECT lives_ok(
  $$UPDATE profiles SET preferences = preferences WHERE id = auth.uid()$$,
  'a user can still save their own preferences');

-- Daily AI limit: 10 requests for a user
-- 11 separate calls (one per AI request, as the API does)
DO $$
DECLARE allowed INT := 0;
BEGIN
  FOR i IN 1..11 LOOP
    IF (public.consume_ai_quota()->>'allowed')::boolean THEN allowed := allowed + 1; END IF;
  END LOOP;
  PERFORM set_config('test.ai_allowed', allowed::text, true);
END $$;
SELECT is(current_setting('test.ai_allowed')::int, 10, 'a user gets 10 AI requests per day, the 11th is refused');

-- Join brewery A with the invite code: B's data moves along, the empty brewery goes
SELECT is(public.join_brewery('testcode'), (SELECT brewery_a FROM t), 'join_brewery accepts a valid code (case-insensitive)');
RESET ROLE;

SELECT is((SELECT brewery_id FROM recipes WHERE id = 'rb'), (SELECT brewery_a FROM t), 'the joining user''s recipe moved to the new brewery');
SELECT is((SELECT data->>'name' FROM recipes WHERE id = 'rb'), 'House Ale (2)', 'a moved recipe with a taken name gets a free name');
SELECT is((SELECT count(*)::int FROM breweries WHERE id = (SELECT brewery_b FROM t)), 0, 'the empty old brewery is removed');

-- Admins get a higher AI limit
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((public.consume_ai_quota()->>'limit')::int, 100, 'global admins get 100 AI requests per day');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
