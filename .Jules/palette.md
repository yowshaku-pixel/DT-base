## 2025-05-14 - [Notification Visibility and Accessibility]
**Learning:** Notifications in complex UIs with modals and long scrolls must use fixed positioning and high z-index to remain effective. Screen reader support via ARIA roles and labels is crucial for icon-only components.
**Action:** Always implement notifications as 'fixed' and use 'role="status"' with 'aria-live="polite"'. Ensure all icon-only buttons have descriptive 'aria-label' attributes.
