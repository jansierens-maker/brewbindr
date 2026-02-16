## 2025-05-14 - [CRITICAL] Fix Privilege Escalation in Profile Updates
**Vulnerability:** Users could promote themselves to 'admin' by sending a 'role' field in the profile update request. The client-side service was sending whatever fields were in the object, and the RLS policy only checked for ownership (auth.uid() = id) but not for restricted column modification.
**Learning:** Defense in depth is required: fix both the client-side service to omit sensitive fields AND the database RLS policy to prevent unauthorized column updates even if the client is bypassed.
**Prevention:** Always use 'WITH CHECK' in Supabase UPDATE policies to verify that sensitive columns (like 'role') haven't changed by comparing them to the existing row values.

## 2025-05-14 - [HIGH] Prevent Secret Leakage in Vite Build
**Vulnerability:** The 'process.env.API_KEY' was defined in 'vite.config.ts', causing any environment variable named 'API_KEY' to be baked into the client-side bundle even if unused in the source.
**Learning:** Build-time string replacement ('define') is dangerous for generic names like 'API_KEY'.
**Prevention:** Only expose strictly necessary, public-safe variables to the client bundle. Remove any 'define' entries that are not actively used.
