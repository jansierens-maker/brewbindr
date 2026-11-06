-- Invitations (#120, #125)
-- Every new user is admin of their own brewery and could send invitation e-mails from
-- our domain without limit. Now:
--   - an invitation e-mail is only sent after claim_invite_send() allows it: at most 3
--     sends per invitation and 10 per brewery per 24 hours;
--   - an invitation is valid for at most 30 days; created_at and the send counters
--     cannot be set from the app;
--   - a brewery name is 1 to 60 characters;
--   - invite codes are stored and matched in upper case without spaces, also at
--     sign-up (a code typed in lower case gave the user their own brewery instead).
-- Idempotent and compatible with the previous app version.

-- Send counters on invitations, and a log of sends per brewery (kept when an
-- invitation is deleted, so deleting and re-creating does not reset the limit)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS invitation_sends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitation_sends_brewery_time ON invitation_sends (brewery_id, sent_at);
-- Only reachable through claim_invite_send()
ALTER TABLE invitation_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_sends FROM anon, authenticated;

-- Codes in one form
UPDATE invitations SET code = upper(btrim(code)) WHERE code IS DISTINCT FROM upper(btrim(code));

-- What the app may set on an invitation
CREATE OR REPLACE FUNCTION public.guard_invitation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  IF current_user IN ('anon', 'authenticated') AND NOT is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
      NEW.sent_count := 0;
      NEW.last_sent_at := NULL;
    ELSE
      NEW.created_at := OLD.created_at;
      NEW.sent_count := OLD.sent_count;
      NEW.last_sent_at := OLD.last_sent_at;
    END IF;
  END IF;
  NEW.expires_at := least(coalesce(NEW.expires_at, now() + interval '7 days'),
                          coalesce(NEW.created_at, now()) + interval '30 days');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invitation_guard ON invitations;
CREATE TRIGGER on_invitation_guard BEFORE INSERT OR UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION guard_invitation();

-- Asked by /api/send-invite (as the signed-in user) right before it sends the e-mail.
-- Returns {"allowed": true} and counts the send, or {"allowed": false, "reason": ...}.
CREATE OR REPLACE FUNCTION public.claim_invite_send(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  recent INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT id, brewery_id, email, expires_at, sent_count INTO inv
  FROM invitations WHERE id = p_invitation_id FOR UPDATE;

  IF NOT FOUND OR NOT (is_admin() OR (inv.brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin')) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF inv.email IS NULL OR inv.expires_at <= now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
  END IF;
  IF inv.sent_count >= 3 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invite_resend_limit');
  END IF;

  -- Serialize per brewery so parallel calls cannot pass the limit together
  PERFORM 1 FROM breweries WHERE id = inv.brewery_id FOR UPDATE;
  SELECT count(*) INTO recent FROM invitation_sends
  WHERE brewery_id = inv.brewery_id AND sent_at > now() - interval '24 hours';
  IF recent >= 10 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invite_daily_limit');
  END IF;

  INSERT INTO invitation_sends (brewery_id) VALUES (inv.brewery_id);
  UPDATE invitations SET sent_count = sent_count + 1, last_sent_at = now() WHERE id = inv.id;
  -- Keep the log small
  DELETE FROM invitation_sends WHERE brewery_id = inv.brewery_id AND sent_at < now() - interval '30 days';

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_invite_send(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite_send(UUID) TO authenticated;

-- Brewery names: 1 to 60 characters (existing names are short)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'breweries_name_length') THEN
    ALTER TABLE breweries ADD CONSTRAINT breweries_name_length
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);
  END IF;
END $$;

-- Sign-up with an invite code: match it in upper case without spaces (#125)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_brewery_id UUID;
  invite_code TEXT;
  invite_role TEXT;
  invite_brewery_id UUID;
BEGIN
  invite_code := upper(btrim(new.raw_user_meta_data->>'invite_code'));

  IF invite_code IS NOT NULL AND invite_code <> '' THEN
    -- Try to join existing brewery
    SELECT brewery_id, role INTO invite_brewery_id, invite_role
    FROM invitations
    WHERE code = invite_code AND expires_at > now()
    LIMIT 1;

    IF invite_brewery_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
      VALUES (new.id, new.email, invite_brewery_id, invite_role)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        brewery_id = EXCLUDED.brewery_id,
        brewery_role = EXCLUDED.brewery_role;

      -- Cleanup used invitation (Match by code and/or email for safety)
      DELETE FROM invitations
      WHERE code = invite_code
      OR (email = new.email AND brewery_id = invite_brewery_id);

      RETURN new;
    END IF;
  END IF;

  -- Default: Create new brewery for the user
  INSERT INTO breweries (name) VALUES ('My Brewery') RETURNING id INTO new_brewery_id;

  INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
  VALUES (new.id, new.email, new_brewery_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    brewery_id = EXCLUDED.brewery_id,
    brewery_role = EXCLUDED.brewery_role;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
