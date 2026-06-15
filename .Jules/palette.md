# Palette's Journal - Critical UX/Accessibility Learnings

## 2025-05-14 - Global Notifications & High Z-Index
**Learning:** In complex applications with many modals (z-100+), standard notification positioning often fails because they get obscured by overlays. Notifications should use `fixed` positioning and a very high z-index (e.g., `z-[150]`) to ensure visibility across all app states.
**Action:** Always place the notification system at the root of the component tree and use a z-index higher than the highest modal.

## 2025-05-14 - Non-blocking Feedback vs. Native Alerts
**Learning:** Native `alert()` calls are disruptive and break the "flow" of a modern micro-UX focused interface. They also cannot be styled to match the app's theme.
**Action:** Favor internal notification systems over browser-native alerts for all feedback, including errors and success confirmations.

## 2025-05-14 - Accessibility for Icon-only Buttons
**Learning:** High-visibility icon-only buttons (like theme switchers) are often implemented as `div` or `motion.div` for animation flexibility, which breaks keyboard navigation and screen reader support.
**Action:** Use `motion.button` with `type="button"`, explicit `aria-label`, and `focus-visible` ring styles for all interactive icon-only elements.
