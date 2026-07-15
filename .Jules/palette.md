## 2025-05-14 - Accessibility & Contrast Improvements

**Learning:** Micro-UX enhancements should always include semantic HTML and theme-aware contrast. Icon-only buttons often lack `aria-label`, making them inaccessible to screen readers. Additionally, fixed-color notifications (e.g., `text-green-200`) can have poor contrast in light themes.

**Action:**
1. Always add `aria-label` to icon-only buttons.
2. Convert interactive `div` elements to `button` elements to ensure keyboard accessibility (tabbing and focus states).
3. Use theme-aware utility classes (e.g., `text-green-700 dark:text-green-200`) for notifications to maintain contrast across all display modes.
4. Ensure all interactive elements have visible focus indicators (`focus-visible:ring-2`).
