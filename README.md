# PNSQC Website

Official website of the Pacific Northwest Software Quality Conference.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Markup | Plain HTML | AI generates pages directly from markdown; no templating language needed |
| Styling | Tailwind CSS (CLI) | Utility classes, responsive design; CLI generates a small, purged CSS file |
| Shared layout | `_partials/` (header/footer snippets) | Keeps nav and footer consistent across all pages |
| Build | `build.mjs` (zero dependencies) | Injects partials, SEO meta tags, generates sitemap and robots.txt |
| Hosting | GitHub Pages / Netlify / Cloudflare Pages | Free, fast CDN, deploy on `git push` |
| Content source | Markdown files in `content/` | Authors edit markdown, AI regenerates HTML |

No framework, no CMS. The build step is a single command:

```bash
npm run build
```

This runs two steps: `build.mjs` (copies to `dist/` and injects partials + SEO), then Tailwind CLI (compiles `src/css/input.css` to `dist/css/site.css`).

## URL Conventions

**Use clean URLs** — link to pages without `.html` extensions:

```html
<a href="/about">About</a>
<a href="/conference/2025">2025 Conference</a>
```

Files are still named `about.html`, `index.html`, etc., but Cloudflare Pages (and similar hosts) serve them at clean URLs automatically.

## Custom 404 Page (Cloudflare Pages)

This project includes a dedicated `src/404.html` page. During build, it is copied to `dist/404.html`, which Cloudflare Pages serves automatically for unknown routes.

- No catch-all SPA rewrite is required.
- Keep this page at the root (`/404.html`) so invalid URLs return a proper `404` response.
- The build preserves root-absolute asset paths on `404.html` so styles and images still load even when the requested URL is invalid.

## Build Script (`build.mjs`)

The build script:

1. **Copies** `src/` → `dist/` (excluding Tailwind source file `input.css`)
2. **Processes HTML in `dist/`** only:
   - Injects header/footer from `_partials/` into empty `<header></header>` and `<footer></footer>` tags
   - Reads `<!-- meta ... -->` blocks and injects SEO tags (`<title>`, meta description, Open Graph, etc.) into `<head>`
3. **Generates** `dist/sitemap.xml` and `dist/robots.txt`

**Important:** Source files in `src/` remain untouched. Only `dist/` files are modified.
The `npm run build` script then generates the compiled CSS file at `dist/css/site.css`.

### Site configuration

Edit `site.config.json` to set site-wide defaults:

```json
{
  "baseUrl": "https://example.com",
  "siteName": "PNSQC — Pacific NW Software Quality Conference",
  "defaultDescription": "...",
  "defaultOgImage": "/images/hero/hero-collaboration.png",
  "locale": "en_US"
}
```

### Per-page metadata

Add a `<!-- meta ... -->` comment block at the top of each HTML file (before `<!DOCTYPE html>`):

```html
<!-- meta
title: PNSQC 2025 Call for Papers
description: Submit your proposal for PNSQC 2025...
og_image: /images/cfp-2025.png
-->
<!DOCTYPE html>
...
```

All fields are optional — the build script falls back to `site.config.json` defaults.

### Partial markers

HTML files in `src/` **MUST use empty tags** as placeholders:

```html
<!-- ============================================================
     HEADER (from _partials/header.html)
     ============================================================ -->
<header></header>

<!-- ============================================================
     FOOTER (from _partials/footer.html)
     ============================================================ -->
<footer></footer>
```

**⚠️ CRITICAL:** Tags must be empty in `src/` files. The build script injects full content into `dist/` files only.

### Source directory (`src/`) and publish directory (`dist/`)

- **`src/`** — source content (HTML with empty header/footer tags, Tailwind input CSS, images)
- **`dist/`** — build output with injected partials, SEO, sitemap, robots.txt (git-ignored)

The build copies `src/` → `dist/`, then processes `dist/` files. Point your static host at `dist/`.

## Content Workflow

1. Edit/create markdown in `content/`
2. Generate HTML from markdown (with AI)
3. Add `<!-- meta ... -->` block and empty header/footer tags
4. Place in `src/`
5. Run `npm run build`
6. Commit and push

## Project Structure

```
website/
├── build.mjs                        # build script
├── site.config.json                 # site-wide config
├── package.json
│
├── _partials/                       # header/footer snippets
├── content/                         # markdown sources
├── skills/                          # Claude Code skills
├── design/                          # design references
│
├── src/                             # source files (HTML, CSS, images)
│   ├── index.html
│   ├── css/
│   │   ├── input.css                # Tailwind source
│   └── ...
│
└── dist/                            # build output (git-ignored)
    ├── index.html                   # with injected header/footer/SEO
    ├── css/site.css                 # compiled CSS
    ├── sitemap.xml                  # generated
    ├── robots.txt                   # generated
    └── ...
```
