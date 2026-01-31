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

This runs three steps in order: `build.mjs` (partials + SEO), the Tailwind CLI (CSS), then `build.mjs dist` (assembles the publish directory). You can also run them separately:

```bash
npm run build:html   # just partials + SEO
npm run build:css    # just Tailwind CSS
npm run build:dist   # just assemble dist/
```

## URL Conventions

**Use clean URLs** — link to pages without `.html` extensions:

```html
<a href="/about">About</a>
<a href="/conference/2025">2025 Conference</a>
```

Files are still named `about.html`, `index.html`, etc., but Cloudflare Pages (and similar hosts) serve them at clean URLs automatically.

## Build Script (`build.mjs`)

The build script handles five things:

1. **Partial injection** — replaces header/footer marker blocks in every HTML file in `src/` with the contents of `_partials/header.html` and `_partials/footer.html`
2. **SEO meta injection** — reads a `<!-- meta ... -->` comment block from each HTML file and injects `<title>`, `<meta description>`, Open Graph, Twitter Card, and canonical URL tags into `<head>`
3. **Sitemap generation** — walks all `.html` files in `src/` and writes `src/sitemap.xml`
4. **robots.txt generation** — writes `src/robots.txt` with a sitemap reference
5. **Dist assembly** (`node build.mjs dist`) — copies `src/` to `dist/`, excluding only the Tailwind source file (`input.css`)

### Site configuration

Edit `site.config.json` to set site-wide defaults:

```json
{
  "baseUrl": "https://example.com",
  "siteName": "PNSQC — Pacific NW Software Quality Conference",
  "defaultDescription": "...",
  "defaultOgImage": "/images/og-default.png",
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

HTML files use comment markers to indicate where partials should be injected:

```html
<!-- ============================================================
     HEADER (from _partials/header.html)
     ============================================================ -->
<header>...</header>

<!-- ============================================================
     FOOTER (from _partials/footer.html)
     ============================================================ -->
<footer>...</footer>
```

The build script replaces everything from the marker comment through the closing `</header>` or `</footer>` tag with the current partial content.

### Source directory (`src/`) and publish directory (`dist/`)

All publishable content lives in `src/`: HTML pages, CSS, images, and generated files (`sitemap.xml`, `robots.txt`). The repo root contains only build tooling and non-published source files.

Running `npm run build` (or `npm run build:dist`) copies `src/` to `dist/`, excluding only the Tailwind source file (`input.css`). Point your static host's publish directory at `dist/`.

Both `src/sitemap.xml`, `src/robots.txt`, and `dist/` are git-ignored and rebuilt from scratch on every build.

## Content Workflow

1. Edit or create a markdown file in `content/`
2. Use AI to generate the HTML page from the markdown + a template example
3. Add a `<!-- meta ... -->` block at the top with title, description, and og_image
4. Add the partial marker comments for header and footer
5. Place the HTML file in `src/` (e.g., `src/about/index.html`)
6. Run `npm run build`
7. Commit and push — the site deploys automatically

## Project Structure

```
website/
├── ─── Config & Build ────────────────────────────
├── build.mjs                        # build script (partials, SEO, sitemap, dist)
├── site.config.json                 # site-wide config (base URL, defaults)
├── package.json
│
├── ─── Build Inputs (not published) ──────────────
├── _partials/
│   ├── header.html
│   └── footer.html
├── content/                         # markdown source files
├── skills/                          # Codex skills (includes image-gen CLI)
├── design/                          # design references
│
├── ─── Publishable Source ────────────────────────
├── src/
│   ├── index.html
│   ├── sitemap.xml                  # generated by build
│   ├── robots.txt                   # generated by build
│   ├── css/
│   │   ├── input.css                # Tailwind source (not published)
│   │   └── site.css                 # Tailwind output
│   ├── images/
│   ├── about/
│   │   └── index.html
│   ├── cfp/
│   │   └── index.html
│   ├── blog/
│   │   └── 2026-01-03-workshops.html
│   └── conference/
│       ├── 2025/
│       │   ├── index.html
│       │   ├── papers.html
│       │   ├── workshops.html
│       │   └── keynotes.html
│       └── 2024/
│           └── ...
│
└── ─── Publish Output ────────────────────────────
    dist/                            # copy of src/ (git-ignored)
```
