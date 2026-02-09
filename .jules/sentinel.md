## 2026-02-10 - [Secret Leakage via Build Config]
**Vulnerability:** Environment variables defined in `vite.config.ts` via `define` are baked into the client-side bundle.
**Learning:** The project used `loadEnv` to load all environment variables and then explicitly mapped `API_KEY` into `process.env.API_KEY` for the frontend. Even if not explicitly used in the source code, this creates a high risk of accidental exposure if a developer logs `process.env` or if the build tool doesn't tree-shake it.
**Prevention:** Only expose public configuration to the frontend. Secrets must be restricted to backend serverless functions and removed from build tool definitions like Vite's `define` or Webpack's `DefinePlugin`.
