## 2025-05-14 - Theme-Aware Notification Contrast
**Learning:** Hardcoded light text shades (e.g., `text-purple-200`) in notification toasts become illegible when the application is switched to a light theme, as the background also becomes light/white.
**Action:** Always use theme-aware color variants (e.g., `text-purple-700 dark:text-purple-200`) for high-contrast text in UI components that persist across theme changes.

## 2025-05-14 - Focus-Visible Ring Patterns
**Learning:** The application uses a variety of custom border colors (neon-border-violet, cyan, etc.) but often lacks standard focus indicators for keyboard users.
**Action:** Implement `focus-visible:ring-2` with `outline-none` on all interactive icon-only buttons, matching the ring color to the component's primary accent (e.g., `ring-cyan-500` for the FAB).
