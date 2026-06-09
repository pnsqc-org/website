import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const data = require('../../src/js/program-data.js');

test('program data helpers cover route, endpoint, date, presenter, and type edge cases', () => {
  assert.equal(data.extractDateKey(null), '');
  assert.equal(data.extractDateKey('bad'), '');
  assert.equal(data.extractDateKey('2026-10-12T00:00:00Z'), '2026-10-12');
  assert.equal(data.extractDateKey('December 25, 2026'), '2026-12-25');

  assert.equal(data.getProgramCategoryConfig('missing', '2026'), null);
  const firstConfig = data.getProgramCategoryConfig('workshops', '2026');
  const secondConfig = data.getProgramCategoryConfig('workshops', '2026');
  firstConfig.sections[0].title = 'Changed';
  assert.equal(secondConfig.sections[0].title, 'Workshops');

  assert.equal(data.parseProgramListRoute('/conference/2026/workshops/')?.category, 'workshops');
  assert.equal(data.parseProgramListRoute('/archive/2025/workshops/'), null);
  assert.equal(data.parseProgramListRoute('/conference/2026/missing/'), null);
  assert.equal(data.parseProgramListRoute('/bad/2026/workshops/'), null);

  assert.equal(
    data.getProgramEndpoint({ source: 'archive', year: '2025' }),
    '/data/archive/2025/program.json',
  );
  assert.equal(
    data.getMeetingHandSubmissionEndpoint({ year: '2026', id: 'id with spaces/slash' }),
    'https://api.meetinghand.com/api/events/pnsqc-2026/submissions/id%20with%20spaces%2Fslash',
  );

  assert.deepEqual(data.getPresenterDetails(null), {});
  assert.deepEqual(data.getPresenterDetails({ details: { organization: 'Details Org' } }), {
    organization: 'Details Org',
  });
  assert.deepEqual(data.getPresenterDetails({ 0: { organization: 'Numeric Org' } }), {
    organization: 'Numeric Org',
  });
  assert.equal(data.getMeetingHandSpeakerName({}), 'Presenter');

  assert.equal(data.normalizePresentationType('Half-day Workshop'), 'workshop');
  assert.equal(data.normalizePresentationType('Opening Keynote'), 'keynote');
  assert.equal(data.normalizePresentationType('Invited Guest'), 'invited');
  assert.equal(data.normalizePresentationType('Participant Submission'), 'paper');
  assert.equal(data.normalizePresentationType('Lightning Talk!'), 'lightning-talk');
  assert.equal(data.normalizePresentationType(''), '');
});

test('program data sorting and schedule helpers cover missing dates, starts, orders, ids, and duplicate speaker candidates', () => {
  assert.deepEqual(
    [
      { title: 'No Date', date: '', start: '', order: 2, sortOrder: 2 },
      { title: 'With Date', date: '2026-10-12', start: '', order: 1, sortOrder: 1 },
      { title: 'With Start', date: '2026-10-12', start: '08:00', order: 3, sortOrder: 3 },
    ]
      .sort(data.comparePresentations)
      .map((item) => item.title),
    ['With Start', 'With Date', 'No Date'],
  );
  assert.deepEqual(
    [
      { name: 'Beta', sortOrder: null },
      { name: 'Alpha', sortOrder: null },
      { name: 'Gamma', sortOrder: 1 },
    ]
      .sort(data.compareSpeakers)
      .map((item) => item.name),
    ['Alpha', 'Beta', 'Gamma'],
  );
  assert.deepEqual(
    [
      { name: 'Second', sortOrder: 2 },
      { name: 'First', sortOrder: 1 },
    ]
      .sort(data.compareSpeakers)
      .map((item) => item.name),
    ['First', 'Second'],
  );
  assert.equal(data.getLastNameKey('Single'), 'single');
  assert.equal(data.comparePeopleByLastName({ name: 'Ann Lee' }, { name: 'Bob Lee' }) < 0, true);

  assert.deepEqual(
    data
      .getSchedulePresentationSpeakerCandidates({
        speakers: [{ name: 'Duplicate Person' }],
        speaker: { firstname: 'Duplicate', lastname: 'Person' },
        authors: [{ full_name: 'Unique Author' }, {}],
        presenterAuthor: { name: 'Presenter Author' },
        presenter_author: { name: 'Presenter Author' },
        participant: { name: 'Participant Person' },
      })
      .map((person) => data.getMeetingHandPersonName(person)),
    ['Duplicate Person', 'Unique Author', 'Presenter Author', 'Participant Person'],
  );

  assert.equal(
    data.getScheduleItemSubmissionId({
      _scheduleItems: [{ presentation: {} }, { participant_submission_id: 42 }],
    }),
    '42',
  );
  assert.equal(data.getPresentationSubmissionId({ participantSubmissionId: 'p-sub' }), 'p-sub');
  assert.equal(
    data.getPresentationSubmissionId({ source: { submissionId: 'source-sub' } }),
    'source-sub',
  );
  assert.equal(
    data.getPresentationSubmissionId({ id: 'paper-id', presentationType: 'paper' }),
    'paper-id',
  );
  assert.equal(
    data.getPresentationSubmissionId({ id: 'keynote-id', presentationType: 'keynote' }),
    '',
  );
});

