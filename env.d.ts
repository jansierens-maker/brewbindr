// Type libraries for the app (Vite's import.meta and ?raw imports) and the API functions (Node).
// Referenced here and not in tsconfig "types": Vercel compiles the API functions with a temporary
// tsconfig in another folder that extends ours, and resolves "types" from there, where they are
// not found (TS2688). A reference is resolved from this file, in the project.
/// <reference types="vite/client" />
/// <reference types="node" />
