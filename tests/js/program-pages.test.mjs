// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import { flushPromises, importFreshSrcModule, resetDom } from '../helpers/jsdom.mjs';

function createTemplate(id, text) {
  const template = document.createElement('template');
  template.id = id;
  const content = document.createElement('div');
  content.textContent = text;
  template.content.appendChild(content);
  return template;
}

function createRendererStub() {
  return {
    buildPresentationCard({ presentation, templateId }) {
      const card = document.createElement('article');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-details-modal-open', templateId);
      button.textContent = presentation.title || 'Presentation TBA';
      card.appendChild(button);
      return card;
    },
    buildPresentationDetailsContent(presentation) {
      const el = document.createElement('div');
      el.textContent = `Presentation details: ${presentation.title || ''}`;
      return el;
    },
    buildPresentationModalTemplate({ presentation, templateId, categoryLabel }) {
      return {
        categoryLabel,
        template: createTemplate(
          templateId,
          `Presentation template: ${presentation.title || ''} ${presentation.abstractHtml || ''}`,
        ),
        templateId,
        title: presentation.title || 'Presentation TBA',
      };
    },
    buildSpeakerCard({ speaker, templateId }) {
      const card = document.createElement('article');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-details-modal-open', templateId);
      button.textContent = speaker.name || 'Presenter';
      card.appendChild(button);
      return card;
    },
    buildSpeakerDetailsContent(speaker) {
      const el = document.createElement('div');
      el.textContent = `Speaker details: ${speaker.name || ''}`;
      return el;
    },
    buildSpeakerModalTemplate({ speaker, templateId, categoryLabel }) {
      return {
        categoryLabel,
        template: createTemplate(templateId, `Speaker template: ${speaker.name || ''}`),
        templateId,
        title: speaker.name || 'Presenter',
      };
    },
  };
}

function installProgramGlobals(dataOverrides = {}, rendererOverrides = {}) {
  const renderer = { ...createRendererStub(), ...rendererOverrides };
  const data = {
    asArray: (value) => (Array.isArray(value) ? value : []),
    getProgramFallbackAvatar: ({ source, year, fallbackAvatar } = {}) =>
      fallbackAvatar || `/fallback-${source || 'unknown'}-${year || 'unknown'}.jpg`,
    getPresentationSubmissionId: (presentation) =>
      presentation?.submissionId ||
      (presentation?.presentationType === 'paper' ? presentation?.id : ''),
    getSectionForItem: (_item, config) => config.sections[0],
    loadMeetingHandSubmission: vi.fn(() =>
      Promise.resolve({
        abstractHtml: '<p>Hydrated abstract.</p>',
        bioHtml: '<p>Hydrated bio.</p>',
      }),
    ),
    loadProgram: vi.fn(() => Promise.resolve({})),
    mergeMeetingHandSubmissionDetail: vi.fn((presentation, detail) => ({
      ...presentation,
      abstractHtml: detail?.abstractHtml || presentation.abstractHtml,
    })),
    mergeMeetingHandSubmissionDetailIntoSpeaker: vi.fn((speaker, presentation, detail) => ({
      ...speaker,
      bioHtml: detail?.bioHtml || speaker.bioHtml,
      presentations: speaker.presentations.map((candidate) =>
        candidate === presentation
          ? { ...candidate, abstractHtml: detail?.abstractHtml }
          : candidate,
      ),
    })),
    normalizeSpace: (value) =>
      value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim(),
    parseProgramDetailRoute: vi.fn(() => null),
    parseProgramListRoute: vi.fn(() => null),
    selectProgramItems: vi.fn(() => []),
    ...dataOverrides,
  };

  window.PNSQCProgramData = data;
  window.PNSQCProgramRenderer = {
    createRenderer: vi.fn(() => renderer),
  };
  return { data, renderer };
}

