import { createServer } from 'node:http';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const defaultReportPath = path.join(rootDir, 'reports', 'axe-report.json');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DEFAULT_THEMES = ['dark', 'light'];
const SUPPORTED_THEMES = new Set(DEFAULT_THEMES);
const NAVIGATION_TIMEOUT_MS = 60000;
const PAGE_READY_TIMEOUT_MS = 10000;
const TITLE_READY_TIMEOUT_MS = 10000;
const DEFAULT_PLAYWRIGHT_BROWSERS_PATH = path.join(rootDir, '.playwright-browsers');

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function normalizeList(values) {
  const entries = Array.isArray(values) ? values : [values];

  return [
    ...new Set(
      entries
        .flatMap((value) => String(value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeThemes(values) {
  const themes = normalizeList(values).map((theme) => theme.toLowerCase());
  const invalidThemes = themes.filter((theme) => !SUPPORTED_THEMES.has(theme));

  if (invalidThemes.length > 0) {
    throw new Error(
      `Unsupported theme filter(s): ${invalidThemes.join(', ')}. Use ${DEFAULT_THEMES.join(
        ' and ',
      )}.`,
    );
  }

  return themes.length > 0 ? themes : DEFAULT_THEMES;
}

function normalizeRoutes(values) {
  return normalizeList(values);
}

async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRoute(filePath) {
  const relativePath = path.relative(distDir, filePath).replaceAll(path.sep, '/');

  if (relativePath === 'index.html') {
    return '/';
  }

  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'index.html'.length)}`;
  }

  return `/${relativePath}`;
}

async function resolveRequestPath(urlPathname) {
  const normalizedPath = decodeURIComponent(urlPathname.split('?')[0]);
  const candidatePath = path.join(distDir, normalizedPath);

  try {
    const candidateStats = await stat(candidatePath);
    if (candidateStats.isDirectory()) {
      return path.join(candidatePath, 'index.html');
    }

    return candidatePath;
  } catch {
    if (!path.extname(candidatePath)) {
      return path.join(candidatePath, 'index.html');
    }

    return candidatePath;
  }
}

async function createStaticServer() {
  const server = createServer(async (request, response) => {
    const requestPath = request.url || '/';
    const filePath = await resolveRequestPath(requestPath);

    try {
      const fileContents = await readFile(filePath);
      const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(fileContents);
    } catch {
      try {
        const notFoundContents = await readFile(path.join(distDir, '404.html'));
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(notFoundContents);
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return server;
}

async function createBrowser() {
  const { chromium } = await import('playwright');

  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) {
      throw new Error(
        `Playwright Chromium is not installed in ${path.relative(
          rootDir,
          process.env.PLAYWRIGHT_BROWSERS_PATH || DEFAULT_PLAYWRIGHT_BROWSERS_PATH,
        )}. Run \`npm run audit:a11y:install\` and try again.`,
      );
    }

    throw error;
  }
}

async function waitForPageReady(page) {
  try {
    await page.waitForLoadState('load', { timeout: PAGE_READY_TIMEOUT_MS });
  } catch {
    // Continue to the explicit readyState check below.
  }

  try {
    await page.waitForFunction(() => document.readyState === 'complete', undefined, {
      timeout: PAGE_READY_TIMEOUT_MS,
    });
  } catch {
    // Keep going so Axe can report the real failure state.
  }
}

async function waitForDocumentTitle(page) {
  try {
    await page.waitForFunction(
      () => {
        const titleEl = document.head?.querySelector('title');
        const titleText = titleEl?.textContent?.trim() || '';
        return titleText.length > 0 && document.title.trim().length > 0;
      },
      undefined,
      { timeout: TITLE_READY_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}

async function captureTitleSnapshot(page) {
  return page.evaluate(() => ({
    readyState: document.readyState,
    documentTitle: document.title,
    titleElementText: document.head?.querySelector('title')?.textContent ?? null,
    titleElementCount: document.head?.querySelectorAll('title').length ?? 0,
    location: window.location.href,
  }));
}

async function runAxeAnalysis(page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
}

function hasDocumentTitleViolation(results) {
  return results.violations.some((violation) => violation.id === 'document-title');
}

function serializeViolations(results) {
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    tags: violation.tags,
    nodes: violation.nodes.map((node) => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary,
    })),
  }));
}

function isAlreadyClosedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Target page, context or browser has been closed') ||
    message.includes('Browser has been closed') ||
    message.includes('Target closed')
  );
}

async function closeQuietly(closeable) {
  if (!closeable) {
    return;
  }

  try {
    await closeable.close();
  } catch (error) {
    if (!isAlreadyClosedError(error)) {
      throw error;
    }
  }
}

async function preparePageForAudit(page, url) {
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForPageReady(page);
  return waitForDocumentTitle(page);
}

async function warmUpContext(context, baseUrl) {
  const warmUpPage = await context.newPage();
  try {
    await preparePageForAudit(warmUpPage, `${baseUrl}/404.html`);
  } finally {
    await closeQuietly(warmUpPage);
  }
}

