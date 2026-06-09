# AGENTS.md

AI coding agent instructions for the PNSQC website project.

See [README.md](README.md) for full documentation.

## Project overview

Official website for the Pacific Northwest Software Quality Conference (PNSQC).

This repository is a static site built from plain HTML, Tailwind CSS v4, and a small
Node build step that prepares deployable output. There are also JavaScript modules
for interactive site behavior and integrations with third-party services.

Primary stack:

- Language: HTML, CSS, JavaScript
- Framework: Tailwind CSS v4 via `@tailwindcss/cli`
- Package manager: npm
- Runtime/build tooling: Node.js, `build.mjs`, Wrangler for local Cloudflare Pages dev
- Hosting: Cloudflare Pages, with Pages Functions in `functions/`
- Database: none
- Test framework: Node.js built-in test runner (`node --test`)

## How to get started

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run start:local
```

For a fresh local setup, follow the README quick start for `wrangler.jsonc` before
starting Wrangler.

Run tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Run formatting check:

```bash
npm run format
```

Run the production build:

```bash
npm run build
```

Run the accessibility audit:

```bash
npm run audit:a11y
```

There is no type-check command configured. There is no single "run everything"
script; run the relevant checks individually.

## Agent command notes

This repo is commonly used from Windows PowerShell under a managed sandbox. The
sandbox sometimes fails before a command starts with:

```text
windows sandbox: spawn setup refresh
```

Treat that as a sandbox/process-launch failure, not as a project or command
failure. Do not waste time retrying many small syntax variations of the same
command. If a command is important and this sandbox error repeats once, rerun the
same command with `sandbox_permissions: "require_escalated"` and a concise
justification.

Prefer simple commands that match approved prefixes:

- `rg ...`
- `Get-Content -Path ...`
- `Get-ChildItem ...`
- `git status --short`
- `npm run lint`
- `npm run format`
- `npm run format:write`
- `npm run build`
- `npm run audit:a11y`

For source inspection, prefer `rg -n -C ...` or simple `Get-Content -Path ...`
reads. PowerShell pipelines, inline variable assignments, range slicing, and
JSON shaping around API responses can be flaky under the sandbox; if one of those
commands hits the spawn setup error and the data is needed, escalate the same
command instead of repeatedly rewriting it.

For live MeetingHand data checks, a plain endpoint read with
`Invoke-RestMethod -Uri https://api.meetinghand.com/api/events/pnsqc-2026` is an
approved pattern. If filtered PowerShell expressions, `ConvertTo-Json`, `node -e`,
or `npm test` are needed and the sandbox blocks them before process start, rerun
once with escalation rather than cycling through alternate shells.

## Before completing any task

Before considering a task complete, run the relevant checks when possible:

```bash
npm run lint
npm run format
npm test
npm run build
npm run audit:a11y
```

Use judgment based on the change. For HTML, CSS, JS, layout, navigation, or
accessibility-sensitive changes, run `npm run build` and at least a targeted axe
audit when possible:

```bash
npm run audit:a11y -- --route /about/contact/ --theme light
npm run audit:a11y -- --skip-build
```

The pre-commit hook runs lint/format, build, and a staged-route accessibility
audit. If a check cannot be run, explain why in the final response.

## Code style

- Follow existing patterns in nearby files.
- Prefer small, focused changes.
- Do not introduce new dependencies unless necessary.
- Do not reformat unrelated files.
- Keep public URLs and existing behavior backward compatible unless the task
  explicitly asks otherwise.
- Add or update tests when behavior changes.
- Prefer clean site URLs such as `/conference/2026/venue/` instead of `.html`
  file paths.

## Architecture notes

- Main editable site source lives in `src/`.
- Shared page partials live in `src/_partials/`.
- JavaScript modules live in `src/js/`.
- The Tailwind CSS source is `src/css/input.css`.
- Archive source data lives in `content/`.
- Cloudflare Pages Functions live in `functions/`.
- Tests live in `tests/`.
- Accessibility tooling lives in `axe/` and writes reports under `reports/`.
- Site-wide SEO and social defaults live in `site.config.json`.
- The generated deploy output lives in `dist/` and should not be edited manually.
- `src/404.html` is copied to `dist/404.html` for not-found responses.

`npm run build` runs `npm run build:dist` and `npm run build:css`.
`build.mjs` recreates `dist/` from `src/`, generates archive program data from
`content/`, injects shared header/footer partials, injects SEO/social tags from
each page's source `<!-- meta ... -->` block, and generates `sitemap.xml` and
`robots.txt`. The Tailwind step compiles `src/css/input.css` to
`dist/css/site.css`.

Source files in `src/` are not modified by the build.

Edit `site.config.json` for site-wide defaults. Keep `baseUrl` pointed at the
intended production domain unless a task explicitly changes the release target;
it drives canonical URLs, social tags, `sitemap.xml`, and `robots.txt`.

## Authoring HTML pages

Every HTML page under `src/` needs a source-only metadata block before
`<!doctype html>`:

```html
<!-- meta
title: Page title
description: Page description
og_image: /images/events/conference/2025/group_photo.jpg
og_image_alt: Describe the social preview image.
-->
<!doctype html>
```

