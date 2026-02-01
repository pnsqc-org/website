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
1. **Empty placeholder tags:** `<header></header>` and `<footer></footer>` MUST be empty — the build script replaces the entire section with content from `_partials/`
2. **No SEO meta tags:** Don't add `<title>`, `<meta description>`, Open Graph, or Twitter Card tags — the build script injects these from the meta block
3. **Meta block required:** Add page-specific metadata at the top (before `<!DOCTYPE html>`)

**What the build script does:**
- Reads meta block → injects SEO tags into `<head>`
- Finds `<header></header>` placeholder → replaces with `_partials/header.html`
- Finds `<footer></footer>` placeholder → replaces with `_partials/footer.html`
- Generates sitemap and robots.txt
- Copies everything to `dist/`
