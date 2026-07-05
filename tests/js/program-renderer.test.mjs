// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { beforeEach, test } from 'vitest';

import { resetDom } from '../helpers/jsdom.mjs';

const require = createRequire(import.meta.url);
require('../../src/js/program-data.js');
const { createRenderer } = require('../../src/js/program-renderer.js');

const speakerAlpha = {
  slug: 'alpha-speaker',
  id: '1',
  name: 'Alpha Speaker',
  profession: 'Quality Lead',
  organization: 'Alpha Co',
  avatar: '/alpha.jpg',
  linkedin: 'https://linkedin.example/alpha',
  homepage: '/speakers/alpha',
  bio: 'Alpha bio.',
  bioHtml: '<p>Alpha <strong>bio</strong>.</p>',
};

const speakerBeta = {
  slug: 'beta-speaker',
  id: '2',
  name: 'Beta Speaker',
  avatar: '',
  homepage: 'mailto:beta@example.com',
  bio: '',
  bioHtml: '',
};

const paperPresentation = {
  slug: 'quality-paper',
  id: 'p1',
  title: 'Quality Paper',
  topic: 'Quality Engineering & Systems Reliability',
  abstract: 'Plain abstract.',
  abstractHtml: '<p>Paper abstract.</p>',
  descriptionHtml: '',
  objectives: 'Objective one\nObjective two',
  presentationType: 'paper',
  speakers: [speakerBeta, speakerAlpha],
};

beforeEach(() => {
  resetDom();
});

test('program renderer sanitizes rich HTML fragments and link attributes', () => {
  const renderer = createRenderer();

  const sanitized = renderer.sanitizeHtmlFragment(`
    <p onclick="bad()">Hello&nbsp;<strong>world</strong></p>
    <script><span>nested</span></script>
    <a href="https://example.com" onclick="bad()">External</a>
    <a href="/relative">Relative</a>
    <a href="mailto:test@example.com">Mail</a>
    <a href="javascript:alert(1)">Bad</a>
    <img src="/x.jpg" alt="bad">
  `);

  assert.match(sanitized, /Hello <strong>world<\/strong>/);
  assert.match(
    sanitized,
    /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">External<\/a>/,
  );
  assert.match(sanitized, /<a href="\/relative">Relative<\/a>/);
  assert.match(sanitized, /<a href="mailto:test@example.com">Mail<\/a>/);
  assert.equal(sanitized.includes('javascript:'), false);
  assert.equal(sanitized.includes('<img'), false);
  assert.equal(renderer.sanitizeHtmlFragment(''), '');
});

