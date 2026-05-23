# Palette's Journal - DT.Base

## 2025-05-23 - [Accessibility Baseline for DT.Base]
**Learning:** The application had several icon-only buttons without `aria-label` attributes and unlinked form labels, which made it difficult for screen reader users to navigate the search and settings features.
**Action:** Always provide `aria-label` for icon-only buttons (like 'X' close buttons or gear icons) and ensure `htmlFor`/`id` associations are present in all form components, even for simple search filters.

## 2025-05-23 - [TypeScript and Linting Constraints]
**Learning:** The project has pre-existing TypeScript errors that prevent `pnpm lint` from passing, but the build process (Vite) is configured to proceed.
**Action:** Use `pnpm build` as the primary verification tool for project integrity while the core TypeScript issues remain.
