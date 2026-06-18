## 2025-05-15 - Notification Positioning and Z-Index
**Learning:** Notifications (toasts) in complex layouts with multiple modals must use `fixed` positioning and a carefully managed high z-index (e.g., `z-[150]`) to ensure visibility above all possible overlays. Relying on relative positioning often leads to notifications being hidden behind modals or background blurs.
**Action:** Always verify notification visibility by triggering them while various UI overlays (modals, drawers) are active.

## 2025-05-15 - Interactive Elements Accessibility
**Learning:** Converting non-semantic interactive `div` elements to `button` elements is critical for keyboard accessibility. However, it's equally important to ensure they have explicit `type="button"` to avoid accidental form submissions and proper `aria-label` or `aria-labelledby` attributes for screen readers. Focus-visible ring styles should be tailored to the theme to provide clear feedback during keyboard navigation.
**Action:** Use `motion.button` instead of `motion.div` for interactive Framer Motion components and explicitly define focus-visible states.
