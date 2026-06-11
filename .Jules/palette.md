# Palette's Journal - UX & Accessibility Learnings

## 2025-05-14 - Non-blocking Notifications & Global UI Positioning
**Learning:** Browser-native `alert()` calls disrupt user flow and feel disconnected from the app's high-tech aesthetic. Additionally, notifications placed within the document flow (e.g., using `mt-6`) can be obscured by fixed-position modals or overlays with high z-indices.
**Action:** Always migrate native alerts to the internal `setNotification` system. Ensure the notification component uses `fixed` positioning with a very high z-index (e.g., `z-[150]`) to maintain visibility across all UI states, including open modals.

## 2025-05-14 - Accessibility for Interactive Overlays
**Learning:** Status notifications should be easily perceivable and actionable by screen reader users without manual navigation.
**Action:** Implement `role="status"` and `aria-live="polite"` on notification containers. Ensure icon-only buttons within notifications (like close buttons) have explicit `aria-label` attributes.
