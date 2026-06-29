import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { getHeaderLogoForPage } from '../../build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');

test('innovation-day routes use the innovation day header logo', () => {
  assert.deepEqual(getHeaderLogoForPage(join(DIST, 'innovation-day', 'index.html'), DIST), {
    src: '/images/brand/pnsqc-innovation-day-logo.png',
    alt: 'PNSQC Innovation Day logo',
  });

  assert.deepEqual(
    getHeaderLogoForPage(join(DIST, 'innovation-day', 'sponsors', 'index.html'), DIST),
    {
      src: '/images/brand/pnsqc-innovation-day-logo.png',
      alt: 'PNSQC Innovation Day logo',
    },
  );
});

test('non-innovation-day routes keep the default header logo', () => {
  assert.deepEqual(getHeaderLogoForPage(join(DIST, 'index.html'), DIST), {
    src: '/images/brand/pnsqc-logo-2026.jpg',
    alt: 'PNSQC — Pacific Northwest Software Quality Conference',
  });

  assert.deepEqual(getHeaderLogoForPage(join(DIST, 'conference', '2026', 'index.html'), DIST), {
    src: '/images/brand/pnsqc-logo-2026.jpg',
    alt: 'PNSQC — Pacific Northwest Software Quality Conference',
  });
});
