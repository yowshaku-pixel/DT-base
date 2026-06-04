## 2025-05-22 - [Accessibility & Feedback Improvements]
**Learning:** Icon-only buttons (like the Floating Action Hub and AI Chat toggle) must have descriptive `aria-label` attributes to be accessible to screen reader users. Additionally, blocking `alert()` calls can be replaced with the app's internal notification system for a smoother UX.
**Action:** Always check for icon-only buttons and ensure they have `aria-label`. Use the existing `setNotification` state in `App.tsx` for success/info messages instead of native `alert()`.
