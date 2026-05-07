# PNSQC Website

Official website for the Pacific Northwest Software Quality Conference (PNSQC).

This repository is a static site built from plain HTML + Tailwind CSS, with a small Node build step that prepares deployable output. There are also various JS modules to help make the site interactive and pull data from third-party services we utilize.

## Stack

- HTML pages in `src/`
  - Shared partials in `src/_partials/` (`header.html`, `footer.html`)
- Tailwind CSS v4 (`@tailwindcss/cli`)
- Custom build script in `build.mjs`
- Cloudflare Pages Functions at `functions` for fetching Meetup event data on page load
- Output in `dist/` (deploy this folder)
  - `src/404.html` is included as `dist/404.html` for proper not-found responses.

## Quick Start

1. Install Git if you don't already have it: see [`https://git-scm.com/install`](https://git-scm.com/install) for instructions.
2. Clone this repository (`git clone https://github.com/pnsqc-org/website.git`).
3. Open a Terminal/Command Prompt, and navigate to the downloaded folder (`cd /path/to/website`).
4. Install the dependencies: `npm install`
5. Rename the file `wrangler-local.jsonc` -> `wrangler.jsonc`
6. Start a local development server: `npm run start:local`
7. Navigate to the local URL shown by Wrangler's terminal output to see your rendered copy of the website.
8. While the Wrangler server runs, changes under `src/` will automatically rerun the local build and live-reload the page.

## Build / Deployment

### Build Process

`npm run build` runs:

1. `npm run build:dist` -> `node build.mjs`
   1. Recreates `dist/` from `src/`
   2. Injects shared header/footer partials from `src/_partials/` into each HTML page in `dist/`
   3. Reads each page's `<!-- meta ... -->` block and writes the page `<title>`, description, canonical, Open Graph, robots, and X/Twitter card tags into `<head>`
   4. Generates `dist/sitemap.xml` and `dist/robots.txt`
2. `npm run build:css` -> compiles `src/css/input.css` to `dist/css/site.css`

- These files in the `dist/` folder are what will be deployed to our production website.
- Source files in `src/` are not modified when the build is run.
- You should not edit files directly in `dist/`; rebuild each time from `src/` instead.

### Deployment

When ready to upload your changes:

1. Make a Git commit to a new branch:

   ```bash
   git checkout -b my-branch
   git add *
   git commit -m "Helpful commit message of my change"
   ```

2. Formatting and linting checks will be automatically run against your code; if any problems are encountered, it will not finish making the commit by design until the issue(s) are addressed.

3. Once the commit is made, push it: `git push`

4. Open a Pull Request (PR) to `main` for your change on GitHub, and request someone to review/approve the change.
   - While waiting, we use Cloudflare to host our website, and have integrated it with GitHub so that every commit will generate a "build" with a unique URL for you to visit to validate your changes work when deployed.

5. When the reviewer has approved your PR, you should be the one to merge your work. Once merged, Cloudflare will redeploy our production website with the new change.

### Cloudflare Integration

We deploy our built website to Cloudflare Pages, which hosts our site and manages our DNS. This is done automatically as code is pushed to our repository with an installed GitHub app.

There are certain environment variables defined in Cloudflare so that we can authenticate with Meetup's API to retrieve event data. There is also an environment variable that allows us to define Luma event URLs for particular events (`MEETUP_LUMA_MAP_JSON`), since we cannot fetch that information ourselves. It is in the form of a JSON object, keyed by Meetup event ID, with a value of the Luma URL string to use. It has to be edited manually in [Cloudflare's admin configuration page](https://dash.cloudflare.com/8299d84bde3077353c5d4c71e98131f5/pages/view/website/settings/production#variables) as events are created.

Example value:

```json
{
  "312975891": "https://luma.com/9f10qhq7"
}
```

## Authoring Rules

### 1) Include a per-page metadata block

Place a `meta` comment before `<!DOCTYPE html>`:

```html
<!-- meta
title: Page title
description: Page description
og_image: /images/events/conference/2025/group_photo.jpg
-->
<!DOCTYPE html>
```

Defaults come from `site.config.json`.
The `meta` comment is source-only and is stripped from the generated files in `dist/`.

Optional per-page fields:

```html
robots: noindex,follow
og_image_alt: Describe the social preview image for screen readers and rich cards
canonical: false
social: false
```

### 2) Keep partial placeholders empty

In files under `src/`, use the header/footer markers with empty tags:

```html
<!-- ============================================================
     HEADER (from src/_partials/header.html)
     ============================================================ -->
<header></header>

<!-- ============================================================
     FOOTER (from src/_partials/footer.html)
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
  "defaultOgImage": "/images/events/conference/2025/group_photo.jpg",
  "defaultOgImageAlt": "...",
  "locale": "en_US",
  "defaultRobots": "index,follow,max-image-preview:large",
  "themeColor": "#1c1814",
  "twitterSite": "@PNSQC"
}
```

Important: update `baseUrl` to the production domain before release so canonical, Open Graph, X/Twitter tags, and sitemap URLs are correct.

## Directory Layout

```text
website/
├── build.mjs
├── package.json
├── site.config.json
├── .agents/                  # local agent skills + scripts
├── content/                  # markdown source material
├── src/                      # editable site source
│   ├── _partials/            # shared header/footer snippets
│   └── ...
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

## Accessibility Audit

Run the axe audit with:

```bash
npm run audit:a11y
```

What this does:

- Builds the site into `dist/`
- Ensures a Playwright-managed Chromium browser is installed inside this repo at `.playwright-browsers/`
- Audits each built HTML route in light and dark mode
- Writes results to `reports/axe-report.json`

You do not need Chrome, Edge, or any other browser installed globally for the audit to run.

Useful options:

```bash
# Audit only one route and one theme
npm run audit:a11y -- --route /about/contact/ --theme light

# Skip the build step if dist/ is already up to date
npm run audit:a11y -- --skip-build

# Write the report to a different path
npm run audit:a11y -- --report reports/axe-contact.json
```
