#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import path, { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'content');

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
    const metaMatch = line.match(/^\s*(\w[\w_]*)\s*:\s*(.+?)\s*$/);
    if (metaMatch) meta[metaMatch[1]] = metaMatch[2];
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

function markdownToHtml(markdown) {
  const normalized = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!normalized) return '';
  return String(marked.parse(normalized, { gfm: true, breaks: true })).trim();
}

function parseFrontMatterFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(`Missing or malformed front matter in ${relative(ROOT, filePath)}`);
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Malformed front matter in ${relative(ROOT, filePath)}: ${error.message}`, {
      cause: error,
    });
  }

  return {
    data,
    body: source.slice(match[0].length),
  };
}

function requireString(value, filePath, label, options = {}) {
  if (typeof value !== 'string') {
    throw new Error(`Expected "${label}" to be a string in ${relative(ROOT, filePath)}`);
  }

  const trimmed = value.trim();
  if (!options.allowEmpty && !trimmed) {
    throw new Error(`Expected "${label}" to be non-empty in ${relative(ROOT, filePath)}`);
  }

  return options.allowEmpty ? trimmed : trimmed;
}

function assertSourceAssetExists(assetPath, filePath, label) {
  if (!assetPath.startsWith('/')) {
    throw new Error(
      `Expected "${label}" to be an absolute site path in ${relative(ROOT, filePath)}`,
    );
  }

  const sourcePath = join(SRC, assetPath.slice(1).replace(/\//g, path.sep));
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing asset "${assetPath}" referenced in ${relative(ROOT, filePath)}`);
  }
}

function loadSharedSpeakerProfiles() {
  const profiles = new Map();
  const profilesDir = join(CONTENT, 'speakers');
  if (!existsSync(profilesDir)) return profiles;

  const speakerDirs = readdirSync(profilesDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const entry of speakerDirs) {
    const filePath = join(profilesDir, entry.name, 'index.md');
    if (!existsSync(filePath)) {
      throw new Error(`Missing shared speaker profile file: ${relative(ROOT, filePath)}`);
    }

    const { data, body } = parseFrontMatterFile(filePath);
    const name = requireString(data.name, filePath, 'name');
    const profession =
      data.profession === undefined
        ? ''
        : requireString(data.profession, filePath, 'profession', { allowEmpty: true });
    const avatar = requireString(data.avatar, filePath, 'avatar');
    const linkedin = typeof data.linkedin === 'string' ? data.linkedin.trim() : '';
    const homepage = typeof data.homepage === 'string' ? data.homepage.trim() : '';
    const bioMarkdown = body.trim();

    if (!bioMarkdown) {
      throw new Error(`Expected a speaker bio body in ${relative(ROOT, filePath)}`);
    }

    assertSourceAssetExists(avatar, filePath, 'avatar');

    profiles.set(entry.name, {
      id: entry.name,
      name,
      profession,
      avatar,
      linkedin,
      homepage,
      bioHtml: markdownToHtml(bioMarkdown),
    });
  }

  return profiles;
}

function loadArchiveSpeakersForYear(year, sharedProfiles) {
  const yearDir = join(CONTENT, year);
  const speakerDirs = readdirSync(yearDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const speakers = [];

  for (const entry of speakerDirs) {
    const filePath = join(yearDir, entry.name, 'index.md');
    if (!existsSync(filePath)) {
      throw new Error(`Missing year speaker file: ${relative(ROOT, filePath)}`);
    }

    const sharedProfile = sharedProfiles.get(entry.name);
    if (!sharedProfile) {
      throw new Error(
        `Missing shared speaker profile for "${entry.name}" referenced by ${relative(ROOT, filePath)}`,
      );
    }

    const { data } = parseFrontMatterFile(filePath);
    if (!Array.isArray(data.presentations) || data.presentations.length === 0) {
      throw new Error(`Expected at least one presentation in ${relative(ROOT, filePath)}`);
    }

    const presentations = data.presentations.map((presentation, index) => {
      if (!presentation || typeof presentation !== 'object') {
        throw new Error(
          `Expected presentation ${index + 1} to be an object in ${relative(ROOT, filePath)}`,
        );
      }

      const title = requireString(presentation.title, filePath, `presentations[${index}].title`);
      const description = requireString(
        presentation.description,
        filePath,
        `presentations[${index}].description`,
      );
      const date =
        presentation.date === undefined
          ? ''
          : requireString(presentation.date, filePath, `presentations[${index}].date`, {
              allowEmpty: true,
            });
      const label =
        presentation.label === undefined
          ? ''
          : requireString(presentation.label, filePath, `presentations[${index}].label`, {
              allowEmpty: true,
            });

      return {
        title,
        descriptionHtml: markdownToHtml(description),
        date,
        label,
      };
    });

    speakers.push({
      ...sharedProfile,
      presentations,
    });
  }

  return speakers.sort((left, right) => left.name.localeCompare(right.name));
}

function buildArchiveSpeakerData() {
  if (!existsSync(CONTENT)) return;

  const sharedProfiles = loadSharedSpeakerProfiles();
  if (!sharedProfiles.size) return;

  const yearDirs = readdirSync(CONTENT, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== 'speakers',
  );

  for (const entry of yearDirs) {
    const speakers = loadArchiveSpeakersForYear(entry.name, sharedProfiles);
    if (!speakers.length) continue;

    const targetDir = join(DIST, 'data', 'archive', entry.name);
    mkdirSync(targetDir, { recursive: true });

    writeFileSync(
      join(targetDir, 'speakers.json'),
      JSON.stringify(
        {
          year: entry.name,
          speakers,
        },
        null,
        2,
      ) + '\n',
    );

    console.log(`  data/archive/${entry.name}/speakers.json  (${speakers.length} speakers)`);
  }
}

// ── Generate sitemap.xml ────────────────────────────────────────────

function generateSitemap(files, config, targetDir) {
  const sitemapFiles = files.filter((file) => relative(targetDir, file) !== '404.html');
  const urls = sitemapFiles.map((file) => {
    const rel = relative(targetDir, file);
    const urlPath = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    const lastmod = statSync(file).mtime.toISOString().split('T')[0];
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
  const content = `User-agent: *\nAllow: /\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`;
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
  console.log('\nbuild.mjs -> assembling dist/\n');
  assembleDist();

  console.log('build.mjs -> generating archive speaker data\n');
  buildArchiveSpeakerData();

  // Step 2: Process HTML files in dist/ (NOT src/)
  const config = loadConfig();
  const files = findHtmlFiles(DIST); // Find HTML in dist/, not src/

  console.log(`\nbuild.mjs -> processing ${files.length} HTML file(s) in dist/\n`);

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
