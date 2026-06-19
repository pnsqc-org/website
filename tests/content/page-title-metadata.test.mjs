import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path, { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import { test } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');
const SITE_TITLE = 'PNSQC';
const TITLE_LABELS = {
  archive: 'Archive',
  conference: 'Conference',
  governance: 'Governance',
  'innovation-day': 'Innovation Day',
};
const TITLE_EXCEPTIONS = {
  'src/index.html': 'Pacific Northwest Software Quality Conference - PNSQC',
};

function listHtmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_partials') continue;
      files.push(...listHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePath(filePath) {
  return relative(ROOT, filePath).split(path.sep).join('/');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseSegment(segment) {
  if (/^\d+$/.test(segment)) return segment;
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function titleLabelForSegment(segment) {
  return TITLE_LABELS[segment] || titleCaseSegment(segment);
}

function hierarchyLabelsForFile(filePath) {
  const relativeSegments = relative(SRC, filePath).split(path.sep);
  const routeSegments =
    relativeSegments.at(-1) === 'index.html'
      ? relativeSegments.slice(0, -1)
      : [
          ...relativeSegments.slice(0, -1),
          relativeSegments.at(-1).replace(/\.html$/i, ''),
        ];

  return routeSegments
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('_'))
    .reverse()
    .map(titleLabelForSegment);
}

function readMetaTitle(html, filePath) {
  const metaMatch = html.match(/<!--\s*meta\b([\s\S]*?)-->/);
  assert.ok(metaMatch, `${relativePath(filePath)} must include a source meta block`);

  const titleMatch = metaMatch[1].match(/^\s*title:\s*(.+?)\s*$/m);
  assert.ok(titleMatch, `${relativePath(filePath)} must include a title metadata field`);
  return titleMatch[1];
}

test('source page titles match the first h1, folder hierarchy, and PNSQC suffix', () => {
  const htmlFiles = listHtmlFiles(SRC);
  assert.ok(htmlFiles.length > 0, 'expected source HTML pages to exist');

  for (const filePath of htmlFiles) {
    const html = readFileSync(filePath, 'utf8');
    const metaTitle = readMetaTitle(html, filePath);
    const { document } = new JSDOM(html).window;
    const h1 = document.querySelector('h1');

    assert.ok(h1, `${relativePath(filePath)} must include an h1`);

    const h1Text = normalizeText(h1.textContent);
    assert.notEqual(h1Text, '', `${relativePath(filePath)} h1 must not be empty`);
    const expectedTitle =
      TITLE_EXCEPTIONS[relativePath(filePath)] ||
      [h1Text, ...hierarchyLabelsForFile(filePath), SITE_TITLE].join(' - ');

    assert.equal(
      metaTitle,
      expectedTitle,
      `${relativePath(filePath)} title metadata must match its h1 and route hierarchy`,
    );
  }
});
