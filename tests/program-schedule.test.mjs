import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const programData = require('../src/js/program-data.js');
const schedule = require('../src/js/program-schedule.js');

test('schedule utilities parse times and format day labels', () => {
  assert.equal(schedule.TimeUtils.parseTimeToMinutes('09:30'), 570);
  assert.equal(schedule.TimeUtils.parseTimeToMinutes('bad'), null);
  assert.equal(
    schedule.TimeUtils.formatEventDateRange('2026-10-12', '2026-10-14'),
    '10/12/2026 - 10/14/2026',
  );
  assert.equal(schedule.TimeUtils.formatDayHeading('2026-10-12'), 'Monday, 10/12/2026');
  assert.equal(schedule.TimeUtils.formatDayNavLabel('2026-10-12', 0), 'Mon - Day 1');
});

test('schedule utilities group sessions by shared time blocks', () => {
  const grouped = schedule.groupSessionsByTime([
    { title: 'A', start: '09:00', end: '10:00' },
    { title: 'B', start: '09:00', end: '10:00' },
    { title: 'C', start: '10:15', end: '11:00' },
  ]);

  assert.equal(grouped.length, 2);
  assert.deepEqual(
    grouped[0].map((session) => session.title),
    ['A', 'B'],
  );
});

test('schedule utilities group repeated presentation items for multi-speaker sessions', () => {
  const grouped = schedule.groupScheduleItems([
    {
      id: 1,
      order: 2,
      presentation: {
        title: "Managers' Forum: Quality Leadership in the Age of Autonomy",
        speaker: { firstname: 'Philip', lastname: 'Lew' },
      },
    },
    {
      id: 2,
      order: 1,
      presentation: {
        title: "Managers' Forum: Quality Leadership in the Age of Autonomy",
        speaker: { firstname: 'Kevin', lastname: 'Pyles' },
      },
    },
    {
      id: 3,
      order: 3,
      presentation: {
        title: 'Independent Paper',
        speaker: { firstname: 'Jeyasekar', lastname: 'Marimuthu' },
      },
    },
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(
    grouped[0].presentation.title,
    "Managers' Forum: Quality Leadership in the Age of Autonomy",
  );
  assert.equal(grouped[0]._scheduleItems.length, 2);
  assert.deepEqual(
    grouped[0]._scheduleItems.map((item) => item.presentation.speaker.lastname),
    ['Pyles', 'Lew'],
  );
});

test('shared data helper extracts schedule speaker candidates without duplicates', () => {
  const candidates = programData.getSchedulePresentationSpeakerCandidates({
    speakers: [{ firstname: 'Philip', lastname: 'Lew' }],
    speaker: { firstname: 'Kevin', lastname: 'Pyles' },
    authors: [
      { firstname: 'Philip', lastname: 'Lew' },
      { firstname: 'Tariq', lastname: 'King' },
    ],
  });

  assert.deepEqual(
    candidates.map((candidate) => programData.getMeetingHandPersonName(candidate)),
    ['Philip Lew', 'Kevin Pyles', 'Tariq King'],
  );
});

test('schedule utilities extract fallback abstracts from Meetinghand session HTML', () => {
  const abstracts = schedule.SubmissionFormatter.extractAbstractMap({
    description: '<p>Testing With Care</p><blockquote><p>Useful abstract.</p></blockquote>',
  });

  assert.equal(abstracts.get('testing with care'), '<p>Useful abstract.</p>');
});

test('schedule utilities resolve submission ids from schedule items', () => {
  assert.equal(
    schedule.getScheduleItemSubmissionId({
      participant_submission_id: 321,
      presentation: { id: 123, presentation_type: 'paper' },
    }),
    '321',
  );
  assert.equal(
    schedule.getScheduleItemSubmissionId({
      presentation: { id: 123, presentation_type: 'paper' },
    }),
    '123',
  );
  assert.equal(schedule.getScheduleItemSubmissionId({ presentation: { id: 123 } }), '');
});
