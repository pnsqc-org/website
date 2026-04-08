import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';

import { parseLumaMap } from '../functions/_lib/luma-map.mjs';
import { buildMeetupJwt, fetchMeetupRecentEvents } from '../functions/_lib/meetup-api.mjs';
import {
  formatEventDateLine,
  normalizeMeetupEvent,
  renderEmptyStateCard,
  renderErrorStateCard,
  renderRecentEventCard,
  renderRecentEventsMarkup,
  sanitizeDescriptionHtml,
  selectRecentEvents,
} from '../functions/_lib/recent-events.mjs';

function createEvent(id, dateTime, map = {}) {
  return {
    dateTime,
    description: `<p>Event ${id}</p>`,
    endTime: map.endTime ?? dateTime,
    eventType: 'PHYSICAL',
    eventUrl: `https://www.meetup.com/pnw-software-quality-professionals-pnsqc/events/${id}/`,
    howToFindUs: '',
    id: String(id),
    isOnline: false,
    shortDescription: '',
    title: `Event ${id}`,
    venues: [],
    ...map,
  };
}

function decodeBase64Url(value) {
  const normalized = String(value ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

test('selectRecentEvents puts upcoming events first and fills remaining slots with recent past events', () => {
  const selected = selectRecentEvents({
    pastEvents: [
      createEvent('past-1', '2026-04-01T18:00:00-07:00'),
      createEvent('past-2', '2026-03-01T18:00:00-08:00'),
      createEvent('past-3', '2026-02-01T18:00:00-08:00'),
    ],
    upcomingEvents: [
      createEvent('upcoming-2', '2026-05-20T18:00:00-07:00'),
      createEvent('upcoming-1', '2026-04-20T18:00:00-07:00'),
    ],
  });

  assert.deepEqual(
    selected.map((event) => event.id),
    ['upcoming-1', 'upcoming-2', 'past-1', 'past-2', 'past-3'],
  );
});

test('selectRecentEvents falls back to only past events when there are no upcoming events', () => {
  const selected = selectRecentEvents({
    pastEvents: [
      createEvent('past-2', '2026-03-01T18:00:00-08:00'),
      createEvent('past-1', '2026-04-01T18:00:00-07:00'),
      createEvent('past-3', '2026-02-01T18:00:00-08:00'),
    ],
    upcomingEvents: [],
  });

  assert.deepEqual(
    selected.map((event) => event.id),
    ['past-1', 'past-2', 'past-3'],
  );
});

test('selectRecentEvents keeps exactly five upcoming events when five are available', () => {
  const selected = selectRecentEvents({
    upcomingEvents: [
      createEvent('1', '2026-04-10T18:00:00-07:00'),
      createEvent('2', '2026-04-11T18:00:00-07:00'),
      createEvent('3', '2026-04-12T18:00:00-07:00'),
      createEvent('4', '2026-04-13T18:00:00-07:00'),
      createEvent('5', '2026-04-14T18:00:00-07:00'),
    ],
    pastEvents: [createEvent('past', '2026-03-01T18:00:00-08:00')],
  });

  assert.equal(selected.length, 5);
  assert.deepEqual(
    selected.map((event) => event.id),
    ['1', '2', '3', '4', '5'],
  );
});

test('selectRecentEvents caps the result at the five soonest upcoming events', () => {
  const selected = selectRecentEvents({
    upcomingEvents: [
      createEvent('6', '2026-04-16T18:00:00-07:00'),
      createEvent('3', '2026-04-13T18:00:00-07:00'),
      createEvent('1', '2026-04-11T18:00:00-07:00'),
      createEvent('4', '2026-04-14T18:00:00-07:00'),
      createEvent('2', '2026-04-12T18:00:00-07:00'),
      createEvent('5', '2026-04-15T18:00:00-07:00'),
    ],
    pastEvents: [createEvent('past', '2026-03-01T18:00:00-08:00')],
  });

  assert.deepEqual(
    selected.map((event) => event.id),
    ['1', '2', '3', '4', '5'],
  );
});

test('normalizeMeetupEvent formats hybrid venue lines and carries the optional Luma map', () => {
  const normalized = normalizeMeetupEvent(
    createEvent('313839680', '2026-04-22T18:00:00-07:00', {
      description: '<p>Hybrid description</p>',
      endTime: '2026-04-22T20:00:00-07:00',
      eventType: 'HYBRID',
      howToFindUs: 'https://zoom.us/j/123',
      title: 'AI-Augmented Manual Testing with PLUS QA',
      venues: [
        {
          address: '1725 SE Ash St',
          city: 'Portland',
          name: 'PLUS QA',
          state: 'OR',
          venueType: '',
        },
        {
          name: 'Online event',
          venueType: 'online',
        },
      ],
    }),
    { lumaUrl: 'https://luma.com/7443v31u' },
  );

  assert.equal(normalized.lumaUrl, 'https://luma.com/7443v31u');
  assert.equal(
    normalized.venueLine,
    'Hybrid event &middot; PLUS QA, 1725 SE Ash St &middot; Portland, OR + online',
  );
});

test('normalizeMeetupEvent formats virtual venue lines without a Luma map', () => {
  const normalized = normalizeMeetupEvent(
    createEvent('313809611', '2026-04-02T17:30:00-07:00', {
      description: '<p>Virtual description</p>',
      endTime: '2026-04-02T19:30:00-07:00',
      eventType: 'ONLINE',
      howToFindUs: 'https://zoom.us/j/456',
      title: 'Fireside Chat with PNSQC Authors',
      venues: [
        {
          name: 'Online event',
          venueType: 'online',
        },
      ],
    }),
  );

  assert.equal(normalized.lumaUrl, null);
  assert.equal(normalized.venueLine, 'Virtual event &middot; Zoom');
});

test('normalizeMeetupEvent builds a Meetup event image URL when featuredEventPhoto is available', () => {
  const normalized = normalizeMeetupEvent(
    createEvent('image-event', '2026-04-22T18:00:00-07:00', {
      featuredEventPhoto: {
        baseUrl: 'https://secure-content.meetupstatic.com/images/classic-events/',
        id: '501175080',
      },
      title: 'Image-backed Meetup',
    }),
  );

  assert.equal(
    normalized.imageUrl,
    'https://secure-content.meetupstatic.com/images/classic-events/501175080/676x380.webp',
  );
  assert.equal(normalized.imageAlt, 'Meetup event photo for Image-backed Meetup');
});

test('normalizeMeetupEvent falls back from description to shortDescription and finally to a default message', () => {
  const withShortDescription = normalizeMeetupEvent(
    createEvent('short-fallback', '2026-04-02T17:30:00-07:00', {
      description: '   ',
      shortDescription: 'Short fallback copy',
    }),
  );

  const withNoDescription = normalizeMeetupEvent(
    createEvent('no-description', '2026-04-02T17:30:00-07:00', {
      description: '',
      shortDescription: '',
    }),
  );

  assert.match(withShortDescription.descriptionHtml, /Short fallback copy/);
  assert.match(withNoDescription.descriptionHtml, /No description available/);
});

test('normalizeMeetupEvent converts Meetup Markdown descriptions into sanitized HTML', () => {
  const normalized = normalizeMeetupEvent(
    createEvent('markdown-description', '2026-04-10T18:00:00-07:00', {
      description: `## Agenda

Bring **questions** and _examples_.

- Intro
- Live demo
- [Join us](https://example.com)

> Remote-friendly

\`npm test\`

<script>alert('x')</script>`,
    }),
  );

  assert.match(normalized.descriptionHtml, /<h2>Agenda<\/h2>/);
  assert.match(normalized.descriptionHtml, /<strong>questions<\/strong>/);
  assert.match(normalized.descriptionHtml, /<em>examples<\/em>/);
  assert.match(normalized.descriptionHtml, /<ul>/);
  assert.match(
    normalized.descriptionHtml,
    /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">Join us<\/a>/,
  );
  assert.match(normalized.descriptionHtml, /<blockquote>/);
  assert.match(normalized.descriptionHtml, /<code>npm test<\/code>/);
  assert.equal(normalized.descriptionHtml.includes('<script>'), false);
});

test('sanitizeDescriptionHtml strips disallowed tags and unsafe attributes while preserving allowed markup', () => {
  const sanitized = sanitizeDescriptionHtml(`
    <p onclick="alert('x')">Hello <strong>world</strong></p>
    <script>alert('bad')</script>
    <a href="https://example.com" onclick="evil()">Read more</a>
    <img src="x" onerror="evil()">
    <a href="javascript:alert('x')">Bad link</a>
  `);

  assert.equal(sanitized.includes('<script>'), false);
  assert.equal(sanitized.includes('<img'), false);
  assert.equal(sanitized.includes('onclick='), false);
  assert.match(sanitized, /<p>Hello <strong>world<\/strong><\/p>/);
  assert.match(
    sanitized,
    /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">Read more<\/a>/,
  );
  assert.equal(sanitized.includes('javascript:'), false);
});

test('renderRecentEventCard includes description preview and full-description trigger hooks', () => {
  const markup = renderRecentEventCard(
    normalizeMeetupEvent(
      createEvent('preview-card', '2026-04-22T18:00:00-07:00', {
        description:
          'Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.\n\nParagraph five.',
      }),
    ),
  );

  assert.match(markup, /data-event-title/);
  assert.match(markup, /data-event-modal-meta/);
  assert.match(markup, /data-event-image-url=/);
  assert.match(markup, /data-event-image-alt=/);
  assert.match(markup, /data-event-upcoming-badge/);
  assert.match(markup, /data-event-past-badge/);
  assert.match(markup, /data-event-description-preview/);
  assert.match(markup, /data-event-description-preview-content/);
  assert.match(markup, /data-event-description-content/);
  assert.match(markup, /data-event-description-open/);
  assert.match(markup, /Show Details/);
  assert.match(markup, /aria-controls="recent-events-description-modal"/);
});

test('renderRecentEventsMarkup includes the Luma icon only when a map entry exists', () => {
  const withLuma = normalizeMeetupEvent(createEvent('with-luma', '2026-04-22T18:00:00-07:00'), {
    lumaUrl: 'https://luma.com/with-luma',
  });
  const withoutLuma = normalizeMeetupEvent(
    createEvent('without-luma', '2026-04-23T18:00:00-07:00'),
  );

  const markup = renderRecentEventsMarkup(
    [withLuma, withoutLuma],
    'pnw-software-quality-professionals-pnsqc',
  );

  assert.equal(markup.includes('https://luma.com/with-luma'), true);
  assert.equal(markup.includes('Luma Signup'), true);

  const secondCardMarkup = markup.slice(markup.indexOf('without-luma'));
  assert.equal(secondCardMarkup.includes('https://luma.com/with-luma'), false);
});

test('renderEmptyStateCard keeps the Meetup group link text tight', () => {
  const markup = renderEmptyStateCard('pnw-software-quality-professionals-pnsqc');

  assert.match(
    markup,
    /class="inline-text-link">Meetup group<\/a>[\r\n\s]*directly for the latest event details\./,
  );
});

test('renderErrorStateCard keeps the Meetup group link text tight', () => {
  const markup = renderErrorStateCard('pnw-software-quality-professionals-pnsqc');

  assert.match(
    markup,
    /class="inline-text-link">Meetup group<\/a>[\r\n\s]*directly for the latest event details\./,
  );
});

test('parseLumamap accepts both string and object forms', () => {
  const map = parseLumaMap(
    JSON.stringify({
      312975891: 'https://luma.com/9f10qhq7',
      313839680: { lumaUrl: 'https://luma.com/7443v31u' },
      'ignore-me': { notLumaUrl: true },
    }),
  );

  assert.deepEqual(map, {
    312975891: { lumaUrl: 'https://luma.com/9f10qhq7' },
    313839680: { lumaUrl: 'https://luma.com/7443v31u' },
  });
});

test('parseLumamap returns an empty object when no map is provided', () => {
  assert.deepEqual(parseLumaMap(''), {});
});

test('formatEventDateLine preserves the current Pacific time display style', () => {
  const dateLine = formatEventDateLine('2026-04-22T18:00:00-07:00', '2026-04-22T20:00:00-07:00');

  assert.equal(dateLine, 'Wednesday, Apr 22 &middot; 6:00 PM to 8:00 PM PDT');
});

test('buildMeetupJwt signs successfully with both PKCS#8 and PKCS#1 private key PEM formats', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });
  const publicKeyPem = publicKey.export({
    format: 'pem',
    type: 'spki',
  });
  const privateKeys = [
    privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }),
    privateKey.export({
      format: 'pem',
      type: 'pkcs1',
    }),
  ];

  for (const privateKeyPem of privateKeys) {
    const jwt = await buildMeetupJwt({
      clientId: 'client-id',
      memberId: '123456789',
      now: Date.UTC(2026, 3, 7, 18, 30, 0),
      privateKeyPem,
      signingKeyId: 'signing-key-id',
    });
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');

    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8'));
    const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));

    assert.equal(header.alg, 'RS256');
    assert.equal(header.kid, 'signing-key-id');
    assert.equal(payload.iss, 'client-id');
    assert.equal(payload.sub, '123456789');
    assert.equal(verifier.verify(publicKeyPem, decodeBase64Url(encodedSignature)), true);
  }
});

