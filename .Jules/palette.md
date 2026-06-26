# Palette's Journal - DT.Base UX & Accessibility

## 2025-05-14 - Notification Visibility & Overlay Constraints
**Learning:** Notifications were originally using standard flow/margin positioning which caused them to be obscured by fixed modals (z-100+). Relying on theme-aware text colors (e.g., `text-green-700 dark:text-green-200`) is critical for readability across the 'light', 'dark', 'black', and 'pro' themes.
**Action:** Use `fixed` positioning with a high z-index (`z-[150]`) for all global toast notifications to ensure they remain on top of all overlays. Always apply theme-conditional text colors instead of single-shade defaults.

## 2025-05-14 - Icon-Only Button Accessibility Pattern
**Learning:** The application uses many `motion.div` and `motion.button` elements for interactive icons. Screen readers fail to identify `div` elements as interactive, and even `button` elements need explicit `aria-label` when they only contain an icon, regardless of whether a `title` attribute is present.
**Action:** Always convert interactive `div` wrappers to `button` elements (with `type="button"`). Every icon-only button must have an `aria-label` describing its action for screen reader parity.

## 2025-05-14 - Notification System Refinement
**Learning:** Replacing browser-native `alert()` with an internal notification system significantly improves UX by preventing thread-blocking and allowing for a branded, non-disruptive feedback loop.
**Action:** Audit and replace any remaining browser-native popups with the `setNotification` system to maintain a professional, cohesive interface.
