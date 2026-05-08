#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync, readdirSync, cpSync, rmSync, existsSync } from 'fs';
import path, { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
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
      if (entry.name === '_partials') continue;
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

function stripMetaBlock(html) {
  return html.replace(/^\uFEFF?\s*<!--\s*meta\b[\s\S]*?-->\s*/i, '');
}

function parseMetaBoolean(value, defaultValue = true) {
  if (value == null) return defaultValue;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function insertBeforeHeadClose(html, lines) {
  return html.replace(/^([ \t]*)<\/head>/m, (_, indent) => {
    const childIndent = `${indent}  `;
    const normalizedLines = Array.isArray(lines) ? lines : lines.split('\n');
    const block = normalizedLines.map((line) => `${childIndent}${line}`).join('\n');
    return `${block}\n${indent}</head>`;
  });
}

// ── Inject <head> meta tags ─────────────────────────────────────────

function injectHead(html, meta, config, filePath, baseDir) {
  const title = meta.title || config.siteName;
  const description = meta.description || config.defaultDescription;
  const ogImage = meta.og_image || config.defaultOgImage;
  const ogImageAlt =
    meta.og_image_alt || (ogImage === config.defaultOgImage ? config.defaultOgImageAlt : '');
  const robots = meta.robots || config.defaultRobots;
  const themeColor = config.themeColor?.trim();
  const twitterSite = config.twitterSite?.trim();
  const includeCanonical = parseMetaBoolean(meta.canonical, true);
  const includeSocial = parseMetaBoolean(meta.social, true);
  const siteOrigin = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
  const relPath = relative(baseDir, filePath).split(path.sep).join('/');
  const urlPath = '/' + relPath.replace(/index\.html$/, '').replace(/\.html$/, '');
  const canonical = new URL(urlPath, siteOrigin).toString();
  const ogImageUrl = new URL(ogImage, siteOrigin).toString();

  const managedHeadTagPatterns = [
    /[ \t]*<title\b[^>]*>[\s\S]*?<\/title>\s*/gi,
    /[ \t]*<meta\b[^>]*name=["']description["'][^>]*>\s*/gi,
    /[ \t]*<meta\b[^>]*name=["']robots["'][^>]*>\s*/gi,
    /[ \t]*<meta\b[^>]*name=["']theme-color["'][^>]*>\s*/gi,
    /[ \t]*<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi,
    /[ \t]*<meta\b[^>]*property=["']og:[^"']+["'][^>]*>\s*/gi,
    /[ \t]*<meta\b[^>]*(?:name|property)=["']twitter:[^"']+["'][^>]*>\s*/gi,
  ];

  for (const pattern of managedHeadTagPatterns) {
    html = html.replace(pattern, '');
  }

  const headTags = [
    `<title>${escAttr(title)}</title>`,
    `<meta name="description" content="${escAttr(description)}">`,
    robots ? `<meta name="robots" content="${escAttr(robots)}">` : '',
    themeColor ? `<meta name="theme-color" content="${escAttr(themeColor)}">` : '',
    includeCanonical ? `<link rel="canonical" href="${canonical}">` : '',
    includeSocial ? `<meta property="og:title" content="${escAttr(title)}">` : '',
    includeSocial ? `<meta property="og:description" content="${escAttr(description)}">` : '',
    includeSocial ? `<meta property="og:image" content="${ogImageUrl}">` : '',
    includeSocial && ogImageAlt
      ? `<meta property="og:image:alt" content="${escAttr(ogImageAlt)}">`
      : '',
    includeSocial ? `<meta property="og:url" content="${canonical}">` : '',
    includeSocial
      ? `<meta property="og:type" content="${escAttr(meta.og_type || 'website')}">`
      : '',
    includeSocial ? `<meta property="og:locale" content="${escAttr(config.locale)}">` : '',
    includeSocial ? `<meta property="og:site_name" content="${escAttr(config.siteName)}">` : '',
    includeSocial ? `<meta name="twitter:card" content="summary_large_image">` : '',
    includeSocial && twitterSite
      ? `<meta name="twitter:site" content="${escAttr(twitterSite)}">`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  html = insertBeforeHeadClose(html, headTags);

  return html;
}

function injectGoogleTag(html, config) {
  const googleTagId = config.googleTagId?.trim();
  if (!googleTagId) return html;

  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`;
  if (html.includes(scriptSrc) || html.includes(`gtag('config', '${googleTagId}')`)) {
    return html;
  }

  return insertBeforeHeadClose(html, [
    '<!-- Google tag (gtag.js) -->',
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  gtag('consent', 'default', {",
    "    'ad_storage': 'denied',",
    "    'ad_user_data': 'denied',",
    "    'ad_personalization': 'denied',",
    "    'analytics_storage': 'granted'",
    '  });',
    "  gtag('set', 'ads_data_redaction', true);",
    "  gtag('js', new Date());",
    '',
    `  gtag('config', '${googleTagId}', {`,
    "    'allow_google_signals': false,",
    "    'allow_ad_personalization_signals': false",
    '  });',
    '</script>',
    `<script async src="${scriptSrc}"></script>`,
  ]);
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Inject partials ─────────────────────────────────────────────────

function injectPartials(html) {
  const partials = [
    { tag: 'header', label: 'HEADER', file: 'src/_partials/header.html' },
    { tag: 'footer', label: 'FOOTER', file: 'src/_partials/footer.html' },
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
      `([ \\t]*)<!-- =+\\s*${label} \\(from ${file.replace(/\//g, '\\/')}\\)[\\s\\S]*?=+ -->` +
        `[\\s\\S]*?</${tag}>`,
    );

    const marker = (indent) =>
      `${indent}<!-- ============================================================\n` +
      `${indent}     ${label} (from ${file})\n` +
      `${indent}     ============================================================ -->\n` +
      partialContent
        .split('\n')
        .map((l) => indent + l)
        .join('\n');

    html = html.replace(markerRe, (_, indent) => marker(indent));
  }

  return html;
}

function wrapPrimaryContentInMain(html) {
  if (/<main\b/i.test(html)) return html;

  const headerEnd = html.indexOf('</header>');
  if (headerEnd === -1) return html;

  const footerLabelIndex = html.indexOf('FOOTER (from src/_partials/footer.html)');
  const footerStart =
    footerLabelIndex === -1
      ? html.lastIndexOf('<footer')
      : html.lastIndexOf('<!--', footerLabelIndex);
  if (footerStart === -1 || footerStart <= headerEnd) return html;

  const modalMatch = html.match(/\n[ \t]*<div[^>]*\sdata-details-modal(?:\s|>)/);
  const contentEnd =
    modalMatch && modalMatch.index > headerEnd && modalMatch.index < footerStart
      ? modalMatch.index
      : footerStart;
  const contentStart = headerEnd + '</header>'.length;

  return (
    html.slice(0, contentStart) +
    '\n\n    <main id="main-content">' +
    html.slice(contentStart, contentEnd) +
    '\n    </main>' +
    html.slice(contentEnd)
  );
}

// ── Generate sitemap.xml ────────────────────────────────────────────

function generateSitemap(files, config, targetDir) {
  const sitemapFiles = files.filter((f) => relative(targetDir, f) !== '404.html');
  const urls = sitemapFiles.map((f) => {
    const rel = relative(targetDir, f).split(path.sep).join('/');
    const urlPath = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    const lastmod = statSync(f).mtime.toISOString().split('T')[0];
    return `  <url>\n    <loc>${config.baseUrl}${urlPath}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    '\n' +
    `</urlset>\n`;

  writeFileSync(join(targetDir, 'sitemap.xml'), xml);
  console.log(`  sitemap.xml  (${sitemapFiles.length} URLs)`);
}

// ── Generate robots.txt ─────────────────────────────────────────────

function generateRobotsTxt(config, targetDir) {
  const content = `User-agent: *\n` + `Allow: /\n\n` + `Sitemap: ${config.baseUrl}/sitemap.xml\n`;
  writeFileSync(join(targetDir, 'robots.txt'), content);
  console.log('  robots.txt');
}

// ── Assemble dist/ ──────────────────────────────────────────────────

function assembleDist() {
  // Start fresh
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });

  // Copy src/ to dist/
  cpSync(SRC, DIST, { recursive: true });

  // Shared partials are source-only and should not be published in dist/.
  const distPartials = join(DIST, '_partials');
  if (existsSync(distPartials)) rmSync(distPartials, { recursive: true });

  // Remove Tailwind source file from publish output
  const inputCss = join(DIST, 'css', 'input.css');
  if (existsSync(inputCss)) rmSync(inputCss);

  const count = readdirSync(DIST, { recursive: true }).length;
  console.log(`  dist/  (${count} files copied from src/)`);
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  // Step 1: Copy src/ to dist/
  console.log('\nbuild.mjs — assembling dist/\n');
  assembleDist();

  // Step 2: Process HTML files in dist/ (NOT src/)
  const config = loadConfig();
  const files = findHtmlFiles(DIST); // Find HTML in dist/, not src/

  console.log(`\nbuild.mjs — processing ${files.length} HTML file(s) in dist/\n`);

  for (const file of files) {
    let html = readFileSync(file, 'utf8');
    const meta = parseMeta(html);
    const relFile = relative(DIST, file);

    html = injectPartials(html);
    html = wrapPrimaryContentInMain(html);
    html = injectHead(html, meta, config, file, DIST); // Pass DIST as baseDir
    html = injectGoogleTag(html, config);
    html = stripMetaBlock(html);

    writeFileSync(file, html);
    console.log(`  ✓ dist/${relFile}`);
  }

  // Step 3: Generate sitemap/robots in dist/
  console.log('');
  generateSitemap(files, config, DIST);
  generateRobotsTxt(config, DIST);
  console.log('\ndone.\n');
}

main();
