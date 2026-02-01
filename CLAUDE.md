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

## HTML File Format

HTML files in `src/` must follow this structure:

```html
<!-- meta
title: Page Title
description: Page description
og_image: /images/og-default.png
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
1. **Empty placeholder tags:** `<header></header>` and `<footer></footer>` MUST be empty in `src/` files — the build script injects content from `_partials/` into `dist/` files
   - ⚠️ **NEVER put any content between these tags in `src/` files** — not even comments or whitespace
   - ✅ Correct: `<header></header>`
   - ❌ Wrong: `<header>...any content...</header>`
2. **No SEO meta tags:** Don't add `<title>`, `<meta description>`, Open Graph, or Twitter Card tags — the build script injects these from the meta block
3. **Meta block required:** Add page-specific metadata at the top (before `<!DOCTYPE html>`)

**What the build script does:**
1. Copies all files from `src/` to `dist/`
2. Processes HTML files **in `dist/`** only:
   - Reads meta block → injects SEO tags into `<head>`
   - Finds `<header></header>` placeholder → replaces with `_partials/header.html`
   - Finds `<footer></footer>` placeholder → replaces with `_partials/footer.html`
3. Generates sitemap and robots.txt in `dist/`

**Important:** The build script **leaves `src/` files untouched**:
- Source files in `src/` always contain empty `<header></header>` and `<footer></footer>` placeholders
- Only `dist/` files have the full header/footer content
- `dist/` is what gets published to the web
- To edit headers/footers, modify the files in `_partials/` and rebuild

## Troubleshooting

### ❌ Problem: Header/Footer Content in Source Files

**Symptoms:**
- `src/` HTML files contain full header/footer HTML instead of empty placeholders
- This shouldn't happen with the current build script, but may occur if files are manually edited

**Cause:** Manually copying header/footer content into `src/` files instead of keeping them as empty placeholders

**Solution:**
1. Open the affected file in `src/` (NOT `dist/`)
2. Find the header section and replace it with just:
   ```html
   <!-- ============================================================
        HEADER (from _partials/header.html)
        ============================================================ -->
   <header></header>
   ```
3. Find the footer section and replace it with just:
   ```html
   <!-- ============================================================
        FOOTER (from _partials/footer.html)
        ============================================================ -->
   <footer></footer>
   ```
4. Run `npm run build` to regenerate `dist/` properly

**Prevention:**
- Always use empty `<header></header>` and `<footer></footer>` tags in `src/` files
- Never manually edit header/footer content in `src/` files
- The build script processes `dist/` files only, leaving `src/` untouched
- To edit headers/footers, modify `_partials/header.html` or `_partials/footer.html`