beforeEach(() => {
  resetDom();
  delete window.PNSQCProgramData;
  delete window.PNSQCProgramRenderer;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

test('program directory exits when root, dependencies, or route are unavailable', async () => {
  await importFreshSrcModule('program-directory.js');

  resetDom('<div data-program-directory></div>');
  await importFreshSrcModule('program-directory.js');

  installProgramGlobals({
    parseProgramListRoute: vi.fn(() => null),
  });
  await importFreshSrcModule('program-directory.js');

  assert.equal(window.PNSQCProgramData.parseProgramListRoute.mock.calls.length, 1);
});

test('program directory renders speaker sections and hydrates lazy submission details', async () => {
  const config = {
    cardType: 'speaker',
    defaultLabel: 'Paper Presenter',
    emptyText: 'Empty default',
    errorText: 'Program unavailable.',
    loadingText: 'Loading paper presenters...',
    sections: [
      {
        key: 'papers',
        title: 'Papers',
        label: 'Paper Presenter',
        headingClass: 'text-test',
      },
    ],
    slug: 'paper-presenters',
  };
  const speaker = {
    id: 'speaker-1',
    slug: 'speaker-1',
    name: 'Paper Speaker',
    bio: '',
    bioHtml: '',
    presentations: [
      {
        id: 'sub-1',
        title: 'Lazy Paper',
        presentationType: 'paper',
        submissionId: 'sub-1',
        abstractHtml: '',
        speakers: [],
      },
    ],
  };
  const { data } = installProgramGlobals({
    loadProgram: vi.fn(() => Promise.resolve({ speakers: [speaker], presentations: [] })),
    parseProgramListRoute: vi.fn(() => ({
      config,
      source: 'conference',
      year: '2026',
    })),
    selectProgramItems: vi.fn(() => [speaker]),
  });
  resetDom(
    `
      <div data-program-directory data-program-fallback-avatar="/configured.jpg">
        <p data-program-status></p>
        <div data-program-sections></div>
        <div data-program-templates></div>
      </div>
    `,
    'https://www.pnsqc.org/conference/2026/paper-presenters/',
  );

  await importFreshSrcModule('program-directory.js');
  await flushPromises();

  const root = document.querySelector('[data-program-directory]');
  const status = root.querySelector('[data-program-status]');
  const trigger = root.querySelector('[data-program-submission-trigger="true"]');
  assert.equal(status.hidden, true);
  assert.match(root.querySelector('[data-program-sections]').textContent, /Papers/);
  assert.equal(root.querySelector('[data-program-templates]').children.length, 1);
  assert.ok(trigger);
  assert.equal(trigger.getAttribute('data-details-modal-label'), 'Presentation');

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flushPromises();
  await flushPromises();

  assert.equal(data.loadMeetingHandSubmission.mock.calls[0][0].id, 'sub-1');
  assert.equal(data.mergeMeetingHandSubmissionDetailIntoSpeaker.mock.calls.length, 1);
  assert.equal(trigger.hasAttribute('data-program-submission-trigger'), false);
  assert.equal(trigger.disabled, false);
  assert.match(
    document.getElementById(trigger.getAttribute('data-details-modal-open')).innerHTML,
    /Hydrated/,
  );
});

test('program directory hydrates non-paper presentations with submission details', async () => {
  const config = {
    cardType: 'presentation',
    defaultLabel: 'Panel',
    emptyText: 'Empty default',
    errorText: 'Program unavailable.',
    loadingText: 'Loading speakers...',
    sections: [{ key: 'panels', title: 'Panels', label: 'Panel' }],
    slug: 'keynotes-invited-speakers',
  };
  const presentation = {
    id: 'panel-1',
    slug: 'panel-1',
    title: 'Lazy Panel',
    presentationType: 'panel',
    submissionId: 'panel-sub-1',
    abstractHtml: '',
    speakers: [{ name: 'Panel Speaker', bio: '', bioHtml: '' }],
  };
  const { data } = installProgramGlobals({
    loadProgram: vi.fn(() => Promise.resolve({ presentations: [presentation] })),
    parseProgramListRoute: vi.fn(() => ({
      config,
      source: 'conference',
      year: '2026',
    })),
    selectProgramItems: vi.fn(() => [presentation]),
  });
  resetDom(
    `
      <div data-program-directory>
        <p data-program-status></p>
        <div data-program-sections></div>
        <div data-program-templates></div>
      </div>
    `,
    'https://www.pnsqc.org/conference/2026/keynotes-invited-speakers/',
  );

  await importFreshSrcModule('program-directory.js');
  await flushPromises();

  const root = document.querySelector('[data-program-directory]');
  const trigger = root.querySelector('[data-program-submission-trigger="true"]');
  assert.ok(trigger);

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flushPromises();
  await flushPromises();

  assert.equal(data.loadMeetingHandSubmission.mock.calls[0][0].id, 'panel-sub-1');
  assert.equal(data.mergeMeetingHandSubmissionDetail.mock.calls.length, 1);
  assert.match(
    document.getElementById(trigger.getAttribute('data-details-modal-open')).innerHTML,
    /Hydrated abstract/,
  );
});

test('program directory renders presentation cards, empty states, and load errors', async () => {
  const config = {
    cardType: 'presentation',
    defaultLabel: 'Workshop',
    emptyText: 'Nothing yet.',
    errorText: 'Workshops unavailable.',
    loadingText: 'Loading workshops...',
    sections: [{ key: 'workshops', title: 'Workshops', label: 'Workshop' }],
    slug: 'workshops',
  };
  const presentation = {
    id: 'workshop-1',
    slug: 'workshop-1',
    title: 'Workshop One',
    presentationType: 'workshop',
    speakers: [],
  };
  installProgramGlobals({
    loadProgram: vi.fn(() => Promise.resolve({ presentations: [presentation] })),
    parseProgramListRoute: vi.fn(() => ({
      config,
      source: 'archive',
      year: '2025',
    })),
    selectProgramItems: vi.fn(() => [presentation]),
  });
  resetDom(`
    <div data-program-directory>
      <p data-program-status></p>
      <div data-program-sections></div>
      <div data-program-templates></div>
    </div>
  `);

  await importFreshSrcModule('program-directory.js');
  await flushPromises();

  assert.match(document.querySelector('[data-program-sections]').textContent, /Workshop One/);

  installProgramGlobals({
    loadProgram: vi.fn(() => Promise.resolve({ presentations: [] })),
    parseProgramListRoute: vi.fn(() => ({
      config,
      source: 'archive',
      year: '2025',
    })),
    selectProgramItems: vi.fn(() => []),
  });
  resetDom(`
    <div data-program-directory>
      <p data-program-status></p>
      <div data-program-sections></div>
      <div data-program-templates></div>
    </div>
  `);
  await importFreshSrcModule('program-directory.js');
  await flushPromises();
  assert.equal(document.querySelector('[data-program-sections] p').hidden, false);

  installProgramGlobals({
    loadProgram: vi.fn(() => Promise.reject(new Error('offline'))),
    parseProgramListRoute: vi.fn(() => ({
      config,
      source: 'archive',
      year: '2025',
    })),
  });
  resetDom(`
    <div data-program-directory>
      <p data-program-status></p>
      <div data-program-sections></div>
      <div data-program-templates></div>
    </div>
  `);
  await importFreshSrcModule('program-directory.js');
  await flushPromises();
  assert.equal(
    document.querySelector('[data-program-status]').textContent,
    'Workshops unavailable.',
  );
});

test('program detail page handles invalid routes, missing names, load errors, and not found items', async () => {
  installProgramGlobals({
    parseProgramDetailRoute: vi.fn(() => null),
  });
  resetDom(
    '<div data-program-detail><p data-program-detail-title></p><div data-program-detail-content></div></div>',
  );
  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  assert.match(
    document.querySelector('[data-program-detail-content]').textContent,
    /route is not recognized/,
  );

  installProgramGlobals({
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'conference',
      type: 'speaker',
      year: '2026',
    })),
  });
  resetDom(
    '<div data-program-detail><p data-program-detail-title></p><div data-program-detail-content></div></div>',
    'https://www.pnsqc.org/conference/2026/speaker',
  );
  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  assert.match(
    document.querySelector('[data-program-detail-content]').textContent,
    /name query parameter/,
  );

  installProgramGlobals({
    loadProgram: vi.fn(() =>
      Promise.resolve({ speakerBySlug: new Map(), presentationBySlug: new Map() }),
    ),
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'conference',
      type: 'speaker',
      year: '2026',
    })),
  });
  resetDom(
    '<div data-program-detail><p data-program-detail-title></p><div data-program-detail-content></div></div>',
    'https://www.pnsqc.org/conference/2026/speaker?name=missing',
  );
  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  assert.match(
    document.querySelector('[data-program-detail-content]').textContent,
    /No speaker matched/,
  );

  installProgramGlobals({
    loadProgram: vi.fn(() => Promise.reject(new Error('offline'))),
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'archive',
      type: 'presentation',
      year: '2025',
    })),
  });
  resetDom(
    '<div data-program-detail><p data-program-detail-title></p><div data-program-detail-content></div></div>',
    'https://www.pnsqc.org/archive/2025/presentation?name=paper',
  );
  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  assert.match(
    document.querySelector('[data-program-detail-content]').textContent,
    /not available right now/,
  );
});

