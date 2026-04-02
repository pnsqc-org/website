import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const playwrightBrowsersPath = path.join(rootDir, '.playwright-browsers');

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
  --install-browser-only     Install the project-local Playwright Chromium browser and exit.
  --help                     Show this help message.

Examples:
  npm run audit:a11y
  npm run audit:a11y -- --route /about/contact/ --theme light
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
      theme: { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
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
    routes: values.route,
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
