-- Already applied on production on 2026-10-30 (via the Supabase connection), so it is
-- part of the remote migration history. Kept here so local and remote history match.
-- Guarded: on a fresh database the function does not exist yet at this point; the
-- baseline migration that follows creates it with SECURITY INVOKER.
DO $$
BEGIN
  IF to_regprocedure('public.protect_profile_role()') IS NOT NULL THEN
    ALTER FUNCTION public.protect_profile_role() SECURITY INVOKER;
  END IF;
END $$;