test('program detail page renders and hydrates conference speakers and presentations', async () => {
  const speaker = {
    slug: 'paper-speaker',
    name: 'Paper Speaker',
    profession: '',
    bio: '',
    bioHtml: '',
    presentations: [
      {
        id: 'sub-1',
        title: 'Lazy Paper',
        presentationType: 'paper',
        submissionId: 'sub-1',
        abstractHtml: '',
        speakers: [{ name: 'Paper Speaker', bio: '', bioHtml: '' }],
      },
    ],
  };
  const { data } = installProgramGlobals({
    loadProgram: vi.fn(() =>
      Promise.resolve({
        presentationBySlug: new Map(),
        speakerBySlug: new Map([['paper-speaker', speaker]]),
      }),
    ),
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'conference',
      type: 'speaker',
      year: '2026',
    })),
  });
  resetDom(
    `
      <div data-program-detail data-program-detail-fallback-avatar="/configured.jpg">
        <p data-program-detail-status></p>
        <p data-program-detail-eyebrow></p>
        <h1 data-program-detail-title></h1>
        <p data-program-detail-subtitle></p>
        <div data-program-detail-content></div>
      </div>
    `,
    'https://www.pnsqc.org/conference/2026/speaker?name=paper-speaker',
  );
  document.title = 'Program Details - PNSQC';

  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  await flushPromises();

  assert.equal(data.loadMeetingHandSubmission.mock.calls[0][0].id, 'sub-1');
  assert.equal(data.mergeMeetingHandSubmissionDetailIntoSpeaker.mock.calls.length, 1);
  assert.equal(document.querySelector('[data-program-detail-title]').textContent, 'Paper Speaker');
  assert.equal(document.querySelector('[data-program-detail-subtitle]').textContent, 'Lazy Paper');
  assert.equal(document.title, 'Paper Speaker - 2026 - Conference - PNSQC');
  assert.match(
    document.querySelector('[data-program-detail-content]').textContent,
    /Speaker details/,
  );

  const presentation = {
    slug: 'panel',
    title: 'Panel Title',
    presentationType: 'panel',
    submissionId: 'panel-sub-2',
    abstractHtml: '',
    speakers: [{ name: 'Speaker One', bio: '', bioHtml: '' }],
  };
  const { data: panelDetailData } = installProgramGlobals({
    loadProgram: vi.fn(() =>
      Promise.resolve({
        presentationBySlug: new Map([['panel', presentation]]),
        speakerBySlug: new Map(),
      }),
    ),
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'conference',
      type: 'presentation',
      year: '2026',
    })),
  });
  resetDom(
    `
      <div data-program-detail>
        <p data-program-detail-status></p>
        <p data-program-detail-eyebrow></p>
        <h1 data-program-detail-title></h1>
        <p data-program-detail-subtitle></p>
        <div data-program-detail-content></div>
      </div>
    `,
    'https://www.pnsqc.org/conference/2026/presentation?name=panel',
  );
  document.title = 'Program Details - PNSQC';

  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();
  await flushPromises();

  assert.equal(panelDetailData.loadMeetingHandSubmission.mock.calls[0][0].id, 'panel-sub-2');
  assert.equal(document.querySelector('[data-program-detail-title]').textContent, 'Panel Title');
  assert.equal(document.querySelector('[data-program-detail-subtitle]').textContent, 'Speaker One');
  assert.equal(document.title, 'Panel Title - 2026 - Conference - PNSQC');
});

