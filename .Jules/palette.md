## 2026-06-12 - [Notification Visibility & Accessibility]
**Learning:** Notifications in complex dashboards with many modals can be obscured if they use relative positioning or low z-indices. Standardizing on `fixed` positioning with a high z-index ensures critical feedback is always visible. Native browser `alert()` calls should be avoided as they block the main thread and break the application's aesthetic consistency.
**Action:** Always prefer the internal non-blocking notification system. Ensure the notification container uses `role="status"` and `aria-live="polite"` for accessibility.

## 2026-06-12 - [Semantic Interactive Elements]
**Learning:** Theme toggles and other custom controls implemented with `div` or `span` are invisible to screen readers and difficult to navigate via keyboard. Converting them to semantic `button` elements with `type="button"` and `aria-label` significantly improves accessibility.
**Action:** Use `motion.button` instead of `motion.div` for interactive Framer Motion components. Always include `aria-label` for icon-only buttons.