Defaults come from `site.config.json`. Supported per-page fields include
`title`, `description`, `og_image`, `og_image_alt`, `og_type`, `robots`,
`canonical: false`, and `social: false`.

Do not manually add `<title>`, description, robots, canonical, Open Graph, or
X/Twitter card tags to source pages. The build script injects those into `dist/`.
Normal document tags such as charset, viewport, stylesheet, and favicon belong in
source pages. Use `/css/site.css` for the stylesheet path.

Top-level partial placeholders in source pages must stay empty:

```html
<!-- ============================================================
     HEADER (from src/_partials/header.html)
     ============================================================ -->
<header></header>

<!-- page content -->

<!-- ============================================================
     FOOTER (from src/_partials/footer.html)
     ============================================================ -->
<footer></footer>
```

Never put shared header/footer content inside those placeholder tags in `src/`.
Edit site-wide header or footer markup in `src/_partials/`. Semantic
content-level `<footer>` elements are allowed when they are part of page content,
not the shared page footer placeholder.

## Tailwind brand colors

Brand color utilities are defined in `src/css/input.css` with Tailwind v4
`@theme` variables. The base tokens currently are:

- `pnsqc-gold`: `#e5a850`
- `pnsqc-gold-light`: `#f5c17f`
- `pnsqc-gold-dark`: `#c88b3a`
- `pnsqc-blue`: `#3b6b74`
- `pnsqc-blue-light`: `#4f899b`
- `pnsqc-blue-dark`: `#2b5359`
- `pnsqc-navy`: `#1c1814`
- `pnsqc-cyan`: `#5dbaa8`
- `pnsqc-slate`: `#b5a799`

Only `pnsqc-gold` and `pnsqc-blue` have `-light` and `-dark` variants in the base
theme. Do not invent classes such as `pnsqc-navy-light`, `pnsqc-cyan-dark`, or
`pnsqc-slate-light` unless you also add real tokens to `@theme`.

The light theme is implemented by overriding CSS variables under
`[data-theme='light']`; it does not create separate Tailwind utility names.
Current light-theme overrides include `pnsqc-navy`, `pnsqc-blue`,
`pnsqc-blue-dark`, `pnsqc-slate`, `pnsqc-gold`, `pnsqc-gold-light`,
`pnsqc-gold-dark`, and `pnsqc-cyan`. `pnsqc-blue-light` is not currently
overridden in the light theme.

Prefer existing readability helpers where appropriate, including
`gold-readable`, `gold-readable--tinted`, `button-gold`, `button-gold-ghost`,
`inline-text-link`, `page-content`, `content-panel`, and the shared `modal-*`
classes.

## Archive content

Archived conference source data lives under `content/`. Author biographies use
`content/bios/<author-slug>/about.json`; presentation data uses
`content/<year>/<presentation-slug>/about.json`.

During `npm run build`, `content/` remains the source of truth and the browser
payload is generated at `dist/data/archive/<year>/program.json`.

Archive content can be regenerated from a proceedings PDF:

```bash
python scripts/extract-proceedings.py --year 2025 --write
```

The extractor writes a temporary review report to
`pdf-report/<year>-extraction.json`.

## Cloudflare and external data

The production site deploys from `dist/` to Cloudflare Pages through the GitHub
integration. Every pushed commit can receive a Cloudflare preview URL.

Cloudflare environment variables are used for Meetup API access. Luma event URL
overrides are maintained in Cloudflare as `MEETUP_LUMA_MAP_JSON`, a JSON object
keyed by Meetup event ID.

Do not change Cloudflare production settings, DNS, deployment configuration, or
production environment variables without explicit approval.

## Agent skills

This repo includes local automation skills under `.agents/skills`. Use them when
the task matches the workflow:

- `cloudflare`: Cloudflare platform, Pages, Workers, storage, networking,
  security, and infrastructure tasks.
- `github-issues`: read, comment on, and close GitHub issues. Requires `.env`
  values `GITHUB_API_KEY` and `GITHUB_REPOSITORY`.
- `use-gmail`: read/search Gmail, draft/send email, and look up Google contacts.
  Requires `.env` values `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.
- `image-gen`: generate image assets from prompts. Requires `.env` value
  `GEMINI_API_KEY`.

Install or update the skills bundle with:

```bash
npx skills add https://github.com/helincao/skilled/
```

## Safety and secrets

- Never commit secrets, API keys, tokens, `.env` files, or credentials.
- Use `.env-example` when documenting required environment variables.
- Be careful with Cloudflare, GitHub, Gmail, Gemini, Meetup, Wrangler, and
  Playwright credentials or tokens.
- Do not delete large sections of code unless the task explicitly requires it.
- Do not make destructive infrastructure or deployment changes without explicit
  approval.

## Do not edit manually

- `dist/`
- `dist/data/archive/<year>/program.json`
- `node_modules/`
- `.playwright-browsers/`
- `.wrangler/`
- generated audit reports in `reports/`, unless the task is specifically about
  reports
- generated extractor reports in `pdf-report/`

## Pull request expectations

When summarizing changes, include:

1. What changed.
2. What tests or checks were run.
3. Any risks, assumptions, or follow-up work.

For user-facing site changes, mention the route(s) that should be checked in the
Cloudflare preview.
