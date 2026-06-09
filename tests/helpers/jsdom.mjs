import { vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let importCounter = 0;

export async function importFreshSrcModule(relativePath) {
  importCounter += 1;
  const url = pathToFileURL(path.join(process.cwd(), 'src', 'js', relativePath));
  url.searchParams.set('testImport', String(importCounter));
  return import(url.href);
}

export function resetDom(html = '', url = 'https://www.pnsqc.org/') {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  document.body.innerHTML = html;
  document.head.innerHTML = '';
  window.history.replaceState({}, '', url);
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export function flushPromises() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
