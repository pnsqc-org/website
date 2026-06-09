// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import { importFreshSrcModule, resetDom } from '../helpers/jsdom.mjs';

function setElementSize(element, values) {
  Object.entries(values).forEach(([key, value]) => {
    Object.defineProperty(element, key, {
      configurable: true,
      get: typeof value === 'function' ? value : () => value,
    });
  });
}

function buildSlide({
  end,
  imageAlt = 'Event image',
  imageUrl = 'https://events.example/image.jpg',
  start,
  title,
}) {
  return `
    <article
      data-carousel-slide
      data-event-start="${start}"
      data-event-end="${end}"
      data-event-image-url="${imageUrl}"
      data-event-image-alt="${imageAlt}"
    >
      <h3 data-event-title>${title}</h3>
      <span data-event-upcoming-badge>Upcoming</span>
      <span data-event-past-badge>Past</span>
      <div data-event-modal-meta><p>Meta ${title}</p></div>
      <div data-event-description-preview>
        <div data-event-description-preview-content></div>
      </div>
      <div data-event-description-content hidden>
        <p>Long ${title} description with enough words to force truncation.</p>
        <ul><li>First point</li><li>Second point</li></ul>
      </div>
      <button data-event-description-open>Show Details</button>
    </article>
  `;
}

beforeEach(() => {
  resetDom();
  vi.useRealTimers();
});

function stubAnimationFrameAndMotion(matches = false) {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      callback();
      return 1;
    }),
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
    })),
  );
}

test('recent events carousel syncs event state, controls, dots, featured images, previews, and modals', async () => {
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  vi.useFakeTimers();
  const opened = [];
  let resizeCallback;
  class FakeResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
    }

    observe(element) {
      this.element = element;
    }
  }
  resetDom(`
    <span data-events-menu-status-dot></span>
    <span data-events-menu-status-sr></span>
    <div data-event-description-modal></div>
    <section data-carousel="recent-events">
      <img data-event-featured-image src="/fallback.jpg" alt="Fallback" data-fallback-src="/fallback.jpg" data-fallback-alt="Fallback alt">
      <button data-carousel-prev>Previous</button>
      <button data-carousel-next>Next</button>
      <div data-carousel-track tabindex="0">
        ${buildSlide({
          end: '2026-06-02T12:00:00Z',
          start: '2026-06-02T10:00:00Z',
          title: 'Upcoming Event',
        })}
        ${buildSlide({
          end: '2026-05-01T12:00:00Z',
          imageAlt: '',
          imageUrl: 'https://events.example/past.jpg',
          start: '2026-05-01T10:00:00Z',
          title: 'Past Event',
        })}
      </div>
      <div data-carousel-dots></div>
    </section>
  `);
  stubAnimationFrameAndMotion(false);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  window.PNSQCModal = {
    createModalControllerFromRoot: vi.fn(() => ({
      openModal(config) {
        opened.push(config);
      },
    })),
  };
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));

  const track = document.querySelector('[data-carousel-track]');
  const previews = document.querySelectorAll('[data-event-description-preview]');
  setElementSize(track, { clientWidth: 300 });
  previews.forEach((preview) => {
    setElementSize(preview, {
      clientHeight: 20,
      scrollHeight: () => (preview.textContent.length > 24 ? 40 : 20),
    });
  });
  track.scrollTo = vi.fn(({ left }) => {
    track.scrollLeft = left;
  });

  await importFreshSrcModule('recent-events-carousel.js');

  const slides = document.querySelectorAll('[data-carousel-slide]');
  const image = document.querySelector('[data-event-featured-image]');
  const prev = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  const dots = document.querySelectorAll('[data-carousel-dots] button');

  assert.equal(slides[0].dataset.eventState, 'upcoming');
  assert.equal(slides[0].querySelector('[data-event-upcoming-badge]').hidden, false);
  assert.equal(slides[1].dataset.eventState, 'past');
  assert.equal(slides[1].querySelector('[data-event-past-badge]').hidden, false);
  assert.equal(
    document
      .querySelector('[data-events-menu-status-dot]')
      .classList.contains('event-status--active'),
    true,
  );
  assert.equal(document.querySelector('[data-events-menu-status-sr]').textContent, 'Active events');
  assert.equal(dots.length, 2);
  assert.equal(dots[0].getAttribute('aria-current'), 'true');
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, false);
  assert.equal(image.dataset.currentSrc, 'https://events.example/image.jpg');
  assert.match(
    slides[0].querySelector('[data-event-description-preview-content]').textContent,
    /\.\.\.$/,
  );

  next.click();
  assert.equal(track.scrollTo.mock.calls.at(-1)[0].left, 300);
  track.dispatchEvent(new Event('scroll'));
  assert.equal(image.dataset.currentSrc, 'https://events.example/past.jpg');
  assert.equal(image.alt, 'Fallback alt');
  assert.equal(prev.disabled, false);
  assert.equal(next.disabled, true);
  assert.equal(dots[1].getAttribute('aria-current'), 'true');

  image.dispatchEvent(new Event('error'));
  assert.equal(image.dataset.currentSrc, '/fallback.jpg');
  assert.equal(image.alt, 'Fallback alt');

  dots[0].click();
  assert.equal(track.scrollTo.mock.calls.at(-1)[0].left, 0);

  track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  assert.equal(track.scrollTo.mock.calls.at(-1)[0].left, 300);
  track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

  slides[0]
    .querySelector('[data-event-description-open]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].title, 'Upcoming Event');
  assert.equal(opened[0].label, 'Upcoming Meetup Event');
  assert.match(opened[0].content.textContent, /Full Description/);

  resizeCallback();
  assert.equal(track.scrollTo.mock.calls.length > 0, true);
});

