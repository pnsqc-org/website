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
import { createRequire } from 'module';
import path, { join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { marked } from 'marked';

const require = createRequire(import.meta.url);
const programData = require('./src/js/program-data.js');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'content');
const PEOPLE_IMAGES_SITE_DIR = '/images/people';
const PEOPLE_IMAGES_DIR = join(SRC, 'images', 'people');
const REMOTE_AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const REMOTE_AVATAR_TIMEOUT_MS = 15_000;
const IMAGE_EXTENSIONS = ['.avif', '.gif', '.jpg', '.jpeg', '.png', '.webp'];
const IMAGE_EXTENSION_SET = new Set(IMAGE_EXTENSIONS);
const IMAGE_EXTENSION_BY_CONTENT_TYPE = new Map([
  ['image/avif', '.avif'],
  ['image/gif', '.gif'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

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

function readContentJsonFile(filePath) {
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Malformed JSON in ${relative(ROOT, filePath)}: ${error.message}`, {
      cause: error,
    });
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Expected a JSON object in ${relative(ROOT, filePath)}`);
  }

  return data;
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
      `Expected "${label}" to be an absolute site path or http(s) URL in ${relative(
        ROOT,
        filePath,
      )}`,
    );
  }

  const sourcePath = join(SRC, assetPath.slice(1).replace(/\//g, path.sep));
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing asset "${assetPath}" referenced in ${relative(ROOT, filePath)}`);
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeImageExtension(extension) {
  const normalized = String(extension || '').toLowerCase();
  if (!IMAGE_EXTENSION_SET.has(normalized)) return '';
  return normalized === '.jpeg' ? '.jpg' : normalized;
}

function imageExtensionFromUrl(value) {
  try {
    return normalizeImageExtension(path.posix.extname(new URL(value).pathname));
  } catch {
    return '';
  }
}

function imageExtensionFromContentType(value) {
  const mime = String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return IMAGE_EXTENSION_BY_CONTENT_TYPE.get(mime) || '';
}

function safeAvatarFileStem(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'avatar'
  );
}

function underscoreAvatarFileStem(value) {
  return safeAvatarFileStem(value).replace(/-/g, '_');
}

function avatarFileStemCandidates(slug, name) {
  return [
    safeAvatarFileStem(slug),
    underscoreAvatarFileStem(slug),
    safeAvatarFileStem(name),
    underscoreAvatarFileStem(name),
  ].filter((stem, index, stems) => stem && stems.indexOf(stem) === index);
}

function generatedAvatarSitePath(slug, extension = '.jpg') {
  const safeExtension = normalizeImageExtension(extension) || '.jpg';
  return `${PEOPLE_IMAGES_SITE_DIR}/${safeAvatarFileStem(slug)}${safeExtension}`;
}

function findExistingPeopleImage({ slug, name, preferredExtension }, options = {}) {
  const peopleDir = options.peopleDir || PEOPLE_IMAGES_DIR;
  const extensions = [normalizeImageExtension(preferredExtension), ...IMAGE_EXTENSIONS]
    .filter(Boolean)
    .map((extension) => (extension === '.jpeg' ? '.jpg' : extension))
    .filter((extension, index, allExtensions) => allExtensions.indexOf(extension) === index);

  for (const stem of avatarFileStemCandidates(slug, name)) {
    for (const extension of extensions) {
      const filename = `${stem}${extension}`;
      const candidate = join(peopleDir, filename);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return {
          path: candidate,
          sitePath: `${PEOPLE_IMAGES_SITE_DIR}/${filename}`,
        };
      }
    }
  }

  return null;
}

function resolveAuthorAvatar(avatar, filePath, slug, name = '', options = {}) {
  const avatarUrl = isHttpUrl(avatar) ? avatar : '';
  if (avatar && !avatarUrl) {
    assertSourceAssetExists(avatar, filePath, 'avatar');
    return { avatar, avatarSourceUrl: '' };
  }

  const existingPeopleImage = findExistingPeopleImage(
    { slug, name, preferredExtension: imageExtensionFromUrl(avatarUrl) },
    options,
  );
  if (existingPeopleImage) {
    return { avatar: existingPeopleImage.sitePath, avatarSourceUrl: '' };
  }

  if (!avatar) return { avatar: '', avatarSourceUrl: '' };

  if (avatarUrl) {
    return {
      avatar: generatedAvatarSitePath(slug, imageExtensionFromUrl(avatarUrl) || '.jpg'),
      avatarSourceUrl: avatarUrl,
    };
  }
}

function sitePathToRootedPath(sitePath, rootDir, label) {
  if (!sitePath.startsWith('/')) {
    throw new Error(`Expected generated avatar path "${sitePath}" to be an absolute site path.`);
  }

  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(join(resolvedRoot, sitePath.slice(1).replace(/\//g, path.sep)));
  if (targetPath !== resolvedRoot && !targetPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write generated avatar outside ${label}`);
  }
  return targetPath;
}

