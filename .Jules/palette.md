# Palette's Journal - Critical UX & Accessibility Learnings

## 2025-05-14 - Initializing UX Focus
**Learning:** Internal notification systems provide a more integrated experience than browser-native alerts, but must be carefully positioned with high z-indices to remain visible over modals.
**Action:** Replace `alert()` with the internal notification system and ensure it uses `fixed` positioning with `z-[150]`.
