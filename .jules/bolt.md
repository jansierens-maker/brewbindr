## 2024-05-15 - React Render Optimization
**Learning:** Found multiple expensive operations (array mapping, deduplication loops, filtering) running directly in the render method of AppContent. This causes heavy computations (like `checkRecipeStock` looping through all library items) to run on every component re-render (which triggers frequently due to App.tsx managing lots of states like modals, statuses, etc.). Furthermore, `checkRecipeStock` was called twice for each item (once in `filter` and once in `map`).
**Action:** Use `useMemo` for expensive array transformations (deduplication, filtering, sorting, and mapping) so they are only calculated when their underlying dependencies change.

## 2024-05-16 - O(N) Array Scans in Render Loops
**Learning:** Found an anti-pattern where an array map was executing `library.find()` internally over nested structures, resulting in multiple expensive O(N) array scans during the render pass of `RecipeCreator.tsx`.
**Action:** Always extract and memoize mapping logic by building a standard `Map` structure with `useMemo`, allowing `Map.get(id)` for immediate, cost-free lookups. Extract noisy JSX lookups to a separate helper to improve cleanliness.
