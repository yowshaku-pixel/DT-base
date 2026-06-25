## 2025-05-15 - Consistent Notification System
**Learning:** Using browser-native `alert()` creates a jarring user experience that breaks the application's visual flow and theme. Integrating all user feedback into a consistent, non-blocking notification system (like the one already in `src/App.tsx`) makes the interface feel more professional and cohesive.
**Action:** Replace all `alert()` calls with the internal `setNotification` system to ensure a consistent micro-UX across the application.
