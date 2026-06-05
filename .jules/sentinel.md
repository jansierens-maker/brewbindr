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

## 2025-05-14 - [MEDIUM] Harden AI Endpoints against Prompt Injection
**Vulnerability:** User-provided prompts and data were passed directly to the Gemini AI model without isolation. This made the AI susceptible to prompt injection attacks where a user could try to override system instructions.
**Learning:** LLMs can be instructed to ignore user input if it is clearly delimited and accompanied by a system-level directive to treat it as data.
**Prevention:** Always wrap untrusted user input in XML-style tags (e.g., <PROMPT>) and explicitly instruct the AI to treat content within those tags strictly as data. Additionally, perform strict type validation on complex objects before stringifying them for the AI.

## 2025-05-14 - [CRITICAL] Replaced Weak Random Number Generator
**Vulnerability:** Weak cryptographically insecure ID generation was utilized for creating IDs using `Math.random().toString(36).substr(2, 9)`.
**Learning:** Usage of `Math.random` to generate unique IDs or security sensitive data poses a severe security risk and may be prone to predictability and collisions.
**Prevention:** It's imperative to use cryptographically secure implementations for randomness such as `crypto.randomUUID()` in Node.js instead.
## 2025-05-14 - [MEDIUM] Prevent Information Leakage in API Logging\n**Vulnerability:** The API endpoints `api/analyze-tasting.ts` and `api/generate-recipe.ts` were logging the full `error` object in their `catch` blocks. This could potentially leak internal stack traces or sensitive request configuration details into server logs.\n**Learning:** Always explicitly restrict what is logged when handling errors in production-facing API routes.\n**Prevention:** In `catch (error: any)` blocks within API endpoints, log only `error.message` or provide a safe generic string fallback to ensure no internal objects or stack traces are accidentally persisted to logs.