test('program renderer builds speaker cards, details, templates, and compatibility aliases', () => {
  const renderer = createRenderer({
    fallbackAvatar: '/fallback.jpg',
    bioFallbackText: 'No bio yet.',
  });
  const speaker = {
    ...speakerAlpha,
    presentations: [
      {
        title: 'First Talk',
        topic: 'Emerging Technologies & AI Systems',
        descriptionHtml: '<p>First details.</p>',
      },
      {
        title: 'Second Talk',
        abstract: 'Second details.',
      },
    ],
  };

  const card = renderer.buildSpeakerCard({
    speaker,
    templateId: 'speaker-template',
    categoryLabel: 'Paper Presenter',
  });
  assert.equal(card.querySelector('h3').textContent, 'Alpha Speaker');
  assert.equal(
    card
      .querySelector('[data-details-modal-open="speaker-template"]')
      .getAttribute('data-details-modal-subtitle'),
    'Emerging Technologies & AI Systems',
  );
  assert.match(card.textContent, /Quality Lead - Alpha Co/);
  assert.doesNotMatch(card.textContent, /Emerging Technologies & AI Systems/);
  assert.equal(
    card.textContent.indexOf('Quality Lead - Alpha Co') < card.textContent.indexOf('First Talk'),
    true,
  );
  assert.equal(
    card.querySelector('[data-details-modal-open="speaker-template"]').textContent.trim(),
    'Read More',
  );
  assert.equal(card.querySelectorAll('a').length, 2);

  const details = renderer.buildSpeakerDetailsContent(speaker);
  assert.match(details.textContent, /First Talk/);
  assert.match(details.textContent, /Emerging Technologies & AI Systems/);
  assert.equal(
    details.textContent.indexOf('First Talk') <
      details.textContent.indexOf('Emerging Technologies & AI Systems'),
    true,
  );
  assert.match(details.textContent, /Second Talk/);
  assert.match(details.textContent, /Quality Lead - Alpha Co/);
  assert.equal(details.querySelector('img').getAttribute('src'), '/alpha.jpg');

  const organizationOnlyCard = renderer.buildSpeakerCard({
    speaker: {
      name: 'Organization Only',
      organization: 'Solo Org',
      presentations: [{ title: 'Org Talk', topic: 'Hidden Topic' }],
    },
    templateId: 'organization-only-template',
    categoryLabel: 'Paper Presenter',
  });
  assert.match(organizationOnlyCard.textContent, /Solo Org/);
  assert.equal(
    organizationOnlyCard.textContent.indexOf('Solo Org') <
      organizationOnlyCard.textContent.indexOf('Org Talk'),
    true,
  );
  assert.doesNotMatch(organizationOnlyCard.textContent, /Solo Org -/);
  assert.doesNotMatch(organizationOnlyCard.textContent, /Hidden Topic/);

  const noBioDetails = renderer.buildSpeakerDetailsContent({
    name: 'No Bio',
    presentations: [],
  });
  assert.match(noBioDetails.textContent, /Presentation details are coming soon/);
  assert.match(noBioDetails.textContent, /No bio yet/);
  assert.equal(noBioDetails.querySelector('img').getAttribute('src'), '/fallback.jpg');

  const modal = renderer.buildSpeakerModalTemplate({
    speaker,
    templateId: 'speaker-template',
    categoryLabel: 'Paper Presenter',
  });
  assert.equal(modal.templateId, 'speaker-template');
  assert.equal(modal.title, 'Alpha Speaker');
  assert.equal(modal.categoryLabel, 'Paper Presenter');
  assert.equal(modal.template.content.textContent.includes('Alpha Speaker'), true);

  const aliasCard = renderer.buildPresenterCard({
    presenter: speaker,
    templateId: 'alias-template',
    categoryLabel: 'Presenter',
  });
  assert.equal(
    aliasCard.querySelector('[data-details-modal-open="alias-template"]') !== null,
    true,
  );

  const aliasTemplate = renderer.buildModalTemplate(
    { ...speaker, slug: '', id: 'fallback-id' },
    'Alias',
  );
  assert.equal(aliasTemplate.templateId, 'details-modal-template-speaker-fallback-id');
});

