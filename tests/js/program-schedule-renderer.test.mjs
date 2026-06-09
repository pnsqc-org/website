// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import { flushPromises, importFreshSrcModule, resetDom } from '../helpers/jsdom.mjs';

function normalizeSpace(value) {
  return value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function createScheduleTemplate(id, text) {
  const template = document.createElement('template');
  template.id = id;
  const wrapper = document.createElement('div');
  wrapper.textContent = text;
  template.content.appendChild(wrapper);
  return template;
}

function installScheduleGlobals(dataOverrides = {}) {
  const data = {
    asArray: (value) => (Array.isArray(value) ? value : []),
    extractAbstractMap(html) {
      const map = new Map();
      if (String(html || '').includes('Paper Talk'))
        map.set('paper talk', '<p>Fallback abstract.</p>');
      return map;
    },
    extractDateKey: (value) => String(value || '').slice(0, 10),
    getMeetingHandPersonName: (person) =>
      normalizeSpace(person?.name) ||
      normalizeSpace(`${person?.firstname || ''} ${person?.lastname || ''}`),
    getPresenterDetails: (person) => person?.details || {},
    getProgramFallbackAvatar: ({ fallbackAvatar } = {}) =>
      fallbackAvatar || '/schedule-fallback.jpg',
    getScheduleItemSubmissionId(item) {
      if (Array.isArray(item?._scheduleItems)) {
        return (
          item._scheduleItems
            .map((entry) => data.getScheduleItemSubmissionId(entry))
            .find(Boolean) || ''
        );
      }
      if (item?.participant_submission_id) return String(item.participant_submission_id);
      if (item?.presentation?.presentation_type && item?.presentation?.id) {
        return String(item.presentation.id);
      }
      return '';
    },
    getSchedulePresentationSpeakerCandidates: (presentation) =>
      [
        presentation?.speaker,
        ...(presentation?.speakers || []),
        ...(presentation?.authors || []),
      ].filter(Boolean),
    getWorkshopDate: () => '2026-10-14',
    loadMeetingHandSubmission: vi.fn(() =>
      Promise.resolve({
        abstractHtml: '<p>Loaded abstract.</p>',
        bioHtml: '<p>Loaded bio.</p>',
      }),
    ),
    loadProgramPayload: vi.fn(() => Promise.resolve(createSchedulePayload())),
    mergeMeetingHandSubmissionDetail: vi.fn((presentation, detail) => ({
      ...presentation,
      abstractHtml: detail?.abstractHtml || presentation.abstractHtml,
      descriptionHtml: detail?.abstractHtml || presentation.descriptionHtml,
      speakers: (presentation.speakers || []).map((speaker) => ({
        ...speaker,
        bioHtml: speaker.bioHtml || detail?.bioHtml || '',
      })),
    })),
    normalizeCompareText: (value) =>
      normalizeSpace(String(value || '').replace(/<[^>]*>/g, ' '))
        .replace(/:\s*$/, '')
        .toLowerCase(),
    normalizeSpace,
    normalizeProgramPayload: vi.fn(() => ({
      presentations: [
        {
          slug: 'paper-talk',
          title: 'Paper Talk',
          date: '2026-10-12',
          start: '09:00',
          presentationType: 'paper',
          speakers: [],
        },
      ],
      speakers: [
        {
          name: 'Existing Speaker',
          slug: 'existing-speaker',
          avatar: '/existing.jpg',
          bioHtml: '<p>Existing bio.</p>',
        },
      ],
    })),
    sortPeopleByLastName: (people) =>
      (Array.isArray(people) ? people : [])
        .slice()
        .sort((left, right) =>
          normalizeSpace(left?.name).localeCompare(normalizeSpace(right?.name)),
        ),
    ...dataOverrides,
  };

  globalThis.PNSQCProgramData = data;
  globalThis.PNSQCProgramRenderer = {
    createRenderer: vi.fn(() => ({
      buildPresentationModalTemplate({ presentation, templateId }) {
        return {
          template: createScheduleTemplate(
            templateId,
            `Details for ${presentation.title} ${presentation.abstractHtml || ''}`,
          ),
          templateId,
        };
      },
    })),
  };
  globalThis.PNSQCSlugs = {
    slugify: (value, fallback = 'item') =>
      normalizeSpace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback,
  };
  return data;
}

function createSchedulePayload() {
  return {
    data: {
      end_date: '2026-10-14',
      event_location: {
        city: 'Portland',
        state: 'OR',
      },
      long_name: 'PNSQC 2026',
      schedule: [
        {
          date: '2026-10-12',
          sessions: [
            {
              description: '<p>Paper Talk:</p><blockquote><p>Fallback abstract.</p></blockquote>',
              end: '10:00',
              location: 'Room A',
              start: '09:00',
              title: 'Technical Papers',
              items: [
                {
                  duration: 30,
                  id: 'item-1',
                  order: 2,
                  participant_submission_id: 'sub-1',
                  presentation: {
                    id: 'paper-1',
                    title: 'Paper Talk',
                    speaker: {
                      firstname: 'Existing',
                      lastname: 'Speaker',
                    },
                  },
                },
                {
                  duration: 30,
                  id: 'item-2',
                  order: 1,
                  participant_submission_id: 'sub-2',
                  presentation: {
                    id: 'paper-2',
                    title: 'Paper Talk',
                    authors: [
                      {
                        firstname: 'New',
                        lastname: 'Speaker',
                        avatar: '',
                        profession: 'Tester',
                      },
                    ],
                  },
                },
                {
                  duration: 30,
                  id: 'item-4',
                  order: 3,
                  participant_submission_id: 'sub-3',
                  presentation: {
                    id: 'paper-3',
                    title: 'Lazy Missing',
                    presentation_type: 'Paper',
                    speaker: {
                      firstname: 'Lazy',
                      lastname: 'Speaker',
                    },
                  },
                },
              ],
            },
            {
              end: '10:00',
              is_timeless_items: true,
              start: '09:00',
              title: 'Invited Speakers',
              items: [
                {
                  duration: 45,
                  id: 'item-3',
                  presentation: {
                    id: 'invited-1',
                    title: 'Invited Talk',
                    speakers: [{ name: 'Guest Speaker' }],
                  },
                },
              ],
            },
            {
              end: '11:00',
              is_break: true,
              location: 'Lobby',
              start: '10:15',
              title: 'Break',
            },
            {
              end: '',
              start: '',
              title: 'Unscheduled',
              items: [],
            },
          ],
        },
        {
          date: '2026-10-14',
          sessions: [],
        },
      ],
      start_date: '2026-10-12',
      time_format: 'h12',
      timezone: {
        key: 'America/Los_Angeles',
      },
    },
  };
}

function scheduleContainerHtml() {
  return `
    <div data-program-schedule data-program-year="2026" data-program-source="conference" data-schedule-fallback-avatar="/configured.jpg">
      <p data-schedule-event-meta></p>
      <p data-schedule-event-intro></p>
      <div data-schedule-timezone-toggle>
        <button data-timezone-option="local">Local</button>
        <button data-timezone-option="event">Pacific</button>
      </div>
      <p data-schedule-timezone-label></p>
      <nav data-schedule-day-nav></nav>
      <div data-schedule-root></div>
      <div data-schedule-templates></div>
    </div>
  `;
}

beforeEach(() => {
  resetDom();
  delete globalThis.PNSQCProgramData;
  delete globalThis.PNSQCProgramRenderer;
  delete globalThis.PNSQCSlugs;
  delete globalThis.PNSQCProgramSchedule;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

test('schedule renderer renders event headers, day nav, grouped sessions, lazy buttons, and timezone toggles', async () => {
  const data = installScheduleGlobals();
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();

  const app = globalThis.PNSQCProgramSchedule.createScheduleApp(
    document.querySelector('[data-program-schedule]'),
  );
  await app.init();

  assert.match(
    document.querySelector('[data-schedule-event-meta]').textContent,
    /10\/12\/2026 - 10\/14\/2026/,
  );
  assert.match(document.querySelector('[data-schedule-event-meta]').textContent, /Portland, OR/);
  assert.equal(
    document.querySelector('[data-schedule-event-intro]').textContent,
    'Live schedule for PNSQC 2026.',
  );
  assert.equal(document.querySelectorAll('[data-schedule-day-nav] a').length, 2);
  assert.match(document.querySelector('[data-schedule-root]').textContent, /Technical Papers/);
  assert.match(document.querySelector('[data-schedule-root]').textContent, /Break/);
  assert.match(document.querySelector('[data-schedule-root]').textContent, /Sessions for this day/);
  assert.match(document.querySelector('[data-schedule-root]').textContent, /Day 2 \| Workshops/);
  assert.equal(
    document.querySelectorAll('[data-schedule-submission-trigger="true"]').length > 0,
    true,
  );

  document
    .querySelector('[data-timezone-option="event"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(
    document.querySelector('[data-schedule-timezone-label]').textContent,
    'Showing times in Pacific Time.',
  );
  document
    .querySelector('[data-timezone-option="event"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(app.renderer.displayTimeZone, 'event');
});

test('schedule app lazy-loads submission details, re-renders, and handles submission failures', async () => {
  const data = installScheduleGlobals();
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();
  const app = globalThis.PNSQCProgramSchedule.createScheduleApp(
    document.querySelector('[data-program-schedule]'),
  );
  await app.init();

  const trigger = document.querySelector('[data-schedule-submission-trigger="true"]');
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flushPromises();
  await flushPromises();

  assert.equal(
    data.loadMeetingHandSubmission.mock.calls[0][0].id,
    trigger.getAttribute('data-schedule-submission-id'),
  );
  assert.equal(trigger.disabled, false);
  assert.equal(app.renderer.submissionDetails.size > 0, true);
  assert.equal(document.querySelector('[data-schedule-templates]').children.length > 0, true);

  const failingData = installScheduleGlobals({
    loadMeetingHandSubmission: vi.fn(() => Promise.reject(new Error('offline'))),
  });
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();
  const failingApp = globalThis.PNSQCProgramSchedule.createScheduleApp(
    document.querySelector('[data-program-schedule]'),
  );
  await failingApp.init();
  const failingTrigger = document.querySelector('[data-schedule-submission-trigger="true"]');
  failingTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flushPromises();
  await flushPromises();

  assert.equal(failingData.loadMeetingHandSubmission.mock.calls.length, 1);
  assert.equal(failingTrigger.getAttribute('data-details-modal-label'), 'Details');
  const errorTemplate = Array.from(
    document.querySelectorAll('[data-schedule-templates] template'),
  ).at(-1);
  assert.match(errorTemplate.content.textContent, /could not load/);
});

test('schedule app renders empty and error states and initSchedulePages initializes containers', async () => {
  const emptyData = installScheduleGlobals({
    loadProgramPayload: vi.fn(() =>
      Promise.resolve({
        data: {
          schedule: [],
        },
      }),
    ),
  });
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();
  const app = globalThis.PNSQCProgramSchedule.createScheduleApp(
    document.querySelector('[data-program-schedule]'),
  );
  await app.init();
  assert.match(document.querySelector('[data-schedule-root]').textContent, /coming soon/);
  assert.match(document.querySelector('[data-schedule-day-nav]').textContent, /No schedule days/);

  const failingData = installScheduleGlobals({
    loadProgramPayload: vi.fn(() => Promise.reject(new Error('offline'))),
  });
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();
  const failingApp = globalThis.PNSQCProgramSchedule.createScheduleApp(
    document.querySelector('[data-program-schedule]'),
  );
  await failingApp.init();
  assert.match(
    document.querySelector('[data-schedule-root]').textContent,
    /temporarily unavailable/,
  );
  assert.match(document.querySelector('[data-schedule-day-nav]').textContent, /Unable to load/);

  const initData = installScheduleGlobals();
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  document.body.innerHTML = scheduleContainerHtml();
  globalThis.PNSQCProgramSchedule.initSchedulePages(document);
  await flushPromises();
  assert.equal(initData.loadProgramPayload.mock.calls.length, 1);
});

test('schedule utilities cover invalid and alternate date, time, formatting, and fallback cases', async () => {
  installScheduleGlobals();
  document.body.innerHTML = '';
  await importFreshSrcModule('program-schedule.js');
  const schedule = globalThis.PNSQCProgramSchedule;

  assert.equal(schedule.TimeUtils.parseTimeToMinutes('abc'), null);
  assert.equal(schedule.TimeUtils.parseTimeToMinutes('09:bad'), null);
  assert.equal(schedule.TimeUtils.parseDateOnly('bad'), null);
  assert.ok(schedule.TimeUtils.parseDateOnly('2026-10-12T00:00:00Z'));
  assert.equal(
    schedule.TimeUtils.formatSessionTimeRange(
      { start: '', end: '10:00' },
      '2026-10-12',
      'h24',
      'event',
      'America/Los_Angeles',
    ).includes('10:00'),
    true,
  );
  assert.equal(schedule.TimeUtils.formatEventDateRange('', '2026-10-12'), '');
  assert.equal(schedule.TimeUtils.formatDayHeading('bad'), 'Date TBA');
  assert.equal(schedule.TimeUtils.formatDayNavLabel('bad', 2), 'Day 3');
  assert.equal(schedule.SubmissionFormatter.sanitizeHtmlFragment('<p>x</p>'), '<p>x</p>');
  assert.deepEqual(schedule.groupSessionsByTime(null), []);
  assert.deepEqual(schedule.groupScheduleItems(null), []);
  assert.equal(
    schedule.getScheduleItemSubmissionId({
      presentation: { id: 'p1', presentation_type: 'Paper' },
    }),
    'p1',
  );
});
