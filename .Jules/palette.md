## 2025-05-15 - [Favor Internal Notifications Over Native Alerts]
**Learning:** Browser-native `alert()` calls are blocking, inconsistent across browsers, and disruptive to the user flow in a modern, high-fidelity UI like DT.Base. Using an internal, non-blocking notification system provides a more integrated and pleasant experience.
**Action:** Always check for an existing `notification` or `toast` system before using `alert()` or `confirm()`.

## 2025-05-15 - [Icon-only Close Buttons Need ARIA Labels]
**Learning:** Small 'X' icons used for closing notifications or modals are often implemented without descriptive text, making them inaccessible to screen reader users who only hear "button".
**Action:** Ensure all icon-only buttons have an `aria-label` that describes their action (e.g., "Dismiss notification", "Close modal").
