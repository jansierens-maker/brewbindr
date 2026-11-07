-- Invitations (#120, #125): send limits, validity, brewery names, codes at sign-up
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

-- a1: admin of brewery A; a2: brewmaster in A; c1: admin of brewery C
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'master-a@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin-c@test.local');
CREATE TEMP TABLE t AS SELECT
  (SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') AS brewery_a;
GRANT SELECT ON t TO authenticated;
UPDATE profiles SET brewery_id = (SELECT brewery_a FROM t), brewery_role = 'brewmaster'
  WHERE id = '00000000-0000-0000-0000-0000000000a2';

-- The admin of A creates invitations, trying to fake the counters and validity
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO invitations (id, brewery_id, role, code, email, expires_at, sent_count, created_at)
  SELECT 'aaaaaaaa-0000-0000-0000-000000000001', brewery_a, 'brewer', ' abcd2345 ', 'x@test.local',
         now() + interval '1 year', -5, now() - interval '2 days' FROM t;
RESET ROLE;
SELECT is((SELECT code FROM invitations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'ABCD2345',
  'codes are stored in upper case without spaces');
SELECT ok((SELECT expires_at <= now() + interval '30 days 1 minute' FROM invitations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'an invitation is valid for at most 30 days');
SELECT is((SELECT sent_count FROM invitations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'the send counter cannot be set from the app');

SET LOCAL ROLE authenticated;
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000001'), '{"allowed": true}'::jsonb, 'first send is allowed');
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000001'), '{"allowed": true}'::jsonb, 'second send is allowed');
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000001'), '{"allowed": true}'::jsonb, 'third send is allowed');
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000001')->>'reason', 'invite_resend_limit',
  'a fourth send of the same invitation is refused');
UPDATE invitations SET sent_count = 0 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
RESET ROLE;
SELECT is((SELECT sent_count FROM invitations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3,
  'the app cannot reset the send counter');

-- Daily limit per brewery: 3 sends so far, 7 more are allowed, then refused
SET LOCAL ROLE authenticated;
INSERT INTO invitations (id, brewery_id, role, code, email)
  SELECT ('aaaaaaaa-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, brewery_a, 'brewer', 'CODE' || lpad(i::text, 4, '0'), 'y' || i || '@test.local'
  FROM t, generate_series(10, 17) i;
SELECT is((SELECT count(*)::int FROM generate_series(10, 16) i
           WHERE (public.claim_invite_send(('aaaaaaaa-0000-0000-0000-0000000000' || i)::uuid)->>'allowed')::boolean), 7,
  'up to 10 sends per brewery per day');
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000017')->>'reason', 'invite_daily_limit',
  'the 11th send of the day is refused');
-- Deleting invitations does not reset the limit
DELETE FROM invitations WHERE brewery_id = (SELECT brewery_a FROM t);
INSERT INTO invitations (id, brewery_id, role, code, email)
  SELECT 'aaaaaaaa-0000-0000-0000-000000000099', brewery_a, 'brewer', 'NEWCODE9', 'z@test.local' FROM t;
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000099')->>'reason', 'invite_daily_limit',
  'deleting and re-creating invitations does not reset the limit');
RESET ROLE;

-- Only the admin of the brewery may send
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.claim_invite_send('aaaaaaaa-0000-0000-0000-000000000099')->>'reason', 'not_found',
  'an admin of another brewery cannot send it');
SELECT throws_ok($$UPDATE breweries SET name = repeat('x', 61) WHERE id = get_user_brewery_id()$$,
  '23514', NULL, 'a brewery name is at most 60 characters');
SELECT throws_ok($$SELECT count(*) FROM invitation_sends$$, '42501', NULL,
  'the send log is not readable from the app');
RESET ROLE;

-- Sign-up with a code typed in lower case joins the brewery (#125)
INSERT INTO invitations (brewery_id, role, code, email) SELECT brewery_a, 'taster', 'JOINME23', 'new@test.local' FROM t;
INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-0000000000b1', 'new@test.local', '{"invite_code":" joinme23 "}');
SELECT is((SELECT brewery_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b1'), (SELECT brewery_a FROM t),
  'a code in lower case with spaces still joins the brewery');

SELECT * FROM finish();
ROLLBACK;