test('program detail page leaves archive details unhydrated and hides empty subtitles', async () => {
  const speaker = {
    slug: 'archive-speaker',
    name: 'Archive Speaker',
    profession: 'Archived Role',
    presentations: [],
  };
  const { data } = installProgramGlobals({
    loadProgram: vi.fn(() =>
      Promise.resolve({
        presentationBySlug: new Map(),
        speakerBySlug: new Map([['archive-speaker', speaker]]),
      }),
    ),
    parseProgramDetailRoute: vi.fn(() => ({
      source: 'archive',
      type: 'speaker',
      year: '2025',
    })),
  });
  resetDom(
    `
      <div data-program-detail>
        <p data-program-detail-status></p>
        <p data-program-detail-eyebrow></p>
        <h1 data-program-detail-title></h1>
        <p data-program-detail-subtitle></p>
        <div data-program-detail-content></div>
      </div>
    `,
    'https://www.pnsqc.org/archive/2025/speaker?name=archive-speaker',
  );

  await importFreshSrcModule('program-detail-page.js');
  await flushPromises();

  assert.equal(data.loadMeetingHandSubmission.mock.calls.length, 0);
  assert.equal(
    document.querySelector('[data-program-detail-subtitle]').textContent,
    'Archived Role',
  );
  assert.equal(document.title, 'Archive Speaker - 2025 - Archive - PNSQC');
});