test('recent events carousel handles reduced motion, invalid dates, no modal controller, missing images, one slide, and no track', async () => {
  resetDom(`
    <span data-events-menu-status-dot></span>
    <span data-events-menu-status-sr></span>
    <section data-carousel="recent-events">
      <button data-carousel-prev>Previous</button>
      <button data-carousel-next>Next</button>
      <div data-carousel-track>
        <article data-carousel-slide data-event-start="" data-event-end="not-a-date">
          <h3 data-event-title>Single Event</h3>
          <span data-event-upcoming-badge>Upcoming</span>
          <span data-event-past-badge>Past</span>
          <div data-event-description-preview>
            <div data-event-description-preview-content></div>
          </div>
          <div data-event-description-content hidden></div>
          <button data-event-description-open>Show Details</button>
        </article>
      </div>
      <div data-carousel-dots>Old</div>
    </section>
    <section data-carousel="recent-events">
      <div data-carousel-track>
        <article data-carousel-slide data-event-start="" data-event-end="">
          <div data-event-description-preview>
            <div data-event-description-preview-content></div>
          </div>
          <div data-event-description-content hidden><p>Missing button</p></div>
        </article>
      </div>
    </section>
    <section data-carousel="recent-events">
      <div data-carousel-slide></div>
    </section>
  `);
  stubAnimationFrameAndMotion(true);
  window.PNSQCModal = {
    createModalControllerFromRoot: vi.fn(() => null),
  };
  document.querySelectorAll('[data-event-description-preview]').forEach((preview) =>
    setElementSize(preview, {
      clientHeight: 20,
      scrollHeight: 40,
    }),
  );

  await importFreshSrcModule('recent-events-carousel.js');

  assert.equal(
    document
      .querySelector('[data-events-menu-status-dot]')
      .classList.contains('event-status--inactive'),
    true,
  );
  assert.equal(
    document.querySelector('[data-events-menu-status-sr]').textContent,
    'No active events',
  );
  assert.equal(document.querySelector('[data-carousel-prev]').disabled, true);
  assert.equal(document.querySelector('[data-carousel-next]').disabled, true);
  assert.equal(document.querySelector('[data-carousel-dots]').innerHTML, '');

  document
    .querySelector('[data-event-description-open]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(window.PNSQCModal.createModalControllerFromRoot.mock.calls.length, 1);
});
