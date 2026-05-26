## 2025-05-15 - Notification Z-Index Conflict
**Learning:** The application's internal notification system (`setNotification`) uses a z-index of `z-50`, whereas most modals and slide-out panels use `z-[100]` or higher. This causes non-blocking notifications to be obscured by active modals, potentially hiding critical feedback from the user.
**Action:** When implementing notifications that might be triggered from within a modal context, verify visibility and consider boosting the notification container's z-index or using a portal to ensure it remains on the top layer.
