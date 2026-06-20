## 2025-05-15 - Accessibility for custom-styled interactive elements
**Learning:** Custom interactive elements (like `motion.div` from framer-motion) that behave like buttons must be converted to `button` elements to inherit standard keyboard behaviors (tabbing, Enter/Space support) and must include explicit `aria-label` and `type="button"`.
**Action:** Always prefer `motion.button` over `motion.div` for interactive controls and ensure `aria-label` is present for all icon-only buttons.
