## 2025-05-15 - [Non-blocking Notifications over Alerts]
**Learning:** Browser-native `alert()` calls disrupt the user flow and don't match the application's aesthetic. Using the internal notification system provides a smoother, non-blocking UX.
**Action:** Always prefer `setNotification` (or equivalent internal system) over `alert()` for user feedback like "Copied to clipboard".
