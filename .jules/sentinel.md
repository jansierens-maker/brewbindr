## 2026-05-22 - API Information Leakage and Input Validation
**Vulnerability:** API endpoints leaked detailed error messages (including stack traces if available) and lacked input length validation.
**Learning:** Returning `error.message` directly from a try/catch block to the client is a common security pitfall that can expose internal application details. Lack of input validation on AI-powered endpoints can lead to resource exhaustion.
**Prevention:** Always use generic error messages for client responses in API handlers. Implement strict input length and type validation for all user-provided data before processing.
