---
name: image-gen
description: Generate images using this repo’s image generation CLI (located under `skills/public/image-gen/scripts/image-gen/generate.mjs`). Use when asked to create/iterate on images (PNG/JPG/WEBP/GIF), choose aspect ratios, and troubleshoot `.env` / `GEMINI_API_KEY` / CLI usage.
---

# Image Generator CLI

## Overview

Generate and iterate on images using the repo’s Gemini image generator CLI. Use it to turn a written prompt into an image file on disk, selecting aspect ratio and output filename.

## Quick Start

1. Ensure you have a `.env` with `GEMINI_API_KEY=...` (the CLI searches upward from your working directory, then from the script directory).
2. Pick a prompt and (optionally) an aspect ratio + output path.
3. Run from the repo root:

```bash
node skills/public/image-gen/scripts/image-gen/generate.mjs "a serene mountain landscape at sunset"
node skills/public/image-gen/scripts/image-gen/generate.mjs "wide cinematic landscape, golden hour, no text" -a 16:9 -o design/hero.png
```

Or run from inside the skill folder:

```bash
cd skills/public/image-gen
node scripts/image-gen/generate.mjs "wide cinematic landscape, golden hour, no text" -a 16:9 -o ../../../design/hero.png
```

## What To Ask For Before Generating

- **Usage**: website hero background, poster, sticker, icon, product mockup, etc.
- **Aspect ratio**: pick from the supported list (see `skills/public/image-gen/references/cli.md`).
- **Constraints**: “no text”, “no watermark”, “no logo”, background-only, negative space for copy.
- **Style**: photo vs illustration, lighting, camera angle/lens, mood, color palette.

## Troubleshooting

- **`.env` not found**: put `.env` in your current directory or any parent directory (repo root is fine).
- **`GEMINI_API_KEY` missing**: set `GEMINI_API_KEY=...` in `.env` (never paste secrets into issues, logs, or docs).
- **`fetch` is not defined**: run with Node.js 18+ (the CLI relies on built-in `fetch`).
- **API request failed**: include the HTTP status + error body in the report; likely an invalid key, quota/rate limit, or model/API change.
- **Output path errors**: ensure the destination directory exists (the CLI doesn’t create directories).

## Where To Look In This Repo

- CLI options and aspect ratios: `skills/public/image-gen/references/cli.md`
- Prompting tips: `skills/public/image-gen/references/prompting.md`
- Implementation details (model, API request shape): `skills/public/image-gen/scripts/image-gen/generate.mjs`
