# CLAUDE.md

AI coding agent instructions for the PNSQC website project.

See [README.md](README.md) for full documentation.

## Quick Reference

**Build:** `npm run build`

**Tailwind brand colors** (in `src/css/input.css`):
- `pnsqc-gold`, `pnsqc-blue`, `pnsqc-navy`, `pnsqc-cyan`, `pnsqc-slate` (each with `-light` and `-dark` variants)

**Key principle:** Source files in `src/` have empty header/footer tags. Build script copies to `dist/` and injects content there.

## HTML File Format

HTML files in `src/` must follow this structure:

```html
<!-- meta
title: Page Title
description: Page description
og_image: /images/hero/hero-collaboration.png
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="css/site.css">
</head>
<body class="bg-pnsqc-navy text-white antialiased has-fixed-header">

  <!-- ============================================================
       HEADER (from _partials/header.html)
       ============================================================ -->
  <header></header>

  <!-- YOUR PAGE CONTENT HERE -->

  <!-- ============================================================
       FOOTER (from _partials/footer.html)
       ============================================================ -->
  <footer></footer>

</body>
</html>
```

**CRITICAL RULES:**

1. **Empty placeholders in `src/`:** Always use empty `<header></header>` and `<footer></footer>` tags
   - ⚠️ Never put content between these tags
   - ✅ Correct: `<header></header>`
   - ❌ Wrong: `<header>...any content...</header>`

2. **No manual SEO tags:** Build script injects `<title>`, meta tags, Open Graph, etc. from the meta block

3. **Meta block required:** Always include page metadata before `<!DOCTYPE html>`

**Build behavior:**
- Copies `src/` → `dist/`
- Injects partials and SEO **into `dist/` files only**
- Leaves `src/` files untouched
- Edit headers/footers in `_partials/`, not in HTML files

## Common Mistakes

### ❌ Header/footer content in `src/` files

If `src/` files have full header/footer HTML instead of empty tags:

1. Replace with empty placeholders:
   ```html
   <header></header>
   ```
   ```html
   <footer></footer>
   ```
2. Run `npm run build`

### ❌ Editing files in `dist/`

Never edit `dist/` files directly — they're overwritten on every build. Edit `src/` files instead.
