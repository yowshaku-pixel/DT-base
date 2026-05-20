## 2025-05-14 - [Aria Label and Title Redundancy]
**Learning:** When adding `aria-label` to an element that already has a dynamic `title`, ensure the `aria-label` also captures the dynamic state, as it overrides the `title` for screen readers.
**Action:** Use template literals to include state in `aria-label` when it matches a dynamic `title`.
