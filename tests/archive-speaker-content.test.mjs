import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path, { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const BIOS = join(CONTENT, 'bios');
const ARCHIVE_2025 = join(CONTENT, '2025');
const PRESENTATION_SLUG_MAX_LENGTH = 50;

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relativePath(filePath) {
  return relative(ROOT, filePath).split(path.sep).join('/');
}

function assertString(value, label, filePath) {
  assert.equal(typeof value, 'string', `${relativePath(filePath)} ${label} must be a string`);
}

function assertNonEmptyString(value, label, filePath) {
  assertString(value, label, filePath);
  assert.notEqual(value.trim(), '', `${relativePath(filePath)} ${label} must not be empty`);
}

function assertSource(value, filePath) {
  assert.ok(value && typeof value === 'object', `${relativePath(filePath)} source is required`);
  assert.equal(
    value.proceedings,
    'pnsqc2025.pdf',
    `${relativePath(filePath)} source.proceedings must be pnsqc2025.pdf`,
  );
  assert.equal(typeof value.page, 'number', `${relativePath(filePath)} source.page must be a number`);
}

test('archive source content uses only about.json files', () => {
  const unexpectedFiles = listFiles(CONTENT)
    .filter((filePath) => path.basename(filePath) !== 'about.json')
    .map(relativePath);

  assert.deepEqual(unexpectedFiles, []);
});

test('legacy content/speakers folder is removed', () => {
  assert.equal(existsSync(join(CONTENT, 'speakers')), false);
});

test('author bios use the description schema and presentation references', () => {
  const bioSlugs = listDirs(BIOS);
  const presentationSlugs = new Set(listDirs(ARCHIVE_2025));
  assert.equal(bioSlugs.length, 64);

  for (const slug of bioSlugs) {
    const filePath = join(BIOS, slug, 'about.json');
    const profile = readJson(filePath);

    assertNonEmptyString(profile.name, 'name', filePath);
    assertString(profile.profession, 'profession', filePath);
    assertNonEmptyString(profile.avatar, 'avatar', filePath);
    assert.ok(
      profile.avatar.startsWith('/'),
      `${relativePath(filePath)} avatar must be an absolute site path`,
    );
    assertString(profile.linkedin, 'linkedin', filePath);
    assertString(profile.homepage, 'homepage', filePath);
    assertString(profile.email, 'email', filePath);
    assertString(profile.organization, 'organization', filePath);
    assertString(profile.description, 'description', filePath);
    assert.equal(Object.hasOwn(profile, 'bio'), false, `${relativePath(filePath)} must not use bio`);
    assertSource(profile.source, filePath);
    assert.equal(
      Array.isArray(profile.presentations),
      true,
      `${relativePath(filePath)} presentations must be an array`,
    );
    assert.ok(
      profile.presentations.length > 0,
      `${relativePath(filePath)} must include at least one presentation reference`,
    );

    profile.presentations.forEach((presentation, index) => {
      assert.ok(
        presentation && typeof presentation === 'object',
        `${relativePath(filePath)} presentations[${index}] must be an object`,
      );
      assertNonEmptyString(presentation.slug, `presentations[${index}].slug`, filePath);
      assert.equal(
        presentation.year,
        '2025',
        `${relativePath(filePath)} presentations[${index}].year must be 2025`,
      );
      assert.ok(
        presentationSlugs.has(presentation.slug),
        `${relativePath(filePath)} references missing presentation ${presentation.slug}`,
      );

      const presentationPath = join(ARCHIVE_2025, presentation.slug, 'about.json');
      const presentationData = readJson(presentationPath);
      assert.ok(
        Array.isArray(presentationData.authors) && presentationData.authors.includes(slug),
        `${relativePath(presentationPath)} must reference ${slug}`,
      );
    });

    const assetPath = join(ROOT, 'src', profile.avatar.slice(1).replace(/\//g, path.sep));
    assert.ok(existsSync(assetPath), `${relativePath(filePath)} references a missing avatar`);
  }
});

test('2025 presentations are title folders that reference author bios', () => {
  const bioSlugs = new Set(listDirs(BIOS));
  const presentationSlugs = listDirs(ARCHIVE_2025);
  assert.equal(presentationSlugs.length, 41);

  for (const slug of presentationSlugs) {
    assert.ok(
      slug.length <= PRESENTATION_SLUG_MAX_LENGTH,
      `${slug} must be ${PRESENTATION_SLUG_MAX_LENGTH} characters or fewer`,
    );

    const filePath = join(ARCHIVE_2025, slug, 'about.json');
    const presentation = readJson(filePath);
    assertNonEmptyString(presentation.title, 'title', filePath);
    assertNonEmptyString(presentation.description, 'description', filePath);
    assertNonEmptyString(presentation.label, 'label', filePath);
    assert.equal(
      Array.isArray(presentation.authors),
      true,
      `${relativePath(filePath)} authors must be an array`,
    );
    assert.ok(
      presentation.authors.length > 0,
      `${relativePath(filePath)} must include at least one author`,
    );
    assertSource(presentation.source, filePath);

    presentation.authors.forEach((authorSlug, index) => {
      assertNonEmptyString(authorSlug, `authors[${index}]`, filePath);
      assert.ok(
        bioSlugs.has(authorSlug),
        `${relativePath(filePath)} references missing author bio ${authorSlug}`,
      );
    });
  }
});
