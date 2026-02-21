# PNSQC Website

Official website for the Pacific Northwest Software Quality Conference (PNSQC).

This repo is a static site built from plain HTML + Tailwind CSS, with a small Node build step that prepares deployable output.

## Stack

- HTML pages in `src/`
- Tailwind CSS v4 (`@tailwindcss/cli`)
- Shared partials in `_partials/` (`header.html`, `footer.html`)
- Custom build script in `build.mjs`
- Output in `dist/` (deploy this folder)

## Quick Start

```bash
npm install
npm run build
```

`npm run build` runs:

1. `npm run build:dist` -> `node build.mjs`
2. `npm run build:css` -> compiles `src/css/input.css` to `dist/css/site.css`

## How the Build Works

`build.mjs` does the following:

1. Recreates `dist/` from `src/`
2. Injects shared header/footer partials into each HTML page in `dist/`
3. Reads each page's `<!-- meta ... -->` block and writes SEO tags into `<head>`
4. Generates `dist/sitemap.xml` and `dist/robots.txt`

Source files in `src/` are not modified by the build.

## Authoring Rules

### 1) Include a per-page metadata block

Place a `meta` comment before `<!DOCTYPE html>`:

```html
<!-- meta
title: Page title
description: Page description
og_image: /images/hero/hero-collaboration.png
-->
<!DOCTYPE html>
```

Defaults come from `site.config.json`.

### 2) Keep partial placeholders empty

In files under `src/`, use the header/footer markers with empty tags:

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

The build injects full partial content into `dist/`.

### 3) Use clean URLs

Prefer links like `/conference/2026/venue/` rather than `.html` file paths.

## Configuration

Edit `site.config.json` for site-wide defaults:

```json
{
  "baseUrl": "https://example.com",
  "siteName": "PNSQC — Pacific NW Software Quality Conference",
  "defaultDescription": "...",
  "defaultOgImage": "/images/hero/hero-collaboration.png",
  "locale": "en_US"
}
```

Important: update `baseUrl` to the production domain before release so canonical, Open Graph, Twitter tags, and sitemap URLs are correct.

## Directory Layout

```text
website/
├── build.mjs
├── package.json
├── site.config.json
├── .agents/                  # local agent skills + scripts
├── _partials/                # shared header/footer snippets
├── content/                  # markdown source material
├── design/                   # design references
├── src/                      # editable site source
└── dist/                     # generated deploy output (gitignored)
```

## Agent Skills (`.agents/skills`)

This repo includes three local automation skills used by coding agents.

Install or update the skills bundle with:

```bash
npx skills add https://github.com/helincao/skilled/
```

- `build`: regenerates `dist/` from current `src/`, `_partials/`, and `site.config.json`.
  - Use after changing site source files or config.
  - Command: `node ".agents/skills/build/scripts/build.mjs" --project-root "$PWD"`
- `github-issues`: reads, comments on, and closes GitHub issues through a local CLI.
  - Requires `.env` values: `GITHUB_API_KEY`, `GITHUB_REPOSITORY`.
  - Example: `node ".agents/skills/github-issues/scripts/github-issues.mjs" read -n 123 --comments`
- `image-gen`: generates image assets (PNG/JPG/WEBP/GIF) from prompts.
  - Requires `.env` value: `GEMINI_API_KEY`.
  - Example: `node ".agents/skills/image-gen/scripts/image-gen/generate.mjs" "conference crowd, warm palette" -a 4:3 -o src/images/hero/example.png`

## Deployment Notes

- Deploy the `dist/` folder.
- `src/404.html` is included as `dist/404.html` for proper not-found responses.
- Do not edit files directly in `dist/`; rebuild from `src/` instead.