function sitePathToSourcePath(sitePath) {
  return sitePathToRootedPath(sitePath, SRC, relative(ROOT, SRC));
}

function sitePathToDistPath(sitePath, distDir = DIST) {
  return sitePathToRootedPath(sitePath, distDir, relative(ROOT, distDir));
}

async function fetchRemoteAuthorAvatar(profile, options = {}) {
  const sourceUrl = profile?.avatarSourceUrl || '';
  if (!sourceUrl) return false;

  const fetcher = options.fetchImpl || globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new Error(
      'Cannot fetch remote author avatars because no fetch implementation is available.',
    );
  }

  const timeoutMs = options.timeoutMs ?? REMOTE_AVATAR_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout =
    controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;

  try {
    response = await fetcher(sourceUrl, {
      redirect: 'follow',
      signal: controller?.signal,
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch avatar for "${profile.slug}" from ${sourceUrl}: ${error.message}`,
      { cause: error },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!response?.ok) {
    const status = response?.status ? ` ${response.status}` : '';
    const statusText = response?.statusText ? ` ${response.statusText}` : '';
    throw new Error(
      `Failed to fetch avatar for "${profile.slug}" from ${sourceUrl}:${status}${statusText}`,
    );
  }

  const contentType = response.headers?.get?.('content-type') || '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const urlExtension = imageExtensionFromUrl(sourceUrl);
  if (
    mime &&
    !mime.startsWith('image/') &&
    !(mime === 'application/octet-stream' && urlExtension)
  ) {
    throw new Error(
      `Expected image content for avatar "${sourceUrl}", but received "${contentType}".`,
    );
  }

  const extension = imageExtensionFromContentType(contentType) || urlExtension || '.jpg';
  profile.avatar = generatedAvatarSitePath(profile.slug, extension);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) {
    throw new Error(`Fetched avatar for "${profile.slug}" from ${sourceUrl}, but it was empty.`);
  }
  if (buffer.byteLength > REMOTE_AVATAR_MAX_BYTES) {
    throw new Error(
      `Fetched avatar for "${profile.slug}" from ${sourceUrl}, but it exceeded ${REMOTE_AVATAR_MAX_BYTES} bytes.`,
    );
  }

  const sourcePath = options.peopleDir
    ? join(options.peopleDir, `${safeAvatarFileStem(profile.slug)}${extension}`)
    : sitePathToSourcePath(profile.avatar);
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, buffer);

  const targetPath = sitePathToDistPath(profile.avatar, options.distDir || DIST);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
  return true;
}

async function fetchRemoteAuthorAvatars(sharedProfiles, options = {}) {
  const profiles = Array.from(sharedProfiles?.values?.() || sharedProfiles || []).filter(
    (profile) => profile?.avatarSourceUrl,
  );

  const results = await Promise.all(
    profiles.map((profile) => fetchRemoteAuthorAvatar(profile, options)),
  );
  return {
    fetched: results.filter(Boolean).length,
    total: profiles.length,
  };
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readOptionalObject(value, filePath, label) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected "${label}" to be an object in ${relative(ROOT, filePath)}`);
  }
  return value;
}

function readStringArray(value, filePath, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected at least one "${label}" entry in ${relative(ROOT, filePath)}`);
  }
  return value.map((item, index) => requireString(item, filePath, `${label}[${index}]`));
}

function readPresentationRefs(value, filePath) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Expected "presentationRefs" to be an array in ${relative(ROOT, filePath)}`);
  }
  return value.map((ref, index) => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
      throw new Error(
        `Expected "presentationRefs[${index}]" to be an object in ${relative(ROOT, filePath)}`,
      );
    }
    return {
      slug: requireString(ref.slug, filePath, `presentationRefs[${index}].slug`),
      year: requireString(String(ref.year ?? ''), filePath, `presentationRefs[${index}].year`),
    };
  });
}

