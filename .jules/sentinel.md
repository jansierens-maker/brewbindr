## 2025-05-14 - [CRITICAL] Fix Privilege Escalation in Profile Updates
**Vulnerability:** Users could promote themselves to 'admin' by sending a 'role' field in the profile update request. The client-side service was sending whatever fields were in the object, and the RLS policy only checked for ownership (auth.uid() = id) but not for restricted column modification.
**Learning:** Defense in depth is required: fix both the client-side service to omit sensitive fields AND the database RLS policy to prevent unauthorized column updates even if the client is bypassed.
**Prevention:** Always use 'WITH CHECK' in Supabase UPDATE policies to verify that sensitive columns (like 'role') haven't changed by comparing them to the existing row values.

## 2025-05-14 - [HIGH] Prevent Secret Leakage in Vite Build
**Vulnerability:** The 'process.env.API_KEY' was defined in 'vite.config.ts', causing any environment variable named 'API_KEY' to be baked into the client-side bundle even if unused in the source.
**Learning:** Build-time string replacement ('define') is dangerous for generic names like 'API_KEY'.
**Prevention:** Only expose strictly necessary, public-safe variables to the client bundle. Remove any 'define' entries that are not actively used.

## 2025-05-14 - [HIGH] Fix Fail-Open Authentication in AI Endpoints
**Vulnerability:** API endpoints for recipe generation and tasting analysis were only performing authentication checks if Supabase environment variables were present. If they were missing, the endpoints would proceed without any authorization, potentially exposing the Gemini AI API to unauthorized use.
**Learning:** Security checks should be "fail-closed". If required security infrastructure (like Supabase) is missing, the application should refuse to perform sensitive operations.
**Prevention:** Always verify that mandatory security configurations are present and enforce authentication regardless of optional environment settings in production-critical paths.

## 2025-05-14 - [HIGH] Fix Authorization Bypass in Library Submissions
**Vulnerability:** Users could bypass the administrative approval process by manually setting the 'status' of their recipes or ingredients to 'approved' via direct Supabase API calls.
**Learning:** Row-Level Security (RLS) policies must validate not just ownership, but also restricted state transitions (like moderation status) using 'WITH CHECK'.
**Prevention:** For tables with moderation workflows, add 'WITH CHECK' clauses to RLS policies to ensure non-admin users cannot set records to a 'protected' state (e.g., status = 'approved').

## 2025-05-14 - [HIGH] Prevent AI Prompt Injection via Delimiters
**Vulnerability:** User-provided prompts and recipe data were directly concatenated into AI system instructions, making the application vulnerable to prompt injection where a user could trick the AI into ignoring safety guidelines or leaking internal logic.
**Learning:** LLMs can easily be confused between instructions and data if they are not clearly separated.
**Prevention:** Always wrap user-provided data in unique, explicit delimiters (e.g., USER_REQUEST_START/END) and provide clear system instructions to treat content within those delimiters as data only, ignoring any embedded commands.
