import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadArchiveProgramDataForYear, loadSharedAuthorBios } from '../../build.mjs';

const require = createRequire(import.meta.url);
const { assignGeneratedSlugs, slugify } = require('../../src/js/program-slugs.js');
const programData = require('../../src/js/program-data.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = join(ROOT, 'content');

test('slugify creates readable speaker and presentation slugs', () => {
  assert.equal(slugify('Kristine O\u2019Connor'), 'kristine-oconnor');
  assert.equal(
    slugify('The AI Assurance Imperative: Quality Engineering for the Agentic Era'),
    'the-ai-assurance-imperative-quality-engineering-for-the-agentic-era',
  );
});

test('generated slugs append ids only for collisions', () => {
  const records = assignGeneratedSlugs(
    [
      { id: 101, title: 'Same Talk' },
      { id: 202, title: 'Same Talk' },
      { id: 303, title: 'Different Talk' },
    ],
    {
      getText: (item) => item.title,
      getId: (item) => item.id,
      fallback: 'presentation',
    },
  );

  assert.deepEqual(
    records.map((record) => record.slug),
    ['same-talk-101', 'same-talk-202', 'different-talk'],
  );
});

test('archive program data is generated for every content year', () => {
  const sharedProfiles = loadSharedAuthorBios();
  const years = readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'bios' && entry.name !== 'speakers')
    .map((entry) => entry.name);

  assert.ok(years.length > 0);

  years.forEach((year) => {
    const data = loadArchiveProgramDataForYear(year, sharedProfiles);
    assert.ok(data.speakers.length > 0, `${year} should generate speakers`);
    assert.ok(data.presentations.length > 0, `${year} should generate presentations`);
  });
});

test('archive program data exposes minimal public detail fields', () => {
  const sharedProfiles = loadSharedAuthorBios();
  const data = loadArchiveProgramDataForYear('2025', sharedProfiles);
  const speaker = data.speakers.find((item) => item.slug === 'kristine-oconnor');
  const presentation = data.presentations.find(
    (item) => item.slug === 'a-deep-dive-into-exploratory-testing',
  );

  assert.ok(speaker);
  assert.deepEqual(Object.keys(speaker).sort(), [
    'avatar',
    'bio',
    'bioHtml',
    'homepage',
    'id',
    'linkedin',
    'name',
    'organization',
    'presentationRefs',
    'presentations',
    'profession',
    'slug',
  ]);
  assert.equal(Object.hasOwn(speaker, 'description'), false);
  assert.ok(speaker.presentations.every((item) => item.slug && item.descriptionHtml));

  assert.ok(presentation);
  assert.deepEqual(Object.keys(presentation).sort(), [
    'abstract',
    'abstractHtml',
    'categorySlug',
    'descriptionHtml',
    'id',
    'presentationType',
    'slug',
    'source',
    'speakerSlugs',
    'speakers',
    'title',
  ]);
  assert.ok(presentation.descriptionHtml);
  assert.equal(presentation.presentationType, 'paper');
  assert.equal(presentation.categorySlug, 'paper-presenters');
  assert.equal(presentation.speakers.length, 1);
  assert.equal(presentation.speakers[0].slug, 'anna-sharpe');
});

test('shared program helpers sort people by last name and serialize plain output', () => {
  const sorted = programData.sortPeopleByLastName([
    { name: 'Kevin Pyles' },
    { name: 'Philip Lew' },
    { name: 'Tariq King' },
  ]);

  assert.deepEqual(
    sorted.map((person) => person.name),
    ['Tariq King', 'Philip Lew', 'Kevin Pyles'],
  );

  const normalized = programData.normalizeArchiveProgram(
    {
      year: '2099',
      categories: [{ id: null, slug: 'paper-presenters', name: 'Paper Presenters' }],
      speakers: [{ slug: 'alpha-person', name: 'Alpha Person', presentationRefs: [] }],
      presentations: [
        {
          slug: 'quality-talk',
          title: 'Quality Talk',
          abstract: 'Abstract',
          presentationType: 'paper',
          categorySlug: 'paper-presenters',
          speakerSlugs: ['alpha-person'],
          source: {},
        },
      ],
    },
    { year: '2099' },
  );
  const serialized = programData.serializeProgram(normalized);

  assert.equal(Object.hasOwn(serialized, 'speakerBySlug'), false);
  assert.equal(Object.hasOwn(serialized, 'presentationBySlug'), false);
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.deepEqual(serialized.presentations[0].speakerSlugs, ['alpha-person']);
});

