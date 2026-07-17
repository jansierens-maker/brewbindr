## 2024-05-15 - React Render Optimization
**Learning:** Found multiple expensive operations (array mapping, deduplication loops, filtering) running directly in the render method of AppContent. This causes heavy computations (like `checkRecipeStock` looping through all library items) to run on every component re-render (which triggers frequently due to App.tsx managing lots of states like modals, statuses, etc.). Furthermore, `checkRecipeStock` was called twice for each item (once in `filter` and once in `map`).
**Action:** Use `useMemo` for expensive array transformations (deduplication, filtering, sorting, and mapping) so they are only calculated when their underlying dependencies change.

## 2026-07-17 - RecipeCreator O(N) Array Operations
**Learning:** Found multiple expensive O(N) operations (`.find` and `.filter`) running directly in the render method and inline handlers of `RecipeCreator.tsx`. Specifically, for every ingredient added, the component searched the entire `library` array multiple times per render cycle (e.g. for dropdown lists and stock label rendering).
**Action:** Use `useMemo` to pre-compute a `Map` (`libraryMap`) for O(1) lookups by ID, and a pre-grouped object (`libraryByType`) to eliminate repeated `.filter()` calls during render. This drastically reduces CPU overhead for components scaling with dynamic lists.
