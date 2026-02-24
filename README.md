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

1. Install Git if you don't already have it: see [`https://git-scm.com/install`](https://git-scm.com/install) for instructions.
2. Clone this repository (`git clone https://github.com/pnsqc-org/website.git`).
3. Open a Terminal/Command Prompt, and navigate to the downloaded folder (`cd /path/to/website`).
4. Run the following commands:
    ```bash
    npm install
    npm run build
    ```
5. Set up a local development server that can properly "host" the static HTML files. If you use VS Code, you can use the "Live Server" extension. In your dev server settings, ensure you set `/dist` as the "custom root" for file serving.
6. Run the web server and navigate to the port its running on (ie. `localhost:5500`) to see your rendered local copy of the website.
7. As you make changes, simply run `npm run build` again, and your web browser will automatically refresh with the latest changes.

## How the Build Works

`npm run build` runs:
  1. `npm run build:dist` -> `node build.mjs`
      1. Recreates `dist/` from `src/`
      2. Injects shared header/footer partials into each HTML page in `dist/`
      3. Reads each page's `<!-- meta ... -->` block and writes SEO tags into `<head>`
      4. Generates `dist/sitemap.xml` and `dist/robots.txt`
  2. `npm run build:css` -> compiles `src/css/input.css` to `dist/css/site.css`

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

This repo includes local automation skills used by coding agents.

Install or update the skills bundle with:

```bash
npx skills add https://github.com/helincao/skilled/
```

- `cloudflare`: Cloudflare platform workflows (Workers, Pages, storage, networking, security, IaC).
  - Use for Cloudflare deployment/infrastructure tasks.
- `github-issues`: reads, comments on, and closes GitHub issues through a local CLI.
  - Requires `.env` values: `GITHUB_API_KEY`, `GITHUB_REPOSITORY`.
  - Example: `node ".agents/skills/github-issues/scripts/github-issues.mjs" read -n 123 --comments`
- `use-gmail`: reads/searches Gmail, drafts/sends email, and looks up Google contacts.
  - Requires `.env` values: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
  - Stores OAuth tokens/account metadata in `.env`: `GMAIL_SKILL_TOKENS_B64`, `GMAIL_SKILL_ACCOUNTS_META_B64`
- `image-gen`: generates image assets (PNG/JPG/WEBP/GIF) from prompts.
  - Requires `.env` value: `GEMINI_API_KEY`.
  - Example: `node ".agents/skills/image-gen/scripts/image-gen/generate.mjs" "conference crowd, warm palette" -a 4:3 -o src/images/hero/example.png`

## Deployment

When ready to upload your changes:

1. Make a Git commit to a new branch, and push it to the GitHub remote:
    ```bash
    git checkout -b my-branch
    git add *
    git commit -m "Helpful commit message of my change"
    git push
    ```

2. Open a Pull Request (PR) to `main` for your change on GitHub, and request someone to review/approve the change.
    - While waiting, we use Cloudflare to host our website, and have integrated it with GitHub so that every commit will generate a "build" with a unique URL for you to visit to validate your changes work when deployed.

3. When the reviewer has approved your PR, you should be the one to merge your work. Once merged, Cloudflare will redeploy our production website with the new change.