test('fetchMeetupRecentEvents uses the current Meetup events query shape', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
  });
  const privateKeyPem = privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  });
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''));
    requests.push({
      body: init.body,
      url,
    });

    if (url.includes('/oauth2/access')) {
      return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (url.includes('/gql-ext')) {
      return new Response(
        JSON.stringify({
          data: {
            groupByUrlname: {
              pastEvents: {
                edges: [{ node: createEvent('past-1', '2026-04-02T17:30:00-07:00') }],
              },
              upcomingEvents: {
                edges: [{ node: createEvent('upcoming-1', '2026-04-22T18:00:00-07:00') }],
              },
            },
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const payload = await fetchMeetupRecentEvents(
    {
      MEETUP_CLIENT_ID: 'client-id',
      MEETUP_GROUP_URLNAME: 'pnw-software-quality-professionals-pnsqc',
      MEETUP_MEMBER_ID: '123456789',
      MEETUP_SIGNING_KEY_ID: 'signing-key-id',
      MEETUP_SIGNING_KEY_PEM: privateKeyPem,
    },
    fetchImpl,
    3,
  );

  assert.equal(payload.groupUrlname, 'pnw-software-quality-professionals-pnsqc');
  assert.deepEqual(
    payload.upcomingEvents.map((event) => event.id),
    ['upcoming-1'],
  );
  assert.deepEqual(
    payload.pastEvents.map((event) => event.id),
    ['past-1'],
  );

  const graphqlRequest = JSON.parse(String(requests[1]?.body ?? '{}'));
  assert.match(graphqlRequest.query, /upcomingEvents:\s*events\(first:\s*\$limit/);
  assert.match(graphqlRequest.query, /pastEvents:\s*events\(first:\s*\$limit/);
  assert.match(graphqlRequest.query, /\beventType\b/);
  assert.match(graphqlRequest.query, /\bhowToFindUs\b/);
  assert.match(graphqlRequest.query, /\bfeaturedEventPhoto\b/);
  assert.doesNotMatch(graphqlRequest.query, /\bshortDescription\b/);
  assert.doesNotMatch(graphqlRequest.query, /\bisOnline\b/);
  assert.doesNotMatch(graphqlRequest.query, /\beventVenueOptions\b/);
});
