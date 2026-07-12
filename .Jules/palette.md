## 2025-05-22 - [Fixed Overlay Notification Pattern]
**Learning:** For floating toast notifications, wrapping the container in `fixed pointer-events-none` while setting the toast itself to `pointer-events-auto` allows for an interactive, accessible overlay that doesn't block the rest of the UI's mouse interactions.
**Action:** Use this pattern for all non-modal persistent status overlays to maintain high accessibility and visual stability without layout shifts.
