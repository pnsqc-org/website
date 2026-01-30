#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync, readdirSync, cpSync, rmSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('.', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// ── Config ──────────────────────────────────────────────────────────

function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
}

// ── Find HTML files (recursive) ─────────────────────────────────────

function findHtmlFiles(dir = SRC) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

// ── Parse <!-- meta ... --> block ───────────────────────────────────

function parseMeta(html) {
  const match = html.match(/<!--\s*meta\b([\s\S]*?)-->/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^\s*(\w[\w_]*)\s*:\s*(.+?)\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

// ── Inject <head> meta tags ─────────────────────────────────────────

function injectHead(html, meta, config, filePath) {
  const title = meta.title || config.siteName;
  const description = meta.description || config.defaultDescription;
  const ogImage = meta.og_image || config.defaultOgImage;
  const relPath = relative(SRC, filePath);
  const urlPath = '/' + relPath.replace(/index\.html$/, '').replace(/\.html$/, '');
  const canonical = config.baseUrl + urlPath;

  // Replace <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

  // Replace or insert <meta name="description">
  if (html.includes('<meta name="description"')) {
    html = html.replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${escAttr(description)}">`
    );
  } else {
    html = html.replace('</title>', `</title>\n  <meta name="description" content="${escAttr(description)}">`);
  }

  // Build OG / canonical block
  const ogBlock = [
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:image" content="${config.baseUrl}${ogImage}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${config.locale}">`,
    `<meta property="og:site_name" content="${escAttr(config.siteName)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(title)}">`,
    `<meta name="twitter:description" content="${escAttr(description)}">`,
    `<meta name="twitter:image" content="${config.baseUrl}${ogImage}">`,
  ].map(l => '  ' + l).join('\n');

  // Remove existing OG / canonical / twitter tags
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
  html = html.replace(/\s*<meta property="og:[^>]*>/g, '');
  html = html.replace(/\s*<meta name="twitter:[^>]*>/g, '');

  // Insert before </head>
  html = html.replace('</head>', ogBlock + '\n</head>');

  return html;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Inject partials ─────────────────────────────────────────────────

function injectPartials(html) {
  const partials = [
    { tag: 'header', label: 'HEADER', file: '_partials/header.html' },
    { tag: 'footer', label: 'FOOTER', file: '_partials/footer.html' },
  ];

  for (const { tag, label, file } of partials) {
    const partialPath = join(ROOT, file);
    let partialContent;
    try {
      partialContent = readFileSync(partialPath, 'utf8').trimEnd();
    } catch {
      continue; // partial file missing, skip
    }

    // Match from the marker comment through the closing tag
    const markerRe = new RegExp(
      `([ \\t]*)<!-- =+\\s*${label} \\(from ${file.replace('/', '\\/')}\\)[\\s\\S]*?=+ -->` +
      `[\\s\\S]*?</${tag}>`,
    );

    const marker = (indent) =>
      `${indent}<!-- ============================================================\n` +
      `${indent}     ${label} (from ${file})\n` +
      `${indent}     ============================================================ -->\n` +
      partialContent.split('\n').map(l => indent + l).join('\n');

    html = html.replace(markerRe, (_, indent) => marker(indent));
  }

  return html;
}

// ── Generate sitemap.xml ────────────────────────────────────────────

function generateSitemap(files, config) {
  const urls = files.map(f => {
    const rel = relative(SRC, f);
    const urlPath = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    const lastmod = statSync(f).mtime.toISOString().split('T')[0];
    return `  <url>\n    <loc>${config.baseUrl}${urlPath}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + '\n' +
    `</urlset>\n`;

  writeFileSync(join(SRC, 'sitemap.xml'), xml);
  console.log(`  src/sitemap.xml  (${files.length} URLs)`);
}

// ── Generate robots.txt ─────────────────────────────────────────────

function generateRobotsTxt(config) {
  const content =
    `User-agent: *\n` +
    `Allow: /\n\n` +
    `Sitemap: ${config.baseUrl}/sitemap.xml\n`;
  writeFileSync(join(SRC, 'robots.txt'), content);
  console.log('  src/robots.txt');
}

// ── Assemble dist/ ──────────────────────────────────────────────────

function assembleDist() {
  // Start fresh
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });

  // Copy src/ to dist/
  cpSync(SRC, DIST, { recursive: true });

  // Remove Tailwind source file (keep only compiled output)
  const inputCss = join(DIST, 'css', 'input.css');
  if (existsSync(inputCss)) rmSync(inputCss);

  const count = readdirSync(DIST, { recursive: true }).length;
  console.log(`  dist/  (${count} files copied from src/)`);
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const command = process.argv[2];

  // `node build.mjs dist` — only assemble the dist/ folder
  if (command === 'dist') {
    console.log('\nbuild.mjs — assembling dist/\n');
    assembleDist();
    console.log('\ndone.\n');
    return;
  }

  // Default: process HTML, generate sitemap/robots
  const config = loadConfig();
  const files = findHtmlFiles();

  console.log(`\nbuild.mjs — processing ${files.length} HTML file(s)\n`);

  for (const file of files) {
    let html = readFileSync(file, 'utf8');
    const meta = parseMeta(html);

    html = injectPartials(html);
    html = injectHead(html, meta, config, file);

    writeFileSync(file, html);
    console.log(`  ✓ src/${relative(SRC, file)}`);
  }

  console.log('');
  generateSitemap(files, config);
  generateRobotsTxt(config);
  console.log('\ndone.\n');
}

main();
