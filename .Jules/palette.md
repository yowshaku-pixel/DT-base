# Palette's Journal

## 2025-05-15 - [Notification Visibility & Accessibility]
**Learning:** Global notifications were being obscured by modals (z-100+) and multiple icon-only buttons lacked proper ARIA labels, making the app difficult for screen reader users and inconsistent in feedback visibility.
**Action:** Always use `fixed` positioning with a high z-index (e.g., `z-[150]`) for notifications to ensure they stay on top of all overlays. Ensure every icon-only button has an `aria-label` attribute, prioritizing it even if a `title` attribute exists. Replace browser-native `alert()` with the internal notification system for a non-blocking user experience.
