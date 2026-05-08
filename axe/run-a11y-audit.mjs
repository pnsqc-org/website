import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const playwrightBrowsersPath = path.join(rootDir, '.playwright-browsers');
const srcPrefix = 'src/';
const partialsPrefix = 'src/_partials/';

function getNpmInvocation(args) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args],
    };
  }

  return {
    command: 'npm',
    args,
  };
}

function printHelp() {
  console.log(`Usage: npm run audit:a11y -- [options]

Options:
  --route <route>            Audit only matching route(s). Repeatable.
  --theme <theme>            Audit only selected theme(s): dark, light. Repeatable.
  --report <path>            Write the JSON report to a custom path.
  --skip-build               Skip "npm run build" before auditing.
  --staged                   Audit only staged HTML page routes.
  --install-browser-only     Install the project-local Playwright Chromium browser and exit.
  --help                     Show this help message.

Examples:
  npm run audit:a11y
  npm run audit:a11y -- --route /about/contact/ --theme light
  npm run audit:a11y -- --skip-build --staged
  npm run audit:a11y -- --skip-build
  npm run audit:a11y:install`);
}

async function runNpmCommand(args, label) {
  const npmInvocation = getNpmInvocation(args);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(npmInvocation.command, npmInvocation.args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}.`);
  }
}

async function runCommand(command, args, label) {
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.once('error', reject);
    child.once('exit', resolve);
  });

  if (exitCode !== 0) {
    const details = stderr.trim() ? `\n${stderr.trim()}` : '';
    throw new Error(`${label} failed with exit code ${exitCode}.${details}`);
  }

  return stdout;
}

function parseNameStatus(output) {
  const tokens = output.split('\0').filter(Boolean);
  const files = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index];

    if (status.startsWith('R') || status.startsWith('C')) {
      index += 2;
      files.push(tokens[index]);
      continue;
    }

    index += 1;
    files.push(tokens[index]);
  }

  return files;
}

async function getStagedHtmlFiles() {
  const output = await runCommand(
    'git',
    ['diff', '--cached', '--name-status', '-z', '--diff-filter=ACMR', '--', '*.html'],
    'Staged HTML lookup',
  );

  return parseNameStatus(output)
    .map((file) => file.replaceAll('\\', '/'))
    .filter(Boolean);
}

function srcHtmlPathToRoute(file) {
  if (!file.startsWith(srcPrefix) || file.startsWith(partialsPrefix)) {
    return null;
  }

  const relativePath = file.slice(srcPrefix.length);
  const absolutePath = path.join(rootDir, ...file.split('/'));

  if (!existsSync(absolutePath)) {
    return null;
  }

  if (relativePath === 'index.html') {
    return '/';
  }

  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'index.html'.length)}`;
  }

  return `/${relativePath}`;
}

async function getStagedRoutes() {
  const stagedHtmlFiles = await getStagedHtmlFiles();

  if (stagedHtmlFiles.length === 0) {
    return {
      mode: 'skip',
      message: 'No staged HTML changes found; skipping accessibility audit.',
    };
  }

  if (stagedHtmlFiles.some((file) => file.startsWith(partialsPrefix))) {
    return {
      mode: 'full',
      message: 'Shared HTML partial changed; running full accessibility audit.',
    };
  }

  const routes = [...new Set(stagedHtmlFiles.map(srcHtmlPathToRoute).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  if (routes.length === 0) {
    return {
      mode: 'skip',
      message: 'No staged page HTML changes found; skipping accessibility audit.',
    };
  }

  return {
    mode: 'routes',
    message: `Running accessibility audit for staged route(s): ${routes.join(', ')}`,
    routes,
  };
}

async function getChromiumExecutablePath() {
  const { chromium } = await import('playwright');
  return chromium.executablePath();
}

async function ensureChromiumInstalled() {
  const executablePath = await getChromiumExecutablePath();

  try {
    await access(executablePath);
    return executablePath;
  } catch {
    console.log(
      `Installing Playwright Chromium into ${path.relative(rootDir, playwrightBrowsersPath)}...`,
    );
    await runNpmCommand(['exec', 'playwright', 'install', 'chromium'], 'Playwright install');
    const installedExecutablePath = await getChromiumExecutablePath();
    await access(installedExecutablePath);
    return installedExecutablePath;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      'install-browser-only': { type: 'boolean' },
      report: { type: 'string' },
      route: { type: 'string', multiple: true },
      'skip-build': { type: 'boolean' },
      staged: { type: 'boolean' },
      theme: { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  let routes = values.route;

  if (values.staged && !values['install-browser-only']) {
    const stagedRoutes = await getStagedRoutes();
    console.log(stagedRoutes.message);

    if (stagedRoutes.mode === 'skip') {
      return;
    }

    routes = stagedRoutes.mode === 'routes' ? stagedRoutes.routes : undefined;
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath;

  const executablePath = await ensureChromiumInstalled();
  console.log(`Using Playwright Chromium: ${path.relative(rootDir, executablePath)}`);

  if (values['install-browser-only']) {
    return;
  }

  if (!values['skip-build']) {
    await runNpmCommand(['run', 'build'], 'Site build');
  }

  const { runAxeAudit } = await import('./axe-audit.mjs');
  const { pagesWithViolations } = await runAxeAudit({
    reportPath: values.report,
    routes,
    themes: values.theme,
  });

  if (pagesWithViolations.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
