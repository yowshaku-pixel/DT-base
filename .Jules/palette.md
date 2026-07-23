# Palette's Journal - Critical Learnings Only

## 2025-03-03 - Accessible Theme-Aware Interactive Controls
**Learning:** Icon-only buttons lacking `aria-label` attributes and keyboard focus-visible rings make dynamic, custom-themed interfaces inaccessible to screen reader and keyboard navigators. Furthermore, focus ring indicators must adapt to the active visual theme (e.g., violet/purple vs indigo/pro theme) to ensure sufficient contrast and visual cohesion.
**Action:** Always convert container `motion.div` elements used as buttons into proper interactive `motion.button` elements, declare dynamic and descriptive `aria-label` attributes for icon-only components, and apply theme-aware focus ring classes (`focus-visible:ring-2 focus-visible:ring-offset-2 outline-none` coupled with theme-specific ring colors).
