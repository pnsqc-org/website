import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildConferencePaperPresenterProfiles,
  fetchRemoteAuthorAvatars,
  resolveAuthorAvatar,
} from '../../build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeTempDir(label) {
  return mkdtempSync(join(tmpdir(), `pnsqc-${label}-`));
}

test('remote author avatar URLs resolve to generated people image paths', () => {
  const peopleDir = makeTempDir('people-images');
  const filePath = join(ROOT, 'content', 'bios', 'remote-speaker', 'about.json');
  const sourceUrl = 'https://example.com/people/avatar.PNG?version=1';

  try {
    const resolved = resolveAuthorAvatar(sourceUrl, filePath, 'remote-speaker', 'Remote Speaker', {
      peopleDir,
    });

    assert.deepEqual(resolved, {
      avatar: '/images/people/remote-speaker.png',
      avatarSourceUrl: sourceUrl,
    });
  } finally {
    rmSync(peopleDir, { recursive: true, force: true });
  }
});

test('remote author avatar URLs reuse existing people images by slug or name', () => {
  const peopleDir = makeTempDir('people-images');
  const filePath = join(ROOT, 'content', 'bios', 'remote-speaker', 'about.json');
  const sourceUrl = 'https://example.com/people/avatar.png';

  try {
    writeFileSync(join(peopleDir, 'remote-speaker.jpg'), Buffer.from([0xff, 0xd8]));

    const resolved = resolveAuthorAvatar(sourceUrl, filePath, 'missing-slug', 'Remote Speaker', {
      peopleDir,
    });

    assert.deepEqual(resolved, {
      avatar: '/images/people/remote-speaker.jpg',
      avatarSourceUrl: '',
    });
  } finally {
    rmSync(peopleDir, { recursive: true, force: true });
  }
});

test('remote author avatar fetch saves source people image and dist copy', async () => {
  const peopleDir = makeTempDir('people-images');
  const distDir = makeTempDir('avatar-dist');
  const body = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const profile = {
    slug: 'remote-speaker',
    avatar: '/images/people/remote-speaker.jpg',
    avatarSourceUrl: 'https://example.com/avatar',
  };
  let requestCount = 0;

  try {
    const stats = await fetchRemoteAuthorAvatars(new Map([['remote-speaker', profile]]), {
      peopleDir,
      distDir,
      fetchImpl: async (url) => {
        requestCount += 1;
        assert.equal(url, 'https://example.com/avatar');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => 'image/png' },
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
        };
      },
    });

    assert.deepEqual(stats, { fetched: 1, total: 1 });
    assert.equal(requestCount, 1);
    assert.equal(profile.avatar, '/images/people/remote-speaker.png');
    assert.deepEqual(readFileSync(join(peopleDir, 'remote-speaker.png')), body);
    assert.deepEqual(readFileSync(join(distDir, 'images', 'people', 'remote-speaker.png')), body);
  } finally {
    rmSync(peopleDir, { recursive: true, force: true });
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('existing people images leave remote avatar fetch with no network work', async () => {
  const peopleDir = makeTempDir('people-images');
  const distDir = makeTempDir('avatar-dist');
  const filePath = join(ROOT, 'content', 'bios', 'cached-speaker', 'about.json');

  try {
    writeFileSync(join(peopleDir, 'cached-speaker.jpg'), Buffer.from([0xff, 0xd8]));
    const resolved = resolveAuthorAvatar(
      'https://example.com/new-avatar.png',
      filePath,
      'cached-speaker',
      'Cached Speaker',
      { peopleDir },
    );
    const profile = { slug: 'cached-speaker', ...resolved };

    const stats = await fetchRemoteAuthorAvatars(new Map([['cached-speaker', profile]]), {
      peopleDir,
      distDir,
      fetchImpl: async () => {
        throw new Error('fetch should not be called when a people image exists');
      },
    });

    assert.deepEqual(resolved, {
      avatar: '/images/people/cached-speaker.jpg',
      avatarSourceUrl: '',
    });
    assert.deepEqual(stats, { fetched: 0, total: 0 });
    assert.equal(existsSync(join(distDir, 'images', 'people', 'cached-speaker.jpg')), false);
  } finally {
    rmSync(peopleDir, { recursive: true, force: true });
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('conference paper presenter profiles include only public routed supplement fields', () => {
  const profiles = buildConferencePaperPresenterProfiles(
    new Map([
      [
        'empty-speaker',
        {
          slug: 'empty-speaker',
          name: 'Empty Speaker',
          email: 'private@example.com',
          bio: 'Private-ish draft bio.',
        },
      ],
      [
        'linked-speaker',
        {
          id: 'linked-speaker',
          name: 'Linked Speaker',
          profession: 'Quality Lead',
          organization: 'Linked Co',
          avatar: '',
          linkedin: 'https://linkedin.example/linked',
          homepage: '',
          email: 'linked@example.com',
          avatarSourceUrl: 'https://source.example/avatar.jpg',
        },
      ],
      [
        'affiliation-speaker',
        {
          slug: 'affiliation-speaker',
          name: 'Affiliation Speaker',
          profession: '',
          organization: 'Org Only',
        },
      ],
      [
        'avatar-speaker',
        {
          slug: 'avatar-speaker',
          name: 'Avatar Speaker',
          avatar: '/images/people/avatar-speaker.jpg',
          linkedin: '',
          homepage: 'https://avatar.example',
          bioHtml: '<p>Not published here.</p>',
        },
      ],
    ]),
  );

  assert.deepEqual(profiles, [
    {
      slug: 'affiliation-speaker',
      name: 'Affiliation Speaker',
      profession: '',
      organization: 'Org Only',
      avatar: '',
      linkedin: '',
      homepage: '',
    },
    {
      slug: 'avatar-speaker',
      name: 'Avatar Speaker',
      profession: '',
      organization: '',
      avatar: '/images/people/avatar-speaker.jpg',
      linkedin: '',
      homepage: 'https://avatar.example',
    },
    {
      slug: 'linked-speaker',
      name: 'Linked Speaker',
      profession: 'Quality Lead',
      organization: 'Linked Co',
      avatar: '',
      linkedin: 'https://linkedin.example/linked',
      homepage: '',
    },
  ]);
});
