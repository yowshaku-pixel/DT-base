## 2026-09-04 - Quotation Generator Keyboard & Screen Reader Accessibility
**Learning:** Modal components like `QuotationGenerator` need explicit Escape key handlers, matching label/input IDs (`htmlFor` and `id`), ARIA labels on icon-only buttons (`Close modal`, `Remove item`), and `focus-visible` ring indicators for full keyboard and screen reader support.
**Action:** Always ensure modal overlays attach global keydown listeners for Escape key dismissal and link every form label to its corresponding input field.
