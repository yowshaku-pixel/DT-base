# Palette's Journal - DT.Base Micro-UX & Accessibility

This journal records critical UX and accessibility learnings discovered during the development of DT.Base.

## 2025-05-20 - Initial Discovery
**Learning:** The application uses a highly visual, "cyberpunk" aesthetic with many icon-only buttons and nested filter inputs that lacked proper ARIA associations and labels, potentially hindering screen reader users despite the high-quality visual design.
**Action:** Always ensure that visual labels are linked to inputs via `id`/`htmlFor` and that icon-only interactive elements have descriptive `aria-label` attributes.
