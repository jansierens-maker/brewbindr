# Sentinel's Journal - Security Learnings

## 2026-02-12 - API Endpoint Security Standard
**Vulnerability:** AI API endpoints (`api/generate-recipe.ts` and `api/analyze-tasting.ts`) lacked input length validation and returned detailed error messages to the client.
**Learning:** External API integrations (like Gemini) can be targets for resource exhaustion (DoS) if input sizes are not capped. Additionally, leaking raw error messages can expose internal architecture or API details.
**Prevention:** Always implement input length validation (e.g., 2000 chars for text prompts, 10000 for structured data) and return generic, non-informative error messages to the client while logging details on the server.
