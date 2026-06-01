## 2025-05-22 - Notification Visibility and Accessibility
**Learning:** In-flow notifications were easily obscured by modals and lacked screen reader attributes.
**Action:** Always use fixed positioning with high z-index (z-[150]+) for toast notifications to ensure visibility over overlays. Include role="status" and aria-live="polite" for accessibility.
