#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const EMAIL_LINE_WIDTH = 72;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

const SCRIPT_DIR = __dirname;
const REPO_ROOT = findRepoRoot();
const ENV_FILE = path.join(REPO_ROOT, '.env');

const TOKENS_ENV_B64 = 'GMAIL_SKILL_TOKENS_B64';
const TOKENS_ENV_JSON = 'GMAIL_SKILL_TOKENS_JSON';
const META_ENV_B64 = 'GMAIL_SKILL_ACCOUNTS_META_B64';
const META_ENV_JSON = 'GMAIL_SKILL_ACCOUNTS_META_JSON';

function findRepoRoot() {
  let current = __dirname;
  while (true) {
    const pkg = path.join(current, 'package.json');
    if (fs.existsSync(pkg)) return current;
    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

function padBase64Url(data) {
  let normalized = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return normalized;
}

function decodeBase64UrlUtf8(data) {
  try {
    return Buffer.from(padBase64Url(data), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function toBase64UrlUtf8(text) {
  return Buffer.from(String(text), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseDotEnv(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readEnvMap() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return parseDotEnv(fs.readFileSync(ENV_FILE, 'utf8'));
}

function writeEnvKey(key, value) {
  const safeValue = String(value ?? '');
  let content = '';
  if (fs.existsSync(ENV_FILE)) {
    content = fs.readFileSync(ENV_FILE, 'utf8');
  }
  const lines = content ? content.split(/\r?\n/) : [];
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=`);
  let replaced = false;
  const newLines = lines.map((line) => {
    if (pattern.test(line)) {
      replaced = true;
      return `${key}=${safeValue}`;
    }
    return line;
  });

  if (!replaced) {
    if (newLines.length && newLines[newLines.length - 1] !== '') newLines.push('');
    newLines.push(`${key}=${safeValue}`);
  }

  const output = newLines.join('\n').replace(/\n*$/, '\n');
  fs.writeFileSync(ENV_FILE, output, { mode: 0o600 });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEnvVar(...keys) {
  const fileEnv = readEnvMap();
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
    if (fileEnv[key]) return fileEnv[key];
  }
  return undefined;
}

function loadJsonStore({ b64Key, jsonKey }) {
  const b64 = getEnvVar(b64Key);
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      throw new Error(`Invalid JSON in ${b64Key}`);
    }
  }
  const jsonText = getEnvVar(jsonKey);
  if (jsonText) {
    try {
      return JSON.parse(jsonText);
    } catch {
      throw new Error(`Invalid JSON in ${jsonKey}`);
    }
  }
  return {};
}

function saveJsonStore({ b64Key }, data) {
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
  writeEnvKey(b64Key, encoded);
}

function loadTokensStore() {
  const store = loadJsonStore({ b64Key: TOKENS_ENV_B64, jsonKey: TOKENS_ENV_JSON });
  return isPlainObject(store) ? store : {};
}

function saveTokensStore(store) {
  saveJsonStore({ b64Key: TOKENS_ENV_B64 }, store);
}

function loadAccountsMeta() {
  const store = loadJsonStore({ b64Key: META_ENV_B64, jsonKey: META_ENV_JSON });
  return isPlainObject(store) ? store : {};
}

function saveAccountsMeta(meta) {
  saveJsonStore({ b64Key: META_ENV_B64 }, meta);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveAccountEmail(inputAccount, meta) {
  if (!inputAccount) return null;
  const raw = String(inputAccount).trim();
  if (!raw) return null;
  if (raw.includes('@')) return normalizeEmail(raw);
  const alias = raw.toLowerCase();
  for (const [email, info] of Object.entries(meta || {})) {
    if (String(info?.label || '').toLowerCase() === alias) {
      return normalizeEmail(email);
    }
  }
  return raw;
}

function getDefaultOrFirstAccountEmail(meta, tokens) {
  const tokenEmails = Object.keys(tokens || {}).filter((e) => e && isPlainObject(tokens[e]));
  if (!tokenEmails.length) return null;

  for (const [email, info] of Object.entries(meta || {})) {
    if (info?.is_default && tokenEmails.includes(normalizeEmail(email))) {
      return normalizeEmail(email);
    }
  }

  return [...tokenEmails].sort()[0];
}

function setAccountMeta(email, { label, description, isDefault }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email is required');
  const meta = loadAccountsMeta();
  if (!meta[normalized]) meta[normalized] = {};
  if (label !== undefined && label !== null) meta[normalized].label = label;
  if (description !== undefined && description !== null) meta[normalized].description = description;
  if (isDefault) {
    for (const key of Object.keys(meta)) {
      if (!isPlainObject(meta[key])) meta[key] = {};
      meta[key].is_default = false;
    }
    meta[normalized].is_default = true;
  }
  saveAccountsMeta(meta);
  return meta[normalized];
}

function listAccounts() {
  const tokens = loadTokensStore();
  const meta = loadAccountsMeta();
  const emails = Object.keys(tokens).sort();
  return emails.map((email) => {
    const accountMeta = meta[email] || {};
    return {
      email,
      label: accountMeta.label || '',
      description: accountMeta.description || '',
      is_default: Boolean(accountMeta.is_default),
      storage: `.env:${TOKENS_ENV_B64}`,
    };
  });
}

function requireClientConfig() {
  const clientId = getEnvVar('GMAIL_CLIENT_ID', 'GOOGLE_CLIENT_ID');
  const clientSecret = getEnvVar('GMAIL_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    const msg = [
      '',
      '='.repeat(60),
      'FIRST-TIME SETUP REQUIRED',
      '='.repeat(60),
      '',
      'Add Google OAuth credentials to the repo root .env file:',
      '  GMAIL_CLIENT_ID=your_desktop_app_client_id',
      '  GMAIL_CLIENT_SECRET=your_desktop_app_client_secret',
      '',
      `OAuth tokens and account metadata will be stored back into ${ENV_FILE} as base64 JSON.`,
      '',
      'Google Cloud setup:',
      '1. https://console.cloud.google.com/apis/credentials',
      '2. Create/select project',
      '3. Enable Gmail API and People API',
      '4. Configure OAuth consent screen and add yourself as test user',
      '5. Create OAuth client ID (Desktop app)',
      '',
    ].join('\n');
    throw new Error(msg);
  }

  return { clientId, clientSecret };
}

function nowIsoPlus(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isExpiredOrNear(token) {
  if (!token?.access_token) return true;
  if (!token?.expiry) return false;
  const t = Date.parse(token.expiry);
  if (Number.isNaN(t)) return false;
  return t - Date.now() < 60_000;
}

async function refreshAccessToken(clientConfig, tokenEntry) {
  if (!tokenEntry?.refresh_token) throw new Error('No refresh token available');
  const params = new URLSearchParams({
    client_id: clientConfig.clientId,
    client_secret: clientConfig.clientSecret,
    refresh_token: tokenEntry.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await safeJson(res);
  if (!res.ok) {
    const msg = data?.error_description || data?.error || JSON.stringify(data);
    throw new Error(`Token refresh failed: ${msg}`);
  }

  return {
    ...tokenEntry,
    ...data,
    refresh_token: tokenEntry.refresh_token,
    expiry: data.expires_in ? nowIsoPlus(data.expires_in) : tokenEntry.expiry,
  };
}

function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}

async function maybeOpenBrowser(url) {
  if (getEnvVar('GMAIL_SKILL_NO_BROWSER') === '1') return;
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    // URL is also printed to terminal below.
  }
}

async function waitForOAuthCallback({ expectedState, timeoutMs }) {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    try {
      server.close();
    } catch {
      // ignore
    }
    throw new Error('Failed to start OAuth callback server');
  }

  let timeout = null;
  function cleanup() {
    if (timeout) clearTimeout(timeout);
    try {
      server.close();
    } catch {
      // ignore
    }
  }

  const waitPromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`OAuth callback timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');

        if (error) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>Authentication error</h1><p>${escapeHtml(error)}</p></body></html>`);
          cleanup();
          reject(new Error(`Authentication error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body><h1>Missing code</h1></body></html>');
          return;
        }

        if (!state || state !== expectedState) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body><h1>Invalid OAuth state</h1><p>Authentication rejected.</p></body></html>');
          cleanup();
          reject(new Error('OAuth state mismatch'));
          return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body style="font-family:system-ui;text-align:center;padding:50px;">' +
            '<h1>Authentication Successful</h1><p>You can close this window and return to the terminal.</p>' +
          '</body></html>'
        );
        cleanup();
        resolve({ code });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  return { port: address.port, waitPromise };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function doOAuthFlow(clientConfig, { loginHint, forceConsent = false } = {}) {
  const state = randomState();
  const callbackSetup = await waitForOAuthCallback({ expectedState: state, timeoutMs: 120_000 });
  const port = callbackSetup.port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const params = new URLSearchParams({
    client_id: clientConfig.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    state,
  });
  if (forceConsent) params.set('prompt', 'consent');
  if (loginHint) params.set('login_hint', loginHint);

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  AUTHENTICATING: ${loginHint || 'New account'}`);
  console.log('='.repeat(50));
  console.log('Opening browser - select the account above.');
  console.log(`If browser does not open, visit:\n${authUrl}\n`);

  await maybeOpenBrowser(authUrl);

  const { code } = await callbackSetup.waitPromise;

  const tokenBody = new URLSearchParams({
    client_id: clientConfig.clientId,
    client_secret: clientConfig.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  const tokens = await safeJson(tokenRes);
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }

  if (tokens.expires_in) {
    tokens.expiry = nowIsoPlus(tokens.expires_in);
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (userRes.ok) {
    const user = await safeJson(userRes);
    if (user?.email) tokens.email = normalizeEmail(user.email);
  }

  return tokens;
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getAuthContext(requestedAccount) {
  const clientConfig = requireClientConfig();
  const meta = loadAccountsMeta();
  const tokensStore = loadTokensStore();

  const resolved = resolveAccountEmail(requestedAccount, meta);
  let selectedEmail = resolved;

  if (!selectedEmail || !selectedEmail.includes('@')) {
    if (!requestedAccount) {
      selectedEmail = getDefaultOrFirstAccountEmail(meta, tokensStore);
    }
  }

  let tokenEntry = selectedEmail ? tokensStore[selectedEmail] : null;

  if (tokenEntry && isExpiredOrNear(tokenEntry)) {
    try {
      tokenEntry = await refreshAccessToken(clientConfig, tokenEntry);
      tokensStore[selectedEmail] = tokenEntry;
      saveTokensStore(tokensStore);
    } catch (err) {
      console.error(`Token refresh failed, re-authenticating: ${err.message}`);
      tokenEntry = null;
    }
  }

  if (!tokenEntry) {
    const loginHint = selectedEmail && selectedEmail.includes('@') ? selectedEmail : undefined;
    const fresh = await doOAuthFlow(clientConfig, { loginHint, forceConsent: true });
    const email = normalizeEmail(fresh.email || selectedEmail);
    if (!email || !email.includes('@')) {
      throw new Error('OAuth succeeded but no user email was returned');
    }
    tokenEntry = fresh;
    tokensStore[email] = fresh;
    saveTokensStore(tokensStore);
    selectedEmail = email;
    console.log(`Authenticated as: ${email}`);
  }

  if (!selectedEmail) {
    throw new Error('No authenticated account available');
  }

  return {
    accountEmail: selectedEmail,
    accessToken: tokenEntry.access_token,
    tokenEntry,
  };
}

async function apiRequestJson(baseUrl, pathName, { method = 'GET', query, body, accessToken }) {
  const url = new URL(pathName, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
        }
      } else if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  let requestBody;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: requestBody });
  const data = await safeJson(res);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function getHeader(headers, name) {
  if (!Array.isArray(headers)) return '';
  const found = headers.find((h) => String(h?.name || '').toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

function decodeBody(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.body && payload.body.data) {
    return decodeBase64UrlUtf8(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    let htmlFallback = '';
    for (const part of payload.parts) {
      const mimeType = part?.mimeType || '';
      if (mimeType === 'text/plain' && part?.body?.data) {
        const text = decodeBase64UrlUtf8(part.body.data);
        if (text) return text;
      } else if (mimeType === 'text/html' && part?.body?.data) {
        const html = decodeBase64UrlUtf8(part.body.data);
        if (html && !htmlFallback) htmlFallback = html;
      } else if (mimeType.startsWith('multipart/')) {
        const nested = decodeBody(part);
        if (nested) return nested;
      }
    }
    return htmlFallback;
  }
  return '';
}

function formatEmailSummary(msg) {
  const headers = msg?.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || '',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    labels: msg.labelIds || [],
  };
}

function collectAttachments(parts, out) {
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    if (part?.filename) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part?.body?.size || 0,
      });
    }
    if (Array.isArray(part?.parts)) collectAttachments(part.parts, out);
  }
}

function formatEmailFull(msg) {
  const headers = msg?.payload?.headers || [];
  const attachments = [];
  collectAttachments(msg?.payload?.parts, attachments);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    bcc: getHeader(headers, 'Bcc'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    labels: msg.labelIds || [],
    body: decodeBody(msg?.payload),
    attachments,
    snippet: msg.snippet || '',
  };
}

function wrapEmailBody(body, width = EMAIL_LINE_WIDTH) {
  const paragraphs = String(body).split('\n\n');
  return paragraphs
    .map((para) => {
      const lines = para.split('\n');
      return lines.map((line) => wrapLinePreservingIndent(line, width)).join('\n');
    })
    .join('\n\n');
}

function wrapLinePreservingIndent(line, width) {
  if (!line.trim()) return line;
  const leading = (line.match(/^\s*/) || [''])[0].length;
  const target = Math.max(10, width - leading);
  const words = line.trim().split(/\s+/);
  const chunks = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= target) {
      current += ` ${word}`;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((c) => `${' '.repeat(leading)}${c}`).join('\n');
}

function sanitizeHeader(value, name) {
  const str = String(value ?? '');
  if (/[\r\n]/.test(str)) {
    throw new Error(`Invalid ${name} header value`);
  }
  return str;
}

function createMessage({ to, subject, body, cc, bcc, inReplyTo, references }) {
  const headers = [
    `To: ${sanitizeHeader(to, 'To')}`,
    `Subject: ${sanitizeHeader(subject, 'Subject')}`,
  ];
  if (cc) headers.push(`Cc: ${sanitizeHeader(cc, 'Cc')}`);
  if (bcc) headers.push(`Bcc: ${sanitizeHeader(bcc, 'Bcc')}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeader(inReplyTo, 'In-Reply-To')}`);
  if (references) headers.push(`References: ${sanitizeHeader(references, 'References')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: 8bit');

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${wrapEmailBody(body)}\r\n`;
  return { raw: toBase64UrlUtf8(rawMessage) };
}

async function gmailApi(pathName, opts = {}) {
  const ctx = await getAuthContext(opts.account);
  return apiRequestJson(GMAIL_API_BASE, pathName, {
    method: opts.method,
    query: opts.query,
    body: opts.body,
    accessToken: ctx.accessToken,
  });
}

async function gmailApiWithContext(pathName, opts = {}) {
  const ctx = await getAuthContext(opts.account);
  const data = await apiRequestJson(GMAIL_API_BASE, pathName, {
    method: opts.method,
    query: opts.query,
    body: opts.body,
    accessToken: ctx.accessToken,
  });
  return { data, ctx };
}

async function peopleApi(pathName, opts = {}) {
  const ctx = await getAuthContext(opts.account);
  return apiRequestJson(PEOPLE_API_BASE, pathName, {
    method: opts.method,
    query: opts.query,
    body: opts.body,
    accessToken: ctx.accessToken,
  });
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function parseCsvIds(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function cmdAccounts() {
  const accounts = listAccounts();
  if (!accounts.length) {
    printJson({ accounts: [], message: 'No accounts authenticated yet' });
    return;
  }
  printJson({ accounts });
}

async function cmdLogout(args) {
  const meta = loadAccountsMeta();
  const tokens = loadTokensStore();
  let targetEmail = resolveAccountEmail(args.account, meta);

  if (!targetEmail) {
    targetEmail = getDefaultOrFirstAccountEmail(meta, tokens);
  }

  if (!targetEmail || !tokens[targetEmail]) {
    printJson({ success: false, message: 'Account not found' });
    process.exitCode = 1;
    return;
  }

  delete tokens[targetEmail];
  saveTokensStore(tokens);

  const wasDefault = Boolean(meta[targetEmail]?.is_default);
  if (meta[targetEmail]) {
    delete meta[targetEmail];
    if (wasDefault) {
      const nextDefault = getDefaultOrFirstAccountEmail(meta, tokens);
      if (nextDefault) {
        if (!meta[nextDefault]) meta[nextDefault] = {};
        meta[nextDefault].is_default = true;
      }
    }
    saveAccountsMeta(meta);
  }

  printJson({ success: true, message: `Logged out: ${targetEmail}` });
}

async function cmdLabel(args) {
  const meta = setAccountMeta(args.email, {
    label: args.label,
    description: args.description,
    isDefault: Boolean(args.default),
  });
  printJson({
    success: true,
    email: normalizeEmail(args.email),
    label: meta.label || '',
    description: meta.description || '',
    is_default: Boolean(meta.is_default),
  });
}

async function cmdSearch(args) {
  const results = await gmailApi('users/me/messages', {
    account: args.account,
    query: {
      q: args.query,
      maxResults: args.maxResults,
    },
  });

  const messages = results.messages || [];
  if (!messages.length) {
    printJson({ results: [], total: 0 });
    return;
  }

  const emailList = [];
  for (const msg of messages) {
    const full = await gmailApi(`users/me/messages/${encodeURIComponent(msg.id)}`, {
      account: args.account,
      query: {
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      },
    });
    emailList.push(formatEmailSummary(full));
  }

  printJson({
    query: args.query,
    results: emailList,
    total: emailList.length,
    resultSizeEstimate: results.resultSizeEstimate || 0,
  });
}

async function cmdRead(args) {
  const msg = await gmailApi(`users/me/messages/${encodeURIComponent(args.emailId)}`, {
    account: args.account,
    query: { format: args.format === 'full' ? 'full' : 'metadata' },
  });

  printJson(args.format === 'full' ? formatEmailFull(msg) : formatEmailSummary(msg));
}

async function cmdList(args) {
  const labelIds = args.label ? [String(args.label).toUpperCase()] : ['INBOX'];
  const results = await gmailApi('users/me/messages', {
    account: args.account,
    query: {
      maxResults: args.maxResults,
      labelIds,
    },
  });

  const messages = results.messages || [];
  if (!messages.length) {
    printJson({ results: [], total: 0 });
    return;
  }

  const emailList = [];
  for (const msg of messages) {
    const full = await gmailApi(`users/me/messages/${encodeURIComponent(msg.id)}`, {
      account: args.account,
      query: {
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      },
    });
    emailList.push(formatEmailSummary(full));
  }

  printJson({
    label: args.label || 'INBOX',
    results: emailList,
    total: emailList.length,
  });
}

async function ensureSendConfirmation({ from, to, cc, bcc, subject, body, yes }) {
  if (yes) return;

  const preview = {
    from,
    to,
    cc: cc || '',
    bcc: bcc || '',
    subject,
    body,
  };
  printJson({ confirmation_required: true, email: preview });

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Send requires explicit confirmation. Re-run with --yes after reviewing details.');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('Do you want to send this email? [y/N]: ', (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });

  if (!['y', 'yes', 'send', 'send it', 'go ahead'].includes(answer)) {
    throw new Error('Send cancelled');
  }
}

async function cmdSend(args) {
  const { ctx } = await gmailApiWithContext('users/me/profile', { account: args.account });
  const fromEmail = ctx.accountEmail || 'unknown';

  await ensureSendConfirmation({
    from: fromEmail,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    body: args.body,
    yes: args.yes,
  });

  const message = createMessage({
    to: args.to,
    subject: args.subject,
    body: args.body,
    cc: args.cc,
    bcc: args.bcc,
  });

  const result = await gmailApi('users/me/messages/send', {
    account: args.account,
    method: 'POST',
    body: message,
  });

  printJson({
    success: true,
    message_id: result.id,
    thread_id: result.threadId,
    to: args.to,
    subject: args.subject,
    from: fromEmail,
  });
}

async function modifyManyMessages(args, action, body) {
  const emailIds = parseCsvIds(args.emailIds);
  const results = [];
  for (const emailId of emailIds) {
    try {
      await gmailApi(`users/me/messages/${encodeURIComponent(emailId)}/modify`, {
        account: args.account,
        method: 'POST',
        body,
      });
      results.push({ id: emailId, success: true });
    } catch (err) {
      results.push({ id: emailId, success: false, error: err.message });
    }
  }

  printJson({
    action,
    results,
    total: results.length,
    successful: results.filter((r) => r.success).length,
  });
}

async function cmdMarkRead(args) {
  return modifyManyMessages(args, 'mark_read', { removeLabelIds: ['UNREAD'] });
}

async function cmdMarkUnread(args) {
  return modifyManyMessages(args, 'mark_unread', { addLabelIds: ['UNREAD'] });
}

async function cmdMarkDone(args) {
  return modifyManyMessages(args, 'archive', { removeLabelIds: ['INBOX'] });
}

async function cmdUnarchive(args) {
  return modifyManyMessages(args, 'unarchive', { addLabelIds: ['INBOX'] });
}

async function cmdStar(args) {
  return modifyManyMessages(args, 'star', { addLabelIds: ['STARRED'] });
}

async function cmdUnstar(args) {
  return modifyManyMessages(args, 'unstar', { removeLabelIds: ['STARRED'] });
}

async function cmdDraft(args) {
  const { ctx } = await gmailApiWithContext('users/me/profile', { account: args.account });
  const fromEmail = ctx.accountEmail || 'unknown';

  let inReplyTo = null;
  let references = null;
  let threadId = args.threadId || null;

  if (args.replyToId) {
    const original = await gmailApi(`users/me/messages/${encodeURIComponent(args.replyToId)}`, {
      account: args.account,
      query: {
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'Message-Id', 'References'],
      },
    });

    threadId = original.threadId || threadId;
    const headers = original?.payload?.headers || [];
    const originalMessageId = getHeader(headers, 'Message-ID') || getHeader(headers, 'Message-Id');
    const originalReferences = getHeader(headers, 'References');

    if (originalMessageId) {
      inReplyTo = originalMessageId;
      references = originalReferences
        ? `${originalReferences} ${originalMessageId}`.trim()
        : originalMessageId;
    }
  }

  const message = createMessage({
    to: args.to,
    subject: args.subject,
    body: args.body,
    cc: args.cc,
    bcc: args.bcc,
    inReplyTo,
    references,
  });

  const draftBody = { message: { ...message } };
  if (threadId) draftBody.message.threadId = threadId;

  const result = await gmailApi('users/me/drafts', {
    account: args.account,
    method: 'POST',
    body: draftBody,
  });

  printJson({
    success: true,
    draft_id: result.id,
    message_id: result.message?.id,
    thread_id: result.message?.threadId,
    to: args.to,
    subject: args.subject,
    from: fromEmail,
    in_reply_to: inReplyTo,
  });
}

async function cmdLabels(args) {
  const results = await gmailApi('users/me/labels', { account: args.account });
  printJson({
    labels: (results.labels || []).map((label) => ({
      id: label.id,
      name: label.name,
      type: label.type,
    })),
  });
}

function checkPeopleApiError(err) {
  const text = JSON.stringify(err?.payload || err?.message || '');
  if (text.includes('People API has not been used') || text.includes('accessNotConfigured')) {
    const match = text.match(/project (\d+)/);
    const projectId = match ? match[1] : 'YOUR_PROJECT';
    const enableUrl =
      `https://console.developers.google.com/apis/api/people.googleapis.com/overview?project=${projectId}`;
    printJson({
      error: 'People API not enabled',
      message: 'The People API (Contacts) needs to be enabled in Google Cloud Console.',
      enable_url: enableUrl,
      instructions: [
        `1. Open: ${enableUrl}`,
        "2. Click 'ENABLE' button",
        '3. Wait ~30 seconds for propagation',
        '4. Try again',
      ],
    });
    return true;
  }
  return false;
}

async function cmdContacts(args) {
  const results = await peopleApi('people/me/connections', {
    account: args.account,
    query: {
      pageSize: args.maxResults,
      personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses',
    },
  });

  const connections = results.connections || [];
  const contactList = connections.map((person) => ({
    resourceName: person.resourceName,
    names: (person.names || []).map((n) => n.displayName),
    emails: (person.emailAddresses || []).map((e) => e.value),
    phones: (person.phoneNumbers || []).map((p) => p.value),
    organizations: (person.organizations || []).map((o) => ({
      name: o.name,
      title: o.title,
    })),
  }));

  printJson({
    results: contactList,
    total: contactList.length,
    totalPeople: results.totalPeople,
  });
}

async function cmdSearchContacts(args) {
  try {
    await peopleApi('people:searchContacts', {
      account: args.account,
      query: { query: '', readMask: 'names' },
    });
  } catch (err) {
    if (checkPeopleApiError(err)) {
      process.exitCode = 1;
      return;
    }
  }

  const results = await peopleApi('people:searchContacts', {
    account: args.account,
    query: {
      query: args.query,
      readMask: 'names,emailAddresses,phoneNumbers,organizations',
    },
  });

  const contacts = (results.results || []).map((result) => {
    const person = result.person || {};
    return {
      resourceName: person.resourceName,
      names: (person.names || []).map((n) => n.displayName),
      emails: (person.emailAddresses || []).map((e) => e.value),
      phones: (person.phoneNumbers || []).map((p) => p.value),
      organizations: (person.organizations || []).map((o) => ({
        name: o.name,
        title: o.title,
      })),
    };
  });

  printJson({
    query: args.query,
    results: contacts,
    total: contacts.length,
  });
}

async function cmdContact(args) {
  const safeResource = String(args.resourceName)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const person = await peopleApi(safeResource, {
    account: args.account,
    query: {
      personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,urls',
    },
  });

  printJson({
    resourceName: person.resourceName,
    names: person.names || [],
    emails: person.emailAddresses || [],
    phones: person.phoneNumbers || [],
    organizations: person.organizations || [],
    addresses: person.addresses || [],
    birthdays: person.birthdays || [],
    biographies: person.biographies || [],
    urls: person.urls || [],
  });
}

async function cmdOtherContacts(args) {
  const allContacts = [];
  let pageToken = null;

  while (true) {
    const remaining = Math.max(0, Number(args.maxResults) - allContacts.length);
    if (remaining <= 0) break;
    const results = await peopleApi('otherContacts', {
      account: args.account,
      query: {
        pageSize: Math.min(remaining, 1000),
        readMask: 'names,emailAddresses,phoneNumbers',
        pageToken,
      },
    });

    const contacts = results.otherContacts || [];
    for (const person of contacts) {
      const contact = {
        resourceName: person.resourceName,
        names: (person.names || []).map((n) => n.displayName),
        emails: (person.emailAddresses || []).map((e) => e.value),
        phones: (person.phoneNumbers || []).map((p) => p.value),
      };
      if (contact.names.length || contact.emails.length) {
        allContacts.push(contact);
      }
      if (allContacts.length >= args.maxResults) break;
    }

    pageToken = results.nextPageToken;
    if (!pageToken || allContacts.length >= args.maxResults) break;
  }

  printJson({
    results: allContacts.slice(0, args.maxResults),
    total: allContacts.slice(0, args.maxResults).length,
    source: 'other_contacts (auto-created from email interactions)',
  });
}

function usage() {
  const lines = [
    'Gmail Skill (Node.js) - Read/search/send Gmail and Google contacts',
    '',
    'Usage:',
    '  node "$SKILL_DIR/scripts/gmailcli.js" <command> [options]',
    '',
    'Commands:',
    '  accounts',
    '  logout [--account EMAIL_OR_ALIAS]',
    '  label <email> [--label NAME] [--description TEXT] [--default]',
    '  search <query> [--max-results N] [--account EMAIL_OR_ALIAS]',
    '  read <email_id> [--format full|minimal] [--account EMAIL_OR_ALIAS]',
    '  list [--max-results N] [--label LABEL] [--account EMAIL_OR_ALIAS]',
    '  send --to EMAIL --subject TEXT --body TEXT [--cc EMAILS] [--bcc EMAILS] [--account EMAIL_OR_ALIAS] [--yes]',
    '  draft --to EMAIL --subject TEXT --body TEXT [--thread-id ID] [--reply-to-id ID] [--cc EMAILS] [--bcc EMAILS] [--account EMAIL_OR_ALIAS]',
    '  mark-read <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  mark-unread <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  mark-done <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  unarchive <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  star <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  unstar <id[,id2,...]> [--account EMAIL_OR_ALIAS]',
    '  labels [--account EMAIL_OR_ALIAS]',
    '  contacts [--max-results N] [--account EMAIL_OR_ALIAS]',
    '  other-contacts [--max-results N] [--account EMAIL_OR_ALIAS]',
    '  search-contacts <query> [--account EMAIL_OR_ALIAS]',
    '  contact <resource_name> [--account EMAIL_OR_ALIAS]',
    '',
    'Root .env variables:',
    '  GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET',
    `  ${TOKENS_ENV_B64} (managed automatically)`,
    `  ${META_ENV_B64} (managed automatically)`,
  ];
  console.log(lines.join('\n'));
}

function parseCli(argv) {
  const args = argv.slice(2);
  const command = args.shift();
  if (!command || command === '--help' || command === '-h') {
    return { command: 'help' };
  }

  const opts = { _: [] };
  while (args.length) {
    const token = args.shift();
    if (token === '--') {
      opts._.push(...args);
      break;
    }
    if (!token.startsWith('-')) {
      opts._.push(token);
      continue;
    }

    if (token.startsWith('--')) {
      const [rawKey, inlineValue] = token.slice(2).split('=', 2);
      const key = camelKey(rawKey);
      if (inlineValue !== undefined) {
        opts[key] = inlineValue;
      } else if (args[0] && !args[0].startsWith('-')) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
      continue;
    }

    const short = token.slice(1);
    if (short.length > 1) {
      for (const ch of short) opts[shortAliasKey(ch)] = true;
      continue;
    }
    const key = shortAliasKey(short);
    if (args[0] && !args[0].startsWith('-')) {
      opts[key] = args.shift();
    } else {
      opts[key] = true;
    }
  }

  return { command, opts };
}

function camelKey(value) {
  return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function shortAliasKey(ch) {
  switch (ch) {
    case 'a':
      return 'account';
    case 'l':
      return 'label';
    case 'd':
      return 'description';
    case 't':
      return 'to';
    case 's':
      return 'subject';
    case 'b':
      return 'body';
    case 'r':
      return 'replyToId';
    default:
      return ch;
  }
}

function requirePositional(opts, index, name) {
  const value = opts._[index];
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function intOpt(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid integer: ${value}`);
  return n;
}

async function main() {
  try {
    const { command, opts } = parseCli(process.argv);

    switch (command) {
      case 'help':
        usage();
        return;
      case 'accounts':
        return cmdAccounts();
      case 'logout':
        return cmdLogout({ account: opts.account });
      case 'label':
        return cmdLabel({
          email: requirePositional(opts, 0, 'email'),
          label: opts.label,
          description: opts.description,
          default: Boolean(opts.default),
        });
      case 'search':
        return cmdSearch({
          query: requirePositional(opts, 0, 'query'),
          maxResults: intOpt(opts.maxResults, 10),
          account: opts.account,
        });
      case 'read':
        return cmdRead({
          emailId: requirePositional(opts, 0, 'email_id'),
          format: opts.format === 'minimal' ? 'minimal' : 'full',
          account: opts.account,
        });
      case 'list':
        return cmdList({
          maxResults: intOpt(opts.maxResults, 10),
          label: opts.label || null,
          account: opts.account,
        });
      case 'send':
        return cmdSend({
          to: opts.to || requirePositional(opts, 0, '--to'),
          subject: opts.subject || requirePositional(opts, 1, '--subject'),
          body: opts.body || requirePositional(opts, 2, '--body'),
          cc: opts.cc,
          bcc: opts.bcc,
          account: opts.account,
          yes: Boolean(opts.yes),
        });
      case 'draft':
        return cmdDraft({
          to: opts.to || requirePositional(opts, 0, '--to'),
          subject: opts.subject || requirePositional(opts, 1, '--subject'),
          body: opts.body || requirePositional(opts, 2, '--body'),
          cc: opts.cc,
          bcc: opts.bcc,
          account: opts.account,
          threadId: opts.threadId,
          replyToId: opts.replyToId,
        });
      case 'mark-read':
        return cmdMarkRead({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'mark-unread':
        return cmdMarkUnread({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'mark-done':
        return cmdMarkDone({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'unarchive':
        return cmdUnarchive({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'star':
        return cmdStar({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'unstar':
        return cmdUnstar({
          emailIds: requirePositional(opts, 0, 'email_ids'),
          account: opts.account,
        });
      case 'labels':
        return cmdLabels({ account: opts.account });
      case 'contacts':
        return cmdContacts({
          maxResults: intOpt(opts.maxResults, 100),
          account: opts.account,
        });
      case 'other-contacts':
        return cmdOtherContacts({
          maxResults: intOpt(opts.maxResults, 500),
          account: opts.account,
        });
      case 'search-contacts':
        return cmdSearchContacts({
          query: requirePositional(opts, 0, 'query'),
          account: opts.account,
        });
      case 'contact':
        return cmdContact({
          resourceName: requirePositional(opts, 0, 'resource_name'),
          account: opts.account,
        });
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    if (err?.payload) {
      printJson({ error: err.message, details: err.payload });
    } else {
      console.error(err.message || String(err));
    }
    process.exitCode = 1;
  }
}

main();
