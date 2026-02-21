#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync, readdirSync, cpSync, rmSync, existsSync } from "fs";
import { join, relative, resolve } from "path";

function parseArgs(argv) {
  const args = { projectRoot: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--project-root") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) {
        console.error("Error: --project-root requires a path");
        printUsage();
        process.exit(1);
      }
      args.projectRoot = value;
      continue;
    }
    console.error(`Error: Unknown option "${token}"`);
    printUsage();
    process.exit(1);
  }
  return args;
}

function printUsage() {
  console.log(`
skilled-build

Usage:
  skilled-build [--project-root <path>]

Options:
  --project-root <path>    Project root containing src/, dist/, _partials/, site.config.json
  -h, --help               Show this help
`);
}

const { projectRoot, help } = parseArgs(process.argv.slice(2));
if (help) {
  printUsage();
  process.exit(0);
}

const ROOT = resolve(projectRoot);
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const PARTIALS_DIR = join(ROOT, "_partials");
const SITE_CONFIG = join(ROOT, "site.config.json");

function ensureRequiredPaths() {
  if (!existsSync(SRC)) {
    console.error(`Error: src directory not found: ${SRC}`);
    process.exit(1);
  }
  if (!existsSync(SITE_CONFIG)) {
    console.error(`Error: site config not found: ${SITE_CONFIG}`);
    process.exit(1);
  }
}

// ── Config ──────────────────────────────────────────────────────────

function loadConfig() {
  return JSON.parse(readFileSync(SITE_CONFIG, "utf8"));
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
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*(\w[\w_]*)\s*:\s*(.+?)\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

// ── Inject <head> meta tags ─────────────────────────────────────────

function injectHead(html, meta, config, filePath, baseDir) {
  const title = meta.title || config.siteName || "";
  const description = meta.description || config.defaultDescription || "";
  const ogImage = meta.og_image || config.defaultOgImage || "";
  const relPath = relative(baseDir, filePath).replace(/\\/g, "/");
  const urlPath = "/" + relPath.replace(/index\.html$/, "").replace(/\.html$/, "");
  const canonical = `${config.baseUrl || ""}${urlPath}`;
  const ogImageUrl = /^https?:\/\//.test(ogImage) ? ogImage : `${config.baseUrl || ""}${ogImage}`;

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
    `<meta property="og:image" content="${ogImageUrl}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${config.locale || "en_US"}">`,
    `<meta property="og:site_name" content="${escAttr(config.siteName || "")}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(title)}">`,
    `<meta name="twitter:description" content="${escAttr(description)}">`,
    `<meta name="twitter:image" content="${ogImageUrl}">`,
  ].map((l) => `  ${l}`).join("\n");

  // Remove existing OG / canonical / twitter tags
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
  html = html.replace(/\s*<meta property="og:[^>]*>/g, '');
  html = html.replace(/\s*<meta name="twitter:[^>]*>/g, '');

  // Insert before </head>
  html = html.replace('</head>', ogBlock + '\n</head>');

  return html;
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Convert absolute paths to relative paths ─────────────────────────

function makePathsRelative(html, filePath, baseDir) {
  const relPath = relative(baseDir, filePath).replace(/\\/g, "/");
  const depth = relPath.split('/').length - 1; // -1 because the file itself doesn't count
  const prefix = depth > 0 ? '../'.repeat(depth) : './';

  // Convert absolute paths starting with / to relative paths
  // Matches href="/...", src="/...", content="/..." (for og:image etc that use relative paths)
  html = html.replace(/((?:href|src)=["'])\/(?!\/)/g, `$1${prefix}`);

  return html;
}

// ── Inject partials ─────────────────────────────────────────────────

function injectPartials(html) {
  const partials = [
    { tag: "header", label: "HEADER", file: "header.html" },
    { tag: "footer", label: "FOOTER", file: "footer.html" },
  ];

  for (const { tag, label, file } of partials) {
    const partialPath = join(PARTIALS_DIR, file);
    let partialContent;
    try {
      partialContent = readFileSync(partialPath, "utf8").trimEnd();
    } catch {
      continue; // partial file missing, skip
    }

    const markerPath = `_partials/${file}`;

    // Match from the marker comment through the closing tag
    const markerRe = new RegExp(
      `([ \\t]*)<!-- =+\\s*${label} \\(from ${markerPath.replace("/", "\\/")}\\)[\\s\\S]*?=+ -->` +
      `[\\s\\S]*?</${tag}>`,
    );

    const marker = (indent) =>
      `${indent}<!-- ============================================================\n` +
      `${indent}     ${label} (from ${markerPath})\n` +
      `${indent}     ============================================================ -->\n` +
      partialContent.split("\n").map((l) => indent + l).join("\n");

    html = html.replace(markerRe, (_, indent) => marker(indent));
  }

  return html;
}

// ── Generate sitemap.xml ────────────────────────────────────────────

function generateSitemap(files, config, targetDir) {
  const urls = files.map(f => {
    const rel = relative(targetDir, f).replace(/\\/g, "/");
    const urlPath = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    const lastmod = statSync(f).mtime.toISOString().split("T")[0];
    return `  <url>\n    <loc>${config.baseUrl || ""}${urlPath}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + '\n' +
    `</urlset>\n`;

  writeFileSync(join(targetDir, "sitemap.xml"), xml);
  console.log(`  sitemap.xml  (${files.length} URLs)`);
}

// ── Generate robots.txt ─────────────────────────────────────────────

function generateRobotsTxt(config, targetDir) {
  const content =
    `User-agent: *\n` +
    `Allow: /\n\n` +
    `Sitemap: ${config.baseUrl || ""}/sitemap.xml\n`;
  writeFileSync(join(targetDir, "robots.txt"), content);
  console.log("  robots.txt");
}

// ── Assemble dist/ ──────────────────────────────────────────────────

function assembleDist() {
  // Start fresh
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });

  // Copy src/ to dist/
  cpSync(SRC, DIST, { recursive: true });

  // Remove Tailwind source file (keep only compiled output)
  const inputCss = join(DIST, "css", "input.css");
  if (existsSync(inputCss)) rmSync(inputCss);

  const count = readdirSync(DIST, { recursive: true }).length;
  console.log(`  dist/  (${count} files copied from src/)`);
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  ensureRequiredPaths();

  // Step 1: Copy src/ to dist/
  console.log(`\nskilled-build — assembling dist/ from ${ROOT}\n`);
  assembleDist();

  // Step 2: Process HTML files in dist/ (NOT src/)
  const config = loadConfig();
  const files = findHtmlFiles(DIST); // Find HTML in dist/, not src/

  console.log(`\nskilled-build — processing ${files.length} HTML file(s) in dist/\n`);

  for (const file of files) {
    let html = readFileSync(file, 'utf8');
    const meta = parseMeta(html);

    html = injectPartials(html);
    html = injectHead(html, meta, config, file, DIST);  // Pass DIST as baseDir
    html = makePathsRelative(html, file, DIST);  // Convert absolute paths to relative

    writeFileSync(file, html);
    console.log(`  ✓ dist/${relative(DIST, file).replace(/\\/g, "/")}`);
  }

  // Step 3: Generate sitemap/robots in dist/
  console.log('');
  generateSitemap(files, config, DIST);
  generateRobotsTxt(config, DIST);
  console.log("\ndone.\n");
}

main();