function loadSharedAuthorBios() {
  const profiles = new Map();
  const profilesDir = join(CONTENT, 'bios');
  if (!existsSync(profilesDir)) return profiles;

  const speakerDirs = readdirSync(profilesDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const entry of speakerDirs) {
    const filePath = join(profilesDir, entry.name, 'about.json');
    if (!existsSync(filePath)) {
      throw new Error(`Missing shared author bio file: ${relative(ROOT, filePath)}`);
    }

    const data = readContentJsonFile(filePath);
    const slug = optionalString(data.slug) || entry.name;
    const name = requireString(data.name, filePath, 'name');
    const profession =
      data.profession === undefined
        ? ''
        : requireString(data.profession, filePath, 'profession', { allowEmpty: true });
    const avatar =
      data.avatar === undefined
        ? ''
        : requireString(data.avatar, filePath, 'avatar', { allowEmpty: true });
    const linkedin = optionalString(data.linkedin);
    const homepage = optionalString(data.homepage);
    const email = optionalString(data.email);
    const organization = optionalString(data.organization);
    const bio =
      data.bio === undefined ? '' : requireString(data.bio, filePath, 'bio', { allowEmpty: true });
    const presentationRefs = readPresentationRefs(data.presentationRefs, filePath);
    const source = readOptionalObject(data.source, filePath, 'source');
    const resolvedAvatar = resolveAuthorAvatar(avatar, filePath, slug, name);

    const profile = {
      id: slug,
      slug,
      name,
      profession,
      avatar: resolvedAvatar.avatar,
      linkedin,
      homepage,
      email,
      organization,
      source,
      bio,
      bioHtml: markdownToHtml(bio),
      presentationRefs,
    };
    if (resolvedAvatar.avatarSourceUrl) profile.avatarSourceUrl = resolvedAvatar.avatarSourceUrl;

    profiles.set(slug, profile);
  }

  return profiles;
}