test('program fallback avatars use year-specific conference logos', () => {
  assert.equal(
    programData.getProgramFallbackAvatar({ source: 'conference', year: '2026' }),
    '/images/brand/pnsqc-logo-2026.jpg',
  );
  assert.equal(
    programData.getProgramFallbackAvatar({
      source: 'conference',
      year: '2026',
      fallbackAvatar: '/images/brand/pnsqc-logo.jpg',
    }),
    '/images/brand/pnsqc-logo-2026.jpg',
  );
  assert.equal(
    programData.getProgramFallbackAvatar({ source: 'archive', year: '2025' }),
    '/images/brand/pnsqc-logo-2025.jpg',
  );
});

test('archive normalization falls back to the archive year logo for missing avatars', () => {
  const normalized = programData.normalizeArchiveProgram(
    {
      year: '2025',
      speakers: [{ slug: 'archive-speaker', name: 'Archive Speaker', presentationRefs: [] }],
      presentations: [],
    },
    { year: '2025' },
  );

  assert.equal(normalized.speakers[0].avatar, '/images/brand/pnsqc-logo-2025.jpg');
});

test('archive normalization preserves explicit speaker avatar overrides', () => {
  const normalized = programData.normalizeArchiveProgram(
    {
      year: '2025',
      speakers: [
        {
          slug: 'archive-speaker',
          name: 'Archive Speaker',
          avatar: '/images/speakers/archive-speaker.jpg',
          presentationRefs: [],
        },
      ],
      presentations: [],
    },
    { year: '2025' },
  );

  assert.equal(normalized.speakers[0].avatar, '/images/speakers/archive-speaker.jpg');
});