async function auditRoute(context, url, route, theme) {
  const page = await context.newPage();

  try {
    const titleReady = await preparePageForAudit(page, url);
    let results = await runAxeAnalysis(page);
    let titleCheck;

    if (hasDocumentTitleViolation(results)) {
      const initialSnapshot = await captureTitleSnapshot(page);
      console.warn(
        `[${theme}] ${route} reported document-title; retrying with a fresh page: ${JSON.stringify(initialSnapshot)}`,
      );

      await page.close();

      const retryPage = await context.newPage();
      try {
        const titleReadyBeforeRetry = await preparePageForAudit(retryPage, url);
        const retrySnapshot = await captureTitleSnapshot(retryPage);
        const retryResults = await runAxeAnalysis(retryPage);
        const resolvedOnRetry = !hasDocumentTitleViolation(retryResults);

        titleCheck = {
          titleReady,
          titleReadyBeforeRetry,
          initialSnapshot,
          retrySnapshot,
          resolvedOnRetry,
        };
        results = retryResults;
      } finally {
        await closeQuietly(retryPage);
      }
    }

    return {
      titleCheck,
      violations: serializeViolations(results),
    };
  } finally {
    if (!page.isClosed()) {
      await closeQuietly(page);
    }
  }
}

async function assertDistExists() {
  try {
    await access(distDir);
  } catch {
    throw new Error(
      `Build output not found at ${path.relative(
        rootDir,
        distDir,
      )}. Run \`npm run build\` or \`npm run audit:a11y\`.`,
    );
  }
}

export async function runAxeAudit({
  routes: rawRouteFilters = process.env.AXE_ROUTES || '',
  themes: rawThemeFilters = process.env.AXE_THEMES || DEFAULT_THEMES.join(','),
  reportPath = process.env.AXE_REPORT_PATH || defaultReportPath,
} = {}) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= DEFAULT_PLAYWRIGHT_BROWSERS_PATH;
  await assertDistExists();

  const routeFilter = normalizeRoutes(rawRouteFilters);
  const themes = normalizeThemes(rawThemeFilters);
  const htmlFiles = await collectHtmlFiles(distDir);
  const routes = htmlFiles
    .map(toRoute)
    .filter((route) => routeFilter.length === 0 || routeFilter.includes(route))
    .sort((a, b) => a.localeCompare(b));

  if (routes.length === 0) {
    const suffix =
      routeFilter.length > 0 ? ` for filters: ${routeFilter.join(', ')}` : ' in the built site';
    throw new Error(`No HTML routes were found${suffix}.`);
  }

  const server = await createStaticServer();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await createBrowser();
  const report = [];

  try {
    for (const theme of themes) {
      const context = await browser.newContext({ colorScheme: theme });
      await context.addInitScript((selectedTheme) => {
        try {
          localStorage.setItem('theme', selectedTheme);
        } catch {
          // ignore
        }
      }, theme);

      try {
        await warmUpContext(context, baseUrl);

        for (const route of routes) {
          const url = `${baseUrl}${route}`;
          const results = await auditRoute(context, url, route, theme);

          report.push({
            theme,
            route,
            url,
            titleCheck: results.titleCheck,
            violations: results.violations,
          });
        }
      } finally {
        await closeQuietly(context);
      }
    }
  } finally {
    await closeQuietly(browser);
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const totalViolations = report.reduce((sum, entry) => sum + entry.violations.length, 0);
  const pagesWithViolations = report.filter((entry) => entry.violations.length > 0);
  const resolvedReportPath = path.resolve(rootDir, reportPath);

  await mkdir(path.dirname(resolvedReportPath), { recursive: true });
  await writeFile(resolvedReportPath, JSON.stringify(report, null, 2));

  console.log(`Audited ${report.length} page-theme combination(s).`);
  console.log(`Pages with violations: ${pagesWithViolations.length}`);
  console.log(`Total distinct violations by page: ${totalViolations}`);
  console.log(`Report written to ${path.relative(rootDir, resolvedReportPath)}`);

  for (const theme of themes) {
    const themeEntries = report.filter((entry) => entry.theme === theme);
    const themeViolations = themeEntries.filter((entry) => entry.violations.length > 0);
    console.log(
      `${theme}: ${themeViolations.length} page(s) with violations out of ${themeEntries.length} audited`,
    );
  }

  for (const entry of pagesWithViolations) {
    console.log(`\n[${entry.theme}] ${entry.route}`);
    for (const violation of entry.violations) {
      console.log(`- [${violation.impact || 'unknown'}] ${violation.id}: ${violation.help}`);
      for (const node of violation.nodes.slice(0, 3)) {
        console.log(`  target: ${node.target.join(', ')}`);
      }
      if (violation.nodes.length > 3) {
        console.log(`  ... ${violation.nodes.length - 3} more node(s)`);
      }
    }
  }

  return {
    pagesWithViolations,
    report,
    reportPath: resolvedReportPath,
    totalViolations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runAxeAudit()
    .then(({ pagesWithViolations }) => {
      if (pagesWithViolations.length > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
