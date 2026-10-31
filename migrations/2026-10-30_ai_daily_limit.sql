-- Daily limit on AI requests per user (2026-10-30)
-- Idempotent: safe to run more than once, and also included in the full setup script.
--
-- The AI endpoints (/api/generate-recipe, /api/analyze-recipe, /api/analyze-tasting)
-- call consume_ai_quota() before contacting Gemini. Limit per calendar day
-- (Europe/Brussels): 10 requests for users, 100 for global admins.

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Only reachable through consume_ai_quota(): RLS on, no policies, no grants
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_quota()
RETURNS JSON AS $$
DECLARE
  uid UUID := auth.uid();
  today DATE := (now() AT TIME ZONE 'Europe/Brussels')::date;
  daily_limit INT;
  used INT;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('allowed', false, 'used', 0, 'limit', 0);
  END IF;

  daily_limit := CASE WHEN is_admin() THEN 100 ELSE 10 END;

  -- Count this request only while under the limit (atomic, safe for parallel calls)
  INSERT INTO ai_usage (user_id, day, count) VALUES (uid, today, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
    WHERE ai_usage.count < daily_limit
  RETURNING count INTO used;

  -- Keep the table small: drop this user's rows older than 30 days
  DELETE FROM ai_usage WHERE user_id = uid AND day < today - 30;

  IF used IS NULL THEN
    RETURN json_build_object('allowed', false, 'used', daily_limit, 'limit', daily_limit);
  END IF;
  RETURN json_build_object('allowed', true, 'used', used, 'limit', daily_limit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota() TO authenticated;