test('Meetinghand normalization creates shared speakers and presentations', () => {
  const normalized = programData.normalizeMeetingHandProgram(
    {
      data: {
        speaker_categories: [
          { id: 111, name: 'Keynote Speakers', order: 0 },
          { id: 104, name: 'Invited Speakers / Special Guests', order: 1 },
        ],
        speakers: [
          {
            id: 5259,
            firstname: 'Jonathon',
            lastname: 'Wright',
            avatar: 'https://example.com/jonathon.png',
            event_speaker_category_id: 111,
            order: 0,
            profession: 'Chief AI Officer',
            publish: true,
            0: {
              homepage: 'https://jonathon.example',
              linkedin: 'https://linkedin.example/jonathon',
              short_bio: 'Jonathon bio.',
              presentations: [
                {
                  id: 5342,
                  title: 'The AI Assurance Imperative',
                  session: {
                    order: 1,
                    session: {
                      id: 13531,
                      day: { date: '2026-10-12T00:00:00.000000Z' },
                      start: '08:00',
                      end: '09:00',
                      title: 'Opening Keynote',
                      description:
                        '<p>The AI Assurance Imperative:</p><blockquote><p>Keynote abstract.</p></blockquote>',
                      location: 'Ballroom',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { year: '2026' },
  );

  assert.equal(normalized.speakers.length, 1);
  assert.equal(normalized.presentations.length, 1);
  assert.equal(normalized.speakers[0].slug, 'jonathon-wright');
  assert.equal(normalized.speakers[0].avatar, 'https://example.com/jonathon.png');
  assert.equal(normalized.presentations[0].slug, 'the-ai-assurance-imperative');
  assert.equal(normalized.presentations[0].presentationType, 'keynote');
  assert.equal(normalized.presentations[0].speakers[0].slug, 'jonathon-wright');
  assert.equal(normalized.speakers[0].presentations[0].title, 'The AI Assurance Imperative');
  assert.match(normalized.presentations[0].descriptionHtml, /Keynote abstract/);
});

test('Meetinghand normalization supports top-level speaker details and presentations', () => {
  const normalized = programData.normalizeMeetingHandProgram(
    {
      data: {
        speaker_categories: [
          { id: 111, name: 'Keynote Speakers', order: 0 },
          { id: 104, name: 'Invited Speakers / Special Guests', order: 1 },
        ],
        speakers: [
          {
            id: 5259,
            firstname: 'Jonathon',
            lastname: 'Wright',
            avatar: 'https://example.com/jonathon.png',
            event_speaker_category_id: 111,
            order: 0,
            profession: 'Chief AI Officer',
            publish: true,
            homepage: 'https://jonathon.example',
            linkedin: 'https://linkedin.example/jonathon',
            short_bio: 'Jonathon top-level bio.',
            presentations: [
              {
                id: 5342,
                title: 'The AI Assurance Imperative',
                session: {
                  order: 1,
                  session: {
                    id: 13531,
                    day: { date: '2026-10-12T00:00:00.000000Z' },
                    start: '08:00',
                    end: '09:00',
                    title: 'Opening Keynote',
                    description:
                      '<p>The AI Assurance Imperative:</p><blockquote><p>Keynote abstract.</p></blockquote>',
                    location: 'Ballroom',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    { year: '2026' },
  );
  const keynotes = programData.getProgramCategoryConfig('keynotes-invited-speakers', '2026');

  assert.equal(normalized.speakers[0].bio, 'Jonathon top-level bio.');
  assert.equal(normalized.speakers[0].homepage, 'https://jonathon.example');
  assert.equal(normalized.presentations.length, 1);
  assert.equal(normalized.presentations[0].presentationType, 'keynote');
  assert.deepEqual(
    programData.selectPresentations(normalized, keynotes).map((item) => item.slug),
    ['the-ai-assurance-imperative'],
  );
});

test('Meetinghand normalization falls back to the 2026 conference logo for missing avatars', () => {
  const normalized = programData.normalizeMeetingHandProgram(
    {
      data: {
        speaker_categories: [{ id: 111, name: 'Keynote Speakers', order: 0 }],
        speakers: [
          {
            id: 101,
            firstname: 'Missing',
            lastname: 'Avatar',
            avatar: '',
            event_speaker_category_id: 111,
            publish: true,
          },
        ],
      },
    },
    { year: '2026' },
  );

  assert.equal(normalized.speakers[0].avatar, '/images/brand/pnsqc-logo-2026.jpg');
});

test('Meetinghand normalization includes schedule-only paper presenters', () => {
  const normalized = programData.normalizeMeetingHandProgram(
    {
      data: {
        speaker_categories: [],
        speakers: [],
        schedule: [
          {
            date: '2026-10-12T00:00:00.000000Z',
            sessions: [
              {
                title: 'Emerging Technologies & AI Systems',
                start: '09:10',
                end: '10:30',
                location: 'Coos Bay',
                items: [
                  {
                    id: 29535,
                    type: 'submission',
                    participant_submission_id: 29535,
                    order: 1,
                    presentation: {
                      id: 29535,
                      title: 'Agentic DataCards to Data Quality Gates',
                      presentation_type: 'Paper',
                      authors: [
                        {
                          firstname: 'Jeyasekar',
                          lastname: 'Marimuthu',
                          avatar: 'https://example.com/jeyasekar.jpg',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { year: '2026' },
  );

  const paper = normalized.presentations.find(
    (presentation) => presentation.title === 'Agentic DataCards to Data Quality Gates',
  );
  const paperPresenters = programData.getProgramCategoryConfig('paper-presenters', '2026');
  const selectedSpeakers = programData.selectSpeakers(normalized, paperPresenters);

  assert.ok(paper);
  assert.equal(paper.presentationType, 'paper');
  assert.equal(paper.categorySlug, 'paper-presenters');
  assert.equal(paper.submissionId, '29535');
  assert.equal(programData.getPresentationSubmissionId(paper), '29535');
  assert.equal(paper.date, '2026-10-12');
  assert.equal(paper.start, '09:10');
  assert.deepEqual(
    paper.speakers.map((speaker) => speaker.name),
    ['Jeyasekar Marimuthu'],
  );
  assert.deepEqual(
    selectedSpeakers.map((speaker) => speaker.name),
    ['Jeyasekar Marimuthu'],
  );
});

test('Meetinghand normalization includes only schedule Panels as panel presentations', () => {
  const normalized = programData.normalizeMeetingHandProgram(
    {
      data: {
        speaker_categories: [],
        speakers: [],
        schedule: [
          {
            date: '2026-10-14T00:00:00.000000Z',
            sessions: [
              {
                title: 'Panels',
                start: '08:30',
                end: '12:00',
                description:
                  '<p>AI in the Testing Room: Real Results, Real Limits:</p>' +
                  '<blockquote><p>Real implementation experience.</p></blockquote>',
                items: [
                  {
                    id: 9605,
                    type: 'speaker_presentation',
                    event_speaker_presentation_id: 5539,
                    order: 1,
                    presentation: {
                      id: 5539,
                      title: 'AI in the Testing Room: Real Results, Real Limits',
                      speaker: {
                        firstname: 'Panel',
                        lastname: 'Moderator',
                        avatar: 'https://example.com/panel.jpg',
                        short_bio: 'Panel moderator bio.',
                      },
                    },
                  },
                ],
              },
              {
                title: 'Not Panels',
                start: '13:00',
                end: '14:00',
                items: [
                  {
                    id: 9606,
                    type: 'speaker_presentation',
                    event_speaker_presentation_id: 5540,
                    presentation: {
                      id: 5540,
                      title: 'Do Not Include',
                      speaker: {
                        firstname: 'Other',
                        lastname: 'Speaker',
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { year: '2026' },
  );

  const panel = normalized.presentations.find(
    (presentation) => presentation.title === 'AI in the Testing Room: Real Results, Real Limits',
  );
  const keynotes = programData.getProgramCategoryConfig('keynotes-invited-speakers', '2026');
  const selectedPanels = programData
    .selectPresentations(normalized, keynotes)
    .filter((presentation) => presentation.categorySlug === 'panels');

  assert.ok(panel);
  assert.equal(panel.presentationType, 'panel');
  assert.equal(panel.categorySlug, 'panels');
  assert.equal(panel.scheduleSessionTitle, 'Panels');
  assert.equal(panel.source.eventSpeakerPresentationId, '5539');
  assert.equal(programData.getPresentationSubmissionId(panel), '');
  assert.match(panel.abstractHtml, /Real implementation experience/);
  assert.deepEqual(
    panel.speakers.map((speaker) => speaker.name),
    ['Panel Moderator'],
  );
  assert.match(panel.speakers[0].bioHtml, /Panel moderator bio/);
  assert.deepEqual(
    selectedPanels.map((presentation) => presentation.title),
    ['AI in the Testing Room: Real Results, Real Limits'],
  );
  assert.equal(programData.getSectionForItem(panel, keynotes).key, 'panels');
});

test('submission detail helpers merge lazy Meetinghand fields into program items', () => {
  const presentation = {
    id: '29535',
    slug: 'agentic-datacards',
    title: 'Agentic DataCards',
    presentationType: 'paper',
    speakers: [{ slug: 'jeyasekar-marimuthu', name: 'Jeyasekar Marimuthu', bio: '', bioHtml: '' }],
  };
  const detail = {
    abstract: 'Full abstract.',
    abstractHtml: '<p>Full abstract.</p>',
    objectives: 'Learn things.',
    objectivesHtml: '<ul><li>Learn things.</li></ul>',
    bio: 'Speaker bio.',
    bioHtml: '<p>Speaker bio.</p>',
  };

  const mergedPresentation = programData.mergeMeetingHandSubmissionDetail(presentation, detail);
  assert.equal(mergedPresentation.abstract, 'Full abstract.');
  assert.equal(mergedPresentation.descriptionHtml, '<p>Full abstract.</p>');
  assert.equal(mergedPresentation.objectivesHtml, '<ul><li>Learn things.</li></ul>');
  assert.equal(mergedPresentation.speakers[0].bioHtml, '<p>Speaker bio.</p>');

  const mergedSpeaker = programData.mergeMeetingHandSubmissionDetailIntoSpeaker(
    {
      slug: 'jeyasekar-marimuthu',
      name: 'Jeyasekar Marimuthu',
      bio: '',
      bioHtml: '',
      presentations: [presentation],
    },
    presentation,
    detail,
  );

  assert.equal(mergedSpeaker.bioHtml, '<p>Speaker bio.</p>');
  assert.equal(mergedSpeaker.presentations[0].descriptionHtml, '<p>Full abstract.</p>');
});

test('category filters select workshops, keynotes, panels, and paper presenters', () => {
  const program = programData.createProgramIndexes({
    source: 'conference',
    year: '2026',
    categories: [],
    speakers: [
      {
        slug: 'speaker-one',
        name: 'Speaker One',
        presentations: [
          {
            slug: 'paper-talk',
            title: 'Paper Talk',
            presentationType: 'paper',
            categoryId: 200,
            date: '2026-10-13',
          },
          {
            slug: 'workshop-talk',
            title: 'Workshop Talk',
            presentationType: 'workshop',
            categoryId: 200,
            date: '2026-10-14',
          },
        ],
      },
    ],
    presentations: [
      {
        slug: 'paper-talk',
        title: 'Paper Talk',
        presentationType: 'paper',
        categoryId: 200,
        categorySlug: 'paper-presenters',
        date: '2026-10-13',
        speakerSlugs: ['speaker-one'],
      },
      {
        slug: 'workshop-talk',
        title: 'Workshop Talk',
        presentationType: 'workshop',
        categoryId: 200,
        date: '2026-10-14',
        speakerSlugs: ['speaker-one'],
      },
      {
        slug: 'keynote-talk',
        title: 'Keynote Talk',
        presentationType: 'keynote',
        categoryId: 111,
        date: '2026-10-12',
        start: '08:00',
        speakerSlugs: [],
      },
      {
        slug: 'invited-talk',
        title: 'Invited Talk',
        presentationType: 'invited',
        categoryId: 104,
        date: '2026-10-12',
        start: '09:00',
        speakerSlugs: [],
      },
      {
        slug: 'panel-talk',
        title: 'Panel Talk',
        presentationType: 'panel',
        categorySlug: 'panels',
        scheduleSessionTitle: 'Panels',
        date: '2026-10-14',
        speakerSlugs: [],
      },
      {
        slug: 'wrong-panel-talk',
        title: 'Wrong Panel Talk',
        presentationType: 'panel',
        categorySlug: 'panels',
        scheduleSessionTitle: 'Panel Discussion',
        date: '2026-10-14',
        speakerSlugs: [],
      },
    ],
  });

  const workshops = programData.getProgramCategoryConfig('workshops', '2026');
  const keynotes = programData.getProgramCategoryConfig('keynotes-invited-speakers', '2026');
  const paperPresenters = programData.getProgramCategoryConfig('paper-presenters', '2026');

  assert.deepEqual(
    programData.selectPresentations(program, workshops).map((item) => item.slug),
    ['workshop-talk'],
  );
  assert.deepEqual(
    programData.selectPresentations(program, keynotes).map((item) => item.slug),
    ['keynote-talk', 'invited-talk', 'panel-talk'],
  );
  assert.deepEqual(
    programData
      .selectPresentations(program, keynotes)
      .map((item) => programData.getSectionForItem(item, keynotes).key),
    ['keynotes', 'invited', 'panels'],
  );
  assert.deepEqual(
    programData.selectSpeakers(program, paperPresenters).map((item) => item.slug),
    ['speaker-one'],
  );
});

test('detail routes parse singular speaker and presentation query targets', () => {
  assert.deepEqual(programData.parseProgramDetailRoute('/conference/2026/speaker'), {
    source: 'conference',
    year: '2026',
    type: 'speaker',
  });
  assert.deepEqual(programData.parseProgramDetailRoute('/archive/2025/presentation'), {
    source: 'archive',
    year: '2025',
    type: 'presentation',
  });
  assert.equal(programData.parseProgramDetailRoute('/conference/2026/speaker/'), null);
  assert.equal(programData.parseProgramDetailRoute('/archive/2025/paper-presenters/'), null);
});

test('program payload loader shares cached Meetinghand event requests', async () => {
  programData.clearProgramCache();
  let requestCount = 0;
  const payload = {
    data: {
      speaker_categories: [],
      speakers: [],
      presentations: [],
      schedule: [],
    },
  };
  const fetchImpl = async () => {
    requestCount += 1;
    return {
      ok: true,
      json: async () => payload,
    };
  };

  const raw = await programData.loadProgramPayload({
    source: 'conference',
    year: '2099',
    fetchImpl,
  });
  const normalized = await programData.loadProgram({
    source: 'conference',
    year: '2099',
    fetchImpl,
  });

  assert.equal(raw, payload);
  assert.equal(normalized.source, 'conference');
  assert.equal(requestCount, 1);
});

test('Meetinghand submission details normalize and cache lazy fields', async () => {
  programData.clearProgramCache();
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          fields: [
            { event_submission_field_id: 1469, value: 'Abstract line one\\nline two' },
            { event_submission_field_id: 1470, value: '<ul><li>Objective</li></ul>' },
            { event_submission_field_id: 1471, value: 'Speaker bio' },
          ],
        },
      }),
    };
  };

  const first = await programData.loadMeetingHandSubmission({
    year: '2099',
    id: '123',
    fetchImpl,
  });
  const second = await programData.loadMeetingHandSubmission({
    year: '2099',
    id: '123',
    fetchImpl,
  });

  assert.equal(first, second);
  assert.equal(requestCount, 1);
  assert.equal(first.abstract, 'Abstract line one line two');
  assert.match(first.abstractHtml, /<br>/);
  assert.equal(first.objectives, 'Objective');
  assert.equal(first.objectivesHtml, '<ul><li>Objective</li></ul>');
  assert.equal(first.bio, 'Speaker bio');
});

test('Meetinghand submission loader returns null for missing submissions', async () => {
  programData.clearProgramCache();
  const result = await programData.loadMeetingHandSubmission({
    year: '2099',
    id: '404',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('json should not be read for 404');
      },
    }),
  });

  assert.equal(result, null);
});
