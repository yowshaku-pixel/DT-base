## 2025-05-22 - [Theme-Aware Toast Notifications]
**Learning:** Notifications using static light text colors (e.g., `text-green-200`) become unreadable in light themes. Using theme-aware Tailwind classes (e.g., `text-green-700 dark:text-green-200`) ensures proper contrast across all display modes.
**Action:** Always use theme-aware color utilities for text and interactive elements that may be displayed in both light and dark modes.

## 2025-05-22 - [Fixed Toast Positioning]
**Learning:** Notifications placed in the flow of a header or main layout can be obscured by high-z-index elements like modals or absolute overlays.
**Action:** Use `fixed` positioning with a very high z-index (e.g., `z-[150]`) for toast notifications to ensure they are always visible and do not cause layout shifts when they appear/disappear.