function formatCategoryName(slug) {
  const known = {
    'paper-presenters': 'Paper Presenters',
  };
  if (known[slug]) return known[slug];
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function loadArchiveProgramDataForYear(year, sharedProfiles) {
  const yearDir = join(CONTENT, year);
  const presentationDirs = readdirSync(yearDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const speakerSlugsForYear = new Set();
  const presentations = [];
  const categorySlugs = new Set();

  for (const entry of presentationDirs) {
    const filePath = join(yearDir, entry.name, 'about.json');
    if (!existsSync(filePath)) {
      throw new Error(`Missing year presentation file: ${relative(ROOT, filePath)}`);
    }

    const data = readContentJsonFile(filePath);
    const slug = optionalString(data.slug) || entry.name;
    const title = requireString(data.title, filePath, 'title');
    const abstract = requireString(data.abstract, filePath, 'abstract');
    const presentationType = requireString(data.presentationType, filePath, 'presentationType');
    const categorySlug = requireString(data.categorySlug, filePath, 'categorySlug');
    const date =
      data.date === undefined
        ? ''
        : requireString(data.date, filePath, 'date', { allowEmpty: true });
    const start =
      data.start === undefined
        ? ''
        : requireString(data.start, filePath, 'start', { allowEmpty: true });
    const end =
      data.end === undefined ? '' : requireString(data.end, filePath, 'end', { allowEmpty: true });
    const location =
      data.location === undefined
        ? ''
        : requireString(data.location, filePath, 'location', { allowEmpty: true });
    const order = optionalNumber(data.order);
    const source = readOptionalObject(data.source, filePath, 'source');
    const speakerSlugs = readStringArray(data.speakerSlugs, filePath, 'speakerSlugs');

    speakerSlugs.forEach((speakerSlug) => {
      if (!sharedProfiles.has(speakerSlug)) {
        throw new Error(
          `Missing shared author bio for "${speakerSlug}" referenced by ${relative(
            ROOT,
            filePath,
          )}`,
        );
      }
      speakerSlugsForYear.add(speakerSlug);
    });
    categorySlugs.add(categorySlug);

    const presentation = {
      id: slug,
      slug,
      title,
      abstract,
      abstractHtml: markdownToHtml(abstract),
      descriptionHtml: markdownToHtml(abstract),
      presentationType,
      categorySlug,
      date,
      start,
      end,
      location,
      source,
      speakerSlugs,
    };
    if (order !== null) presentation.order = order;
    presentations.push(presentation);
  }

  const speakers = Array.from(speakerSlugsForYear)
    .sort()
    .map((speakerSlug) => {
      const sharedProfile = sharedProfiles.get(speakerSlug);
      return {
        ...sharedProfile,
        presentationRefs: sharedProfile.presentationRefs.filter(
          (ref) => String(ref.year) === String(year),
        ),
      };
    });
  const rawProgram = {
    year,
    source: 'archive',
    categories: Array.from(categorySlugs)
      .sort()
      .map((slug) => ({
        id: null,
        slug,
        name: formatCategoryName(slug),
      })),
    speakers,
    presentations,
  };

  return programData.serializeProgram(programData.normalizeArchiveProgram(rawProgram, { year }));
}

function buildConferencePaperPresenterProfiles(sharedProfiles) {
  return Array.from(sharedProfiles?.values?.() || sharedProfiles || [])
    .map((profile) => ({
      slug: optionalString(profile?.slug || profile?.id),
      name: optionalString(profile?.name),
      avatar: optionalString(profile?.avatar),
      linkedin: optionalString(profile?.linkedin),
      homepage: optionalString(profile?.homepage),
    }))
    .filter((profile) => profile.name && (profile.avatar || profile.linkedin || profile.homepage))
    .sort((left, right) => {
      const name = left.name.localeCompare(right.name);
      return name || left.slug.localeCompare(right.slug);
    });
}

function writeConferencePaperPresenterProfiles(sharedProfiles, options = {}) {
  const profiles = buildConferencePaperPresenterProfiles(sharedProfiles);
  if (!profiles.length) return profiles;

  const targetDir = join(options.distDir || DIST, 'data', 'conference', '2026');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    join(targetDir, 'paper-presenter-profiles.json'),
    JSON.stringify(profiles, null, 2) + '\n',
  );
  console.log(
    `  data/conference/2026/paper-presenter-profiles.json  (${profiles.length} profiles)`,
  );
  return profiles;
}

async function buildArchiveProgramData() {
  if (!existsSync(CONTENT)) return;

  const sharedProfiles = loadSharedAuthorBios();
  if (!sharedProfiles.size) return;

  const remoteAvatarStats = await fetchRemoteAuthorAvatars(sharedProfiles);
  if (remoteAvatarStats.total) {
    console.log(
      `  images/people/  (${remoteAvatarStats.total} remote avatar${
        remoteAvatarStats.total === 1 ? '' : 's'
      }: ${remoteAvatarStats.fetched} fetched)`,
    );
  }

  writeConferencePaperPresenterProfiles(sharedProfiles);

  const yearDirs = readdirSync(CONTENT, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== 'bios' && entry.name !== 'speakers',
  );

  for (const entry of yearDirs) {
    const program = loadArchiveProgramDataForYear(entry.name, sharedProfiles);
    const { speakers, presentations } = program;
    if (!speakers.length && !presentations.length) continue;

    const targetDir = join(DIST, 'data', 'archive', entry.name);
    mkdirSync(targetDir, { recursive: true });

    writeFileSync(join(targetDir, 'program.json'), JSON.stringify(program, null, 2) + '\n');

    console.log(
      `  data/archive/${entry.name}/program.json  (${presentations.length} presentations)`,
    );
  }
}

// ── Generate sitemap.xml ────────────────────────────────────────────

function generateSitemap(files, config, targetDir) {
  const sitemapFiles = files.filter((file) => {
    const rel = relative(targetDir, file).split(path.sep).join('/');
    return rel !== '404.html' && !rel.split('/').some((segment) => segment.startsWith('_'));
  });
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

async function main() {
  // Step 1: Copy src/ to dist/
  console.log('\nbuild.mjs -> assembling dist/\n');
  assembleDist();

  console.log('build.mjs -> generating archive program data\n');
  await buildArchiveProgramData();

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  buildArchiveProgramData,
  buildConferencePaperPresenterProfiles,
  fetchRemoteAuthorAvatars,
  loadArchiveProgramDataForYear,
  loadSharedAuthorBios,
  resolveAuthorAvatar,
  writeConferencePaperPresenterProfiles,
};
