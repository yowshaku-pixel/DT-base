## 2025-03-24 - [Notification Visibility and Contrast]
**Learning:** Global notifications (toasts) in an app with heavy modal usage must use fixed positioning and a high z-index (z-150+) to remain visible. Standard theme-aware colors (e.g., text-green-700) provide better accessibility in light themes than standard "light" shades (e.g., text-green-200).
**Action:** Always verify overlay interactions when implementing notifications and use specific theme-aware contrast classes for text.
