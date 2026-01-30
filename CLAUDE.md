# CLAUDE.md

See [README.md](README.md) for project documentation, build commands, content workflow, and project structure.

## Quick Reference

**Build:** `npm run build` (or see README for individual steps)

**Project layout:**
- `src/` — all publishable content (HTML, CSS, images)
- `_partials/` — header/footer snippets injected by build
- `content/` — markdown source files
- `dist/` — build output (copy of src/, git-ignored)

**Tailwind brand colors** (defined in `src/css/input.css` under `@theme`):
- `pnsqc-gold` / `pnsqc-gold-light` / `pnsqc-gold-dark`
- `pnsqc-blue` / `pnsqc-blue-light` / `pnsqc-blue-dark`
- `pnsqc-navy`, `pnsqc-cyan`, `pnsqc-slate`

Light/dark theming uses `[data-theme="light"]` selector.

**HTML pages:** Place in `src/`, require meta block + partial markers (see README for format)
