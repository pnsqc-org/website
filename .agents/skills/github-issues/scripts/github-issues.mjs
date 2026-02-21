#!/usr/bin/env node

/**
 * GitHub Issues CLI
 * Commands:
 *   create  - Create a new issue
 *   read    - Read one issue or list issues
 *   comment - Add a comment to an issue
 *   close   - Close an issue (optionally with a closing comment)
 *   worklist - List all open issues with follow-up commands
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = fileURLToPath(import.meta.url);
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

function findUp(startDir, filename) {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadEnv() {
  const envPathFromCwd = findUp(process.cwd(), ".env");
  const envPathFromScript = findUp(__dirname, ".env");
  const envPath = envPathFromCwd || envPathFromScript;

  if (!envPath) {
    console.error("Error: .env file not found.");
    console.error("Looked in:");
    console.error(` - ${process.cwd()} (and parents)`);
    console.error(` - ${__dirname} (and parents)`);
    process.exit(1);
  }

  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!key) continue;
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function printUsage() {
  console.log(`
GitHub Issues CLI

Usage:
  node github-issues.mjs <command> [options]

Commands:
  create   Create an issue
  read     Read one issue or list issues
  comment  Add a comment to an issue
  close    Close an issue (optionally add a comment first)
  worklist List all open issues and next commands to work on them

Common options:
      --json                    Print raw JSON output
  -h, --help                    Show help

create options:
  -t, --title <text>            Issue title (required)
  -b, --body <text>             Issue body
      --labels <a,b,c>          Comma-separated labels
      --assignees <u1,u2>       Comma-separated assignees

read options:
  -n, --number <issue-number>   Read a single issue
  -s, --state <open|closed|all> List state filter (default: open)
  -l, --limit <1-100>           List size (default: 20)
      --comments                Include comments when reading a single issue

comment options:
  -n, --number <issue-number>   Target issue number (required)
  -b, --body <text>             Comment text (required)

close options:
  -n, --number <issue-number>   Target issue number (required)
  -b, --body <text>             Optional comment to add before closing

worklist options:
  -l, --limit <1-100>           Optional max issues to print (default: all)

Examples:
  node github-issues.mjs create -t "Broken link" -b "Details..."
  node github-issues.mjs read -s open -l 10
  node github-issues.mjs read -n 123 --comments
  node github-issues.mjs comment -n 123 -b "I can reproduce this."
  node github-issues.mjs close -n 123 -b "Fixed in #456."
  node github-issues.mjs worklist

Environment:
  Requires GITHUB_API_KEY and GITHUB_REPOSITORY in a .env file
  (.env is searched upward from your current directory, then from this script directory)
`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const command = argv[0];
  const validCommands = new Set(["create", "read", "comment", "close", "worklist"]);
  if (!validCommands.has(command)) {
    console.error(`Error: Unknown command "${command}"`);
    printUsage();
    process.exit(1);
  }

  const options = {
    title: null,
    body: null,
    number: null,
    state: null,
    limit: null,
    labels: null,
    assignees: null,
    comments: false,
    json: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--comments") {
      options.comments = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[++i];
      if (!value || value.startsWith("-")) {
        console.error(`Error: Missing value for ${token}`);
        printUsage();
        process.exit(1);
      }
      return value;
    };

    switch (token) {
      case "--title":
      case "-t":
        options.title = nextValue();
        break;
      case "--body":
      case "-b":
        options.body = nextValue();
        break;
      case "--number":
      case "-n":
        options.number = nextValue();
        break;
      case "--state":
      case "-s":
        options.state = nextValue();
        break;
      case "--limit":
      case "-l":
        options.limit = nextValue();
        break;
      case "--labels":
        options.labels = nextValue();
        break;
      case "--assignees":
        options.assignees = nextValue();
        break;
      default:
        console.error(`Error: Unknown option "${token}"`);
        printUsage();
        process.exit(1);
    }
  }

  return { help: false, command, options };
}

function parseRepo(repo) {
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error('Repository must be in "owner/repo" format.');
  }
  const [owner, name] = repo.split("/");
  return { owner, name };
}

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIssueNumber(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Issue number must be a positive integer.");
  }
  return number;
}

function parseLimit(value) {
  if (value == null) return 20;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new Error("Limit must be an integer between 1 and 100.");
  }
  return n;
}

function parseState(value) {
  const state = value || "open";
  if (!["open", "closed", "all"].includes(state)) {
    throw new Error('State must be one of: "open", "closed", "all".');
  }
  return state;
}

async function githubRequest(path, { method = "GET", token, body, query } = {}) {
  const url = new URL(`${GITHUB_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
      "User-Agent": "github-issues-cli",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    const message =
      (data && typeof data.message === "string" && data.message) ||
      raw ||
      `${response.status} ${response.statusText}`;
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  return data;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function printIssueSummary(issue) {
  const labels = (issue.labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter(Boolean);
  console.log(`#${issue.number}: ${issue.title}`);
  console.log(`State: ${issue.state}`);
  console.log(`Author: ${issue.user?.login || "unknown"}`);
  console.log(`Labels: ${labels.length ? labels.join(", ") : "(none)"}`);
  console.log(`URL: ${issue.html_url}`);
  console.log(`Created: ${issue.created_at}`);
  if (issue.closed_at) {
    console.log(`Closed: ${issue.closed_at}`);
  }
  if (typeof issue.body === "string" && issue.body.trim()) {
    console.log("\nBody:");
    console.log(issue.body);
  }
}

function printComment(comment) {
  console.log(`Comment by ${comment.user?.login || "unknown"} (${comment.created_at})`);
  console.log(comment.body || "");
  console.log(`URL: ${comment.html_url}`);
}

async function fetchOpenIssuesAll({ token, owner, repo }) {
  const all = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const chunk = await githubRequest(`/repos/${owner}/${repo}/issues`, {
      token,
      query: {
        state: "open",
        per_page: perPage,
        page,
      },
    });

    const issues = Array.isArray(chunk) ? chunk.filter((item) => !item.pull_request) : [];
    all.push(...issues);

    if (!Array.isArray(chunk) || chunk.length < perPage) {
      break;
    }
    page += 1;
  }

  return all;
}

function issueActionCommands(issueNumber) {
  const base = `node "${CLI_PATH}"`;
  return {
    read: `${base} read -n ${issueNumber} --comments`,
    comment: `${base} comment -n ${issueNumber} -b "<status update>"`,
    close: `${base} close -n ${issueNumber} -b "<resolution note>"`,
  };
}

function printWorkItem(issue) {
  const labels = (issue.labels || [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter(Boolean);
  const commands = issueActionCommands(issue.number);

  console.log(`#${issue.number}: ${issue.title}`);
  console.log(`State: ${issue.state}`);
  console.log(`Author: ${issue.user?.login || "unknown"}`);
  console.log(`Created: ${issue.created_at}`);
  console.log(`Comments: ${issue.comments ?? 0}`);
  console.log(`Labels: ${labels.length ? labels.join(", ") : "(none)"}`);
  console.log(`URL: ${issue.html_url}`);
  console.log("Next commands:");
  console.log(`  ${commands.read}`);
  console.log(`  ${commands.comment}`);
  console.log(`  ${commands.close}`);
}

async function runCreate({ token, owner, repo, options }) {
  if (!options.title) {
    throw new Error("`create` requires --title.");
  }

  const issue = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    token,
    body: {
      title: options.title,
      body: options.body || undefined,
      labels: parseCsv(options.labels),
      assignees: parseCsv(options.assignees),
    },
  });

  if (options.json) {
    console.log(JSON.stringify(issue, null, 2));
    return;
  }

  console.log("Issue created successfully:\n");
  printIssueSummary(issue);
}

async function runRead({ token, owner, repo, options }) {
  if (options.number) {
    const number = parseIssueNumber(options.number);
    const issue = await githubRequest(`/repos/${owner}/${repo}/issues/${number}`, { token });

    if (options.json && !options.comments) {
      console.log(JSON.stringify(issue, null, 2));
      return;
    }

    if (options.json && options.comments) {
      const comments = await githubRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, { token });
      console.log(JSON.stringify({ issue, comments }, null, 2));
      return;
    }

    printIssueSummary(issue);

    if (options.comments) {
      const comments = await githubRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, { token });
      console.log(`\nComments (${comments.length}):\n`);
      if (comments.length === 0) {
        console.log("(no comments)");
      } else {
        for (const comment of comments) {
          printComment(comment);
          console.log("");
        }
      }
    }
    return;
  }

  const state = parseState(options.state);
  const limit = parseLimit(options.limit);
  const issues = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    token,
    query: {
      state,
      per_page: limit,
    },
  });

  const filtered = Array.isArray(issues) ? issues.filter((item) => !item.pull_request) : [];

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  console.log(`Found ${filtered.length} issues (state=${state}):\n`);
  if (filtered.length === 0) {
    console.log("(no issues)");
    return;
  }

  for (const issue of filtered) {
    console.log(`#${issue.number} [${issue.state}] ${issue.title}`);
    console.log(`  ${issue.html_url}`);
  }
}

async function runComment({ token, owner, repo, options }) {
  if (!options.number) {
    throw new Error("`comment` requires --number.");
  }
  if (!options.body) {
    throw new Error("`comment` requires --body.");
  }

  const number = parseIssueNumber(options.number);
  const comment = await githubRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, {
    method: "POST",
    token,
    body: {
      body: options.body,
    },
  });

  if (options.json) {
    console.log(JSON.stringify(comment, null, 2));
    return;
  }

  console.log("Comment posted successfully:\n");
  printComment(comment);
}

async function runClose({ token, owner, repo, options }) {
  if (!options.number) {
    throw new Error("`close` requires --number.");
  }
  const number = parseIssueNumber(options.number);

  let comment = null;
  if (options.body) {
    comment = await githubRequest(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      token,
      body: {
        body: options.body,
      },
    });
  }

  const closedIssue = await githubRequest(`/repos/${owner}/${repo}/issues/${number}`, {
    method: "PATCH",
    token,
    body: {
      state: "closed",
    },
  });

  if (options.json) {
    console.log(JSON.stringify({ issue: closedIssue, comment }, null, 2));
    return;
  }

  if (comment) {
    console.log("Closing comment posted.\n");
  }
  console.log(`Issue #${closedIssue.number} is now ${closedIssue.state}.`);
  console.log(closedIssue.html_url);
}

async function runWorklist({ token, owner, repo, options }) {
  const issues = await fetchOpenIssuesAll({ token, owner, repo });
  const limit = options.limit == null ? null : parseLimit(options.limit);
  const selected = limit == null ? issues : issues.slice(0, limit);

  if (options.json) {
    const items = selected.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      comments: issue.comments ?? 0,
      labels: (issue.labels || [])
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter(Boolean),
      commands: issueActionCommands(issue.number),
    }));
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  console.log(`Open issues ready to work: ${selected.length}${limit == null ? "" : ` (limit=${limit})`}\n`);
  if (selected.length === 0) {
    console.log("(no open issues)");
    return;
  }

  for (const issue of selected) {
    printWorkItem(issue);
    console.log("");
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  loadEnv();

  const token = process.env.GITHUB_API_KEY;
  if (!token) {
    console.error("Error: GITHUB_API_KEY not found in .env file");
    process.exit(1);
  }

  const repoInput = process.env.GITHUB_REPOSITORY;
  if (!repoInput) {
    console.error("Error: GITHUB_REPOSITORY is required in .env (format: owner/repo).");
    process.exit(1);
  }

  try {
    const { owner, name: repo } = parseRepo(repoInput);
    const context = { token, owner, repo, options: parsed.options };

    if (parsed.command === "create") {
      await runCreate(context);
    } else if (parsed.command === "read") {
      await runRead(context);
    } else if (parsed.command === "comment") {
      await runComment(context);
    } else if (parsed.command === "close") {
      await runClose(context);
    } else if (parsed.command === "worklist") {
      await runWorklist(context);
    } else {
      throw new Error(`Unhandled command: ${parsed.command}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
