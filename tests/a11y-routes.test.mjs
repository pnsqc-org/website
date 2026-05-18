import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRoutes } from '../axe/axe-audit.mjs';

test('normalizeRoutes preserves standard site routes', () => {
  assert.deepEqual(normalizeRoutes('/about/contact/'), ['/about/contact/']);
});

test('normalizeRoutes repairs Git for Windows converted route arguments', () => {
  assert.deepEqual(normalizeRoutes('C:/Program Files/Git/about/contact/.'), ['/about/contact/']);
});

test('normalizeRoutes accepts comma-separated route filters', () => {
  assert.deepEqual(normalizeRoutes('/about/contact/,conference/2026/sponsors'), [
    '/about/contact/',
    '/conference/2026/sponsors/',
  ]);
});
