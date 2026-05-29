## 2026-04-24 - Added ARIA labels to destructive icon-only buttons
**Learning:** Icon-only buttons using FontAwesome classes (`<i className="fas fa-*"></i>`) in standard components often lack `aria-label` attributes, which creates significant accessibility issues for screen reader users trying to navigate interactive elements.
**Action:** Always verify that buttons containing only icons have a descriptive `aria-label` attribute (e.g., `aria-label="Remove Fermentable"`) to ensure the action is properly announced by screen readers.

## 2026-05-15 - Added proper label associations to complex forms
**Learning:** In complex data-entry components (like `RecipeCreator`), forms often use generic styling or structural tags (`<h4>` for section titles) instead of proper `<label>` elements associated with inputs via `htmlFor` and `id`. This prevents click-to-focus and breaks screen reader form navigation.
**Action:** Always ensure that all form inputs, especially in mapped arrays (like mash steps), have unique `id` attributes and corresponding `<label>` tags with `htmlFor` to improve both usability and automated accessibility testing compliance.
