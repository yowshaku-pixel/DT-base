# Palette's Journal - DT.Base

## 2025-05-15 - [Non-blocking Notifications vs. Browser Alerts]
**Learning:** Using the application's internal `notification` system (`setNotification`) is significantly less disruptive than browser-native `alert()` calls, especially for frequent actions like "Copied to clipboard."
**Action:** Always check for an internal notification system before using `alert()`.

## 2025-05-15 - [Accessibility for Icon-only Buttons]
**Learning:** The app uses many icon-only buttons with `title` attributes, but these are often insufficient for screen readers.
**Action:** Always supplement `title` with a descriptive `aria-label` for icon-only buttons to ensure they meet WCAG standards.