test('program renderer builds presentation cards and details for multiple and missing speakers', () => {
  const renderer = createRenderer({
    fallbackAvatar: '/fallback.jpg',
    bioFallbackText: 'No bio yet.',
  });

  const card = renderer.buildPresentationCard({
    presentation: paperPresentation,
    templateId: 'presentation-template',
    categoryLabel: 'Presentation',
  });
  assert.equal(card.querySelector('h3').textContent, 'Quality Paper');
  assert.equal(card.querySelectorAll('img').length, 2);
  assert.equal(
    card
      .querySelector('[data-details-modal-open="presentation-template"]')
      .getAttribute('data-details-modal-subtitle'),
    'Quality Engineering & Systems Reliability',
  );
  assert.equal(
    card.querySelector('[data-details-modal-open="presentation-template"]').textContent.trim(),
    'Read More',
  );

  const details = renderer.buildPresentationDetailsContent(paperPresentation);
  assert.match(details.textContent, /Speakers/);
  assert.match(details.textContent, /Paper abstract/);
  assert.match(details.textContent, /Learning Objectives/);
  assert.match(details.textContent, /Alpha bio/);
  assert.match(details.textContent, /No bio yet/);

  const presenterImages = card.querySelectorAll('img');
  const presenterImageGroup = presenterImages[0].parentElement;
  assert.equal(presenterImages.length, 2);
  assert.equal(presenterImageGroup.classList.contains('sm:grid-flow-col'), true);
  assert.equal(presenterImageGroup.classList.contains('sm:grid-rows-2'), true);
  assert.equal(presenterImages[0].classList.contains('sm:h-28'), true);
  assert.equal(presenterImages[0].classList.contains('sm:w-28'), true);

  const primaryBioDetails = renderer.buildPresentationDetailsContent({
    ...paperPresentation,
    bioSpeakers: [speakerAlpha],
  });
  assert.match(primaryBioDetails.textContent, /Alpha Speaker/);
  assert.match(primaryBioDetails.textContent, /Beta Speaker/);
  assert.match(primaryBioDetails.textContent, /Alpha bio/);
  assert.doesNotMatch(primaryBioDetails.textContent, /No bio yet/);

  const additionalAuthorDetails = renderer.buildPresentationDetailsContent({
    ...paperPresentation,
    presenterSpeakers: [speakerAlpha],
    additionalAuthors: [{ name: 'Charlie Tester' }, { name: 'Beta Speaker' }],
    bioSpeakers: [speakerAlpha],
  });
  assert.match(additionalAuthorDetails.textContent, /Speaker/);
  assert.match(additionalAuthorDetails.textContent, /Additional Authors/);
  assert.equal(
    additionalAuthorDetails.textContent.indexOf('Alpha Speaker') <
      additionalAuthorDetails.textContent.indexOf('Additional Authors'),
    true,
  );
  assert.equal(
    additionalAuthorDetails.textContent.indexOf('Additional Authors') <
      additionalAuthorDetails.textContent.indexOf('Beta Speaker'),
    true,
  );
  assert.equal(
    additionalAuthorDetails.textContent.indexOf('Beta Speaker') <
      additionalAuthorDetails.textContent.indexOf('Charlie Tester'),
    true,
  );

  const workshopDetails = renderer.buildPresentationDetailsContent({
    title: 'Workshop',
    presentationType: 'workshop',
    descriptionHtml: '<p>Workshop description.</p>',
    speakers: [],
  });
  assert.match(workshopDetails.textContent, /Description/);
  assert.match(workshopDetails.textContent, /Speaker details are coming soon/);

  const emptyCard = renderer.buildPresentationCard({
    presentation: { title: '', speakers: [] },
    templateId: 'empty-template',
    categoryLabel: 'Presentation',
  });
  assert.equal(emptyCard.querySelector('h3').textContent, 'Presentation TBA');
  assert.equal(emptyCard.querySelector('img').getAttribute('src'), '/fallback.jpg');

  const modal = renderer.buildPresentationModalTemplate({
    presentation: paperPresentation,
    templateId: 'presentation-template',
    categoryLabel: 'Presentation',
  });
  assert.equal(modal.title, 'Quality Paper');
  assert.equal(modal.template.id, 'presentation-template');

  const sessionCard = renderer.buildSessionCard({
    displayPresentation: paperPresentation,
    templateId: 'session-template',
    categoryLabel: 'Session',
  });
  assert.equal(
    sessionCard.querySelector('[data-details-modal-open="session-template"]') !== null,
    true,
  );

  const sessionTemplate = renderer.buildSessionDetailsTemplate({
    displayPresentation: paperPresentation,
    templateId: 'session-details',
    categoryName: 'Session',
  });
  assert.equal(sessionTemplate.templateId, 'session-details');
});

test('program renderer creates standalone templates and normalizes exported helpers', () => {
  const renderer = createRenderer();
  const content = document.createElement('p');
  content.textContent = 'Template content';

  const template = renderer.createTemplate('custom-template', content);

  assert.equal(template.id, 'custom-template');
  assert.equal(template.content.textContent, 'Template content');
  assert.deepEqual(renderer.asArray([1]), [1]);
  assert.deepEqual(renderer.asArray(null), []);
  assert.equal(renderer.normalizeSpace('  A\n B  '), 'A B');
});
