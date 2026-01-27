# PNSQC Website

Official website of the Pacific Northwest Software Quality Conference.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Markup | Plain HTML | AI generates pages directly from markdown; no templating language needed |
| Styling | Tailwind CSS (CDN) | Utility classes, responsive design, zero build step |
| Shared layout | `_partials/` (header/footer snippets) | Keeps nav and footer consistent across all pages |
| Hosting | GitHub Pages / Netlify / Cloudflare Pages | Free, fast CDN, deploy on `git push` |
| Content source | Markdown files in `content/` | Authors edit markdown, AI regenerates HTML |

No framework, no build pipeline, no CMS.

## Content Workflow

1. Edit or create a markdown file in `content/`
2. Use AI to generate the HTML page from the markdown + a template example
3. Place the HTML file in the correct directory
4. Commit and push — the site deploys automatically

## Project Structure

```
website/
├── index.html
├── css/
│   └── site.css                 # custom overrides (if needed)
├── images/
├── conference/
│   ├── 2025/
│   │   ├── index.html
│   │   ├── papers.html
│   │   ├── workshops.html
│   │   └── keynotes.html
│   └── 2024/
│       └── ...
├── cfp/
│   └── index.html
├── blog/
│   └── 2026-01-03-workshops.html
├── about/
│   └── index.html
├── _partials/
│   ├── header.html
│   └── footer.html
└── content/                     # markdown source files
```