test('program data filters and sections cover include and exclude branches', () => {
  const program = {
    year: '2026',
    presentations: [
      {
        slug: 'paper',
        title: 'Paper',
        categoryId: 200,
        categorySlug: 'paper-presenters',
        date: '2026-10-12',
        presentationType: 'paper',
      },
      {
        slug: 'workshop',
        title: 'Workshop',
        categoryId: 201,
        categorySlug: 'workshops',
        date: '2026-10-14',
        presentationType: 'workshop',
      },
      {
        slug: 'keynote',
        title: 'Keynote',
        categoryId: 111,
        categorySlug: 'keynotes',
        date: '2026-10-12',
        presentationType: 'keynote',
      },
    ],
    speakers: [
      {
        name: 'Speaker',
        sortOrder: null,
        presentations: [
          {
            categoryId: 200,
            categorySlug: 'paper-presenters',
            date: '2026-10-12',
            presentationType: 'paper',
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    data
      .selectPresentations(program, {
        filters: {
          includeCategoryIds: [200],
          includeCategorySlugs: ['paper-presenters'],
          includeDates: ['2026-10-12T00:00:00Z'],
          includePresentationTypes: ['paper'],
        },
      })
      .map((item) => item.slug),
    ['paper'],
  );
  assert.deepEqual(
    data
      .selectPresentations(program, {
        filters: {
          excludeCategoryIds: [200],
          excludeCategorySlugs: ['workshops'],
          excludeDates: ['2026-10-12'],
          excludePresentationTypes: ['keynote'],
        },
      })
      .map((item) => item.slug),
    [],
  );
  assert.deepEqual(
    data
      .selectProgramItems(program, {
        cardType: 'speaker',
        filters: { includePresentationTypes: ['paper'] },
      })
      .map((item) => item.name),
    ['Speaker'],
  );
  assert.deepEqual(
    data
      .selectProgramItems(program, {
        cardType: 'presentation',
        filters: { includePresentationTypes: ['workshop'] },
      })
      .map((item) => item.slug),
    ['workshop'],
  );

  assert.equal(
    data.getSectionForItem(program.presentations[0], { cardType: 'presentation', sections: [] }),
    null,
  );
  assert.equal(
    data.getSectionForItem(program.presentations[0], {
      cardType: 'presentation',
      sections: [{ key: 'fallback' }],
    }).key,
    'fallback',
  );
  assert.equal(
    data.getSectionForItem(program.speakers[0], {
      cardType: 'speaker',
      sections: [{ key: 'paper', categorySlugs: ['paper-presenters'] }],
    }).key,
    'paper',
  );
});

test('program data loaders cover failed responses, missing fetchers, empty submissions, and direct field arrays', async () => {
  data.clearProgramCache();
  await assert.rejects(
    () =>
      data.loadProgramPayload({
        source: 'archive',
        year: '2099',
        fetchImpl: async () => ({ ok: false, status: 500 }),
      }),
    /Program data request failed: 500/,
  );

  data.clearProgramCache();
  await assert.rejects(
    () =>
      data.loadMeetingHandSubmission({
        year: '2099',
        id: '123',
        fetchImpl: async () => ({ ok: false, status: 500 }),
      }),
    /Submission data request failed: 500/,
  );

  assert.equal(
    await data.loadMeetingHandSubmission({ year: '2099', id: '   ', fetchImpl: vi.fn() }),
    null,
  );
  assert.equal(data.normalizeMeetingHandSubmission({ fields: [] }), null);
  assert.equal(
    data.normalizeMeetingHandSubmission({
      fields: [
        { id: 'unknown', value: 'Ignored' },
        { id: '1469', value: '<p>HTML abstract</p>' },
        { id: '1470', value: '' },
        { id: '1471', value: 'Bio\\r\\nLine\\tTabbed' },
      ],
    }).bio,
    'Bio Line Tabbed',
  );
});
