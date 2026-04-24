## 2026-04-24 - Added ARIA labels to destructive icon-only buttons
**Learning:** Icon-only buttons using FontAwesome classes (`<i className="fas fa-*"></i>`) in standard components often lack `aria-label` attributes, which creates significant accessibility issues for screen reader users trying to navigate interactive elements.
**Action:** Always verify that buttons containing only icons have a descriptive `aria-label` attribute (e.g., `aria-label="Remove Fermentable"`) to ensure the action is properly announced by screen readers.
