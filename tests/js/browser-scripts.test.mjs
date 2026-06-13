// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import { deferred, flushPromises, importFreshSrcModule, resetDom } from '../helpers/jsdom.mjs';

beforeEach(() => {
  resetDom();
  delete window.PNSQCModal;
  delete window.PNSQCProgramData;
  delete window.PNSQCProgramRenderer;
  delete window.PNSQCSlugs;
  delete window.PNSQCProgram;
  delete window.PNSQCProgramSchedule;
  vi.useRealTimers();
});

test('countdown ignores missing and invalid countdown nodes', async () => {
  await importFreshSrcModule('countdown.js');

  resetDom('<div data-countdown data-countdown-stages="not-json"></div>');
  await importFreshSrcModule('countdown.js');

  resetDom('<div data-countdown data-countdown-deadline="not-a-date"></div>');
  await importFreshSrcModule('countdown.js');

  assert.ok(true);
});

test('countdown renders fallback deadlines, active stages, screen reader copy, and expired states', async () => {
  vi.useFakeTimers();
  resetDom(`
    <div data-countdown data-countdown-deadline="2026-06-02T11:02:03Z">
      <span data-countdown-label></span>
      <time data-countdown-date></time>
      <b data-countdown-days></b>
      <b data-countdown-hours></b>
      <b data-countdown-minutes></b>
      <b data-countdown-seconds></b>
      <span data-countdown-sr></span>
    </div>
  `);
  vi.setSystemTime(new Date('2026-06-01T10:00:00Z'));

  await importFreshSrcModule('countdown.js');

  assert.equal(document.querySelector('[data-countdown-days]').textContent, '1');
  assert.equal(document.querySelector('[data-countdown-hours]').textContent, '01');
  assert.equal(document.querySelector('[data-countdown-minutes]').textContent, '02');
  assert.equal(document.querySelector('[data-countdown-seconds]').textContent, '03');
  assert.match(document.querySelector('[data-countdown-sr]').textContent, /1 day, 1 hour/);

  const previousSr = document.querySelector('[data-countdown-sr]').textContent;
  vi.advanceTimersByTime(1000);
  assert.equal(document.querySelector('[data-countdown-sr]').textContent, previousSr);

  vi.setSystemTime(new Date('2026-06-03T10:00:00Z'));
  vi.advanceTimersByTime(1000);
  assert.equal(
    document.querySelector('[data-countdown-label]').textContent,
    'Deadline has passed.',
  );
  assert.equal(document.querySelector('[data-countdown-date]').hidden, true);
  assert.equal(document.querySelector('[data-countdown-days]').textContent, '0');
});

test('countdown sorts JSON stages and updates stage metadata', async () => {
  vi.useFakeTimers();
  resetDom(`
    <div
      data-countdown
      data-countdown-expired-text="Done."
      data-countdown-stages='[
        {
          "deadline": "2026-06-03T10:00:00Z",
          "label": "Late:",
          "timeText": "June 3",
          "timeDateTime": "2026-06-03",
          "srLabel": "Late:"
        },
        {
          "deadline": "2026-06-02T10:00:00Z",
          "label": "Early",
          "timeText": "June 2"
        },
        { "deadline": "bad" }
      ]'
    >
      <span data-countdown-label></span>
      <time data-countdown-date datetime="old"></time>
      <b data-countdown-days></b>
      <b data-countdown-hours></b>
      <b data-countdown-minutes></b>
      <b data-countdown-seconds></b>
      <span data-countdown-sr></span>
    </div>
  `);
  vi.setSystemTime(new Date('2026-06-01T10:00:00Z'));

  await importFreshSrcModule('countdown.js');

  assert.equal(document.querySelector('[data-countdown-label]').textContent, 'Early');
  assert.equal(document.querySelector('[data-countdown-date]').textContent, 'June 2');
  assert.equal(document.querySelector('[data-countdown-date]').hasAttribute('datetime'), false);

  vi.setSystemTime(new Date('2026-06-02T10:00:01Z'));
  vi.advanceTimersByTime(1000);
  assert.equal(document.querySelector('[data-countdown-label]').textContent, 'Late:');
  assert.equal(
    document.querySelector('[data-countdown-date]').getAttribute('datetime'),
    '2026-06-03',
  );
  assert.match(document.querySelector('[data-countdown-sr]').textContent, /until Late\./);

  vi.setSystemTime(new Date('2026-06-04T10:00:00Z'));
  vi.advanceTimersByTime(1000);
  assert.equal(document.querySelector('[data-countdown-label]').textContent, 'Done.');
});

test('pricing-period highlights the active column, badges, and summary copy', async () => {
  vi.useFakeTimers();
  resetDom(`
    <span data-pricing-period-badge class="hidden"></span>
    <table class="pricing-table">
      <tbody>
        <tr><td>Type</td><td>Super</td><td>Early</td><td>Regular</td></tr>
        <tr><td>Member</td><td>$1</td><td>$2</td><td>$3</td></tr>
      </tbody>
    </table>
  `);
  vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));

  await importFreshSrcModule('pricing-period.js');

  assert.equal(
    document.querySelector('[data-pricing-period-badge]').textContent,
    'Super Early Bird pricing ends June 30',
  );
  assert.equal(
    document.querySelector('[data-pricing-period-badge]').classList.contains('inline-flex'),
    true,
  );
  assert.equal(document.querySelectorAll('.active-pricing-period').length, 2);
  assert.match(document.querySelector('.pricing-period-summary').textContent, /save up to \$320/);
});

test('pricing-period handles regular pricing and missing pricing tables', async () => {
  vi.useFakeTimers();
  resetDom(`
    <span data-pricing-period-badge></span>
    <table class="pricing-table"><tbody><tr><td>A</td><td>B</td><td>C</td><td>D</td></tr></tbody></table>
  `);
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
  await importFreshSrcModule('pricing-period.js');
  assert.match(
    document.querySelector('.pricing-period-summary').textContent,
    /sales end October 11/,
  );
  assert.equal(
    document.querySelector('[data-pricing-period-badge]').textContent,
    'sales end October 11',
  );

  resetDom('<span data-pricing-period-badge>unchanged</span>');
  await importFreshSrcModule('pricing-period.js');
  assert.equal(document.querySelector('[data-pricing-period-badge]').textContent, 'unchanged');
});

test('pricing-period hides badges when Date construction is invalid', async () => {
  const RealDate = Date;
  vi.stubGlobal(
    'Date',
    class InvalidDefaultDate extends RealDate {
      constructor(...args) {
        if (args.length > 0) return new RealDate(...args);
        return new RealDate('not-a-date');
      }
    },
  );
  resetDom(`
    <span data-pricing-period-badge class="inline-flex">Visible</span>
    <table class="pricing-table"><tbody><tr><td>A</td><td>B</td><td>C</td><td>D</td></tr></tbody></table>
  `);

  await importFreshSrcModule('pricing-period.js');

  assert.equal(document.querySelector('[data-pricing-period-badge]').textContent, '');
  assert.equal(
    document.querySelector('[data-pricing-period-badge]').classList.contains('hidden'),
    true,
  );
  assert.equal(
    document.querySelector('[data-pricing-period-badge]').classList.contains('inline-flex'),
    false,
  );
});

test('details modal exposes helpers, creates shells, opens templates, and closes through each control', async () => {
  resetDom(`
    <template id="details-template"><p>Template body</p></template>
    <button id="trigger" data-details-modal-open="details-template" data-details-modal-title="Presentation Title" data-details-modal-label="Presentation" data-details-modal-subtitle="Quality Engineering & Systems Reliability">Open</button>
  `);

  await importFreshSrcModule('details-modal.js');

  const modal = document.querySelector('[data-details-modal]');
  const trigger = document.getElementById('trigger');
  assert.ok(modal);
  assert.equal(typeof window.PNSQCModal.createModalController, 'function');
  assert.equal(window.PNSQCModal.createModalController({ missing: null }), null);

  trigger.focus();
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  assert.equal(modal.classList.contains('hidden'), false);
  assert.equal(document.body.classList.contains('overflow-hidden'), true);
  assert.equal(modal.querySelector('[data-details-modal-title]').textContent, 'Presentation Title');
  assert.equal(
    modal.querySelector('[data-details-modal-subtitle]').textContent,
    'Quality Engineering & Systems Reliability',
  );
  assert.equal(modal.querySelector('[data-details-modal-subtitle]').hidden, false);
  assert.equal(modal.querySelector('[data-details-modal-body]').textContent, 'Template body');

  modal.querySelector('[data-details-modal-close]').click();
  assert.equal(modal.classList.contains('hidden'), true);
  assert.equal(trigger, document.activeElement);

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  modal.querySelector('[data-details-modal-backdrop]').click();
  assert.equal(modal.classList.contains('hidden'), true);

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(modal.classList.contains('hidden'), true);

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  modal.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  assert.equal(modal.classList.contains('hidden'), true);
});

test('details modal preserves an existing modal and ignores missing templates/non-elements', async () => {
  resetDom(`
    <div class="hidden" data-details-modal>
      <div data-details-modal-backdrop></div>
      <div data-details-modal-panel>
        <p data-details-modal-label></p>
        <h3 data-details-modal-title></h3>
        <button data-details-modal-close></button>
        <div data-details-modal-body></div>
      </div>
    </div>
    <button id="missing" data-details-modal-open="missing"></button>
  `);

  await importFreshSrcModule('details-modal.js');

  document.getElementById('missing').click();
  assert.equal(document.querySelector('[data-details-modal]').classList.contains('hidden'), true);

  document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(document.querySelectorAll('[data-details-modal]').length, 1);
});

test('details modal shell creation returns null without a document body', async () => {
  const originalBody = document.body;
  Object.defineProperty(document, 'body', {
    configurable: true,
    value: null,
  });

  try {
    await importFreshSrcModule('details-modal.js');
    assert.equal(window.PNSQCModal.createDetailsModalShell(), null);
  } finally {
    Object.defineProperty(document, 'body', {
      configurable: true,
      value: originalBody,
    });
  }
});

test('substack subscribe posts encoded form data, toggles loading, and handles failures', async () => {
  const firstRequest = deferred();
  const requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input, init) => {
      requests.push({ input, init });
      return firstRequest.promise;
    }),
  );
  resetDom(
    `
      <div>
        <form data-substack-form target="_blank">
          <input name="email" value=" reader@example.com ">
          <button type="submit">Join</button>
        </form>
        <p data-substack-msg>Default copy</p>
      </div>
    `,
    'https://www.pnsqc.org/newsletter/?source=test',
  );

  await importFreshSrcModule('substack-subscribe.js');

  const form = document.querySelector('[data-substack-form]');
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  assert.equal(form.hasAttribute('target'), false);

  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(button.disabled, true);
  assert.equal(input.disabled, true);
  assert.equal(button.textContent, 'Subscribing\u2026');

  firstRequest.resolve({});
  await flushPromises();

  assert.equal(requests[0].input, 'https://newsletter.pnsqc.org/api/v1/free');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.mode, 'no-cors');
  assert.equal(
    String(requests[0].init.body),
    'email=reader%40example.com&first_url=https%3A%2F%2Fwww.pnsqc.org%2Fnewsletter%2F%3Fsource%3Dtest&first_referrer=',
  );
  assert.equal(input.value, '');
  assert.equal(button.disabled, false);
  assert.match(document.querySelector('[data-substack-msg]').textContent, /Thanks/);
  assert.equal(
    document.querySelector('[data-substack-msg]').classList.contains('text-pnsqc-cyan'),
    true,
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  );
  input.value = 'again@example.com';
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await flushPromises();
  assert.match(document.querySelector('[data-substack-msg]').textContent, /Network error/);
  assert.equal(
    document.querySelector('[data-substack-msg]').classList.contains('text-red-400'),
    true,
  );

  input.value = '   ';
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(fetch.mock.calls.length, 1);
});

test('substack subscribe ignores incomplete forms', async () => {
  resetDom('<form data-substack-form><input name="email"></form>');
  await importFreshSrcModule('substack-subscribe.js');
  document.querySelector('form').dispatchEvent(new SubmitEvent('submit', { bubbles: true }));
  assert.ok(true);
});

test('sponsor directory renders sorted sponsor cards, sanitized templates, links, and fallbacks', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              sponsors: [
                {
                  name: 'Gold',
                  size: 'L',
                  sponsors: [
                    {
                      id: 'same-order',
                      order: 1,
                      title: 'Aardvark Sponsor',
                      logo: 'http://%',
                      website: 'not a url',
                      description: '\u00a0   ',
                    },
                    {
                      id: 'two/id',
                      order: 2,
                      title: 'Beta Sponsor',
                      logo: 'javascript:bad',
                      website: 'https://beta.example/path',
                      linkedin: 'https://linkedin.example/beta',
                      description:
                        '<p onclick="bad()">Beta <strong>description</strong></p><script>bad()</script>',
                    },
                    {
                      id: 'one',
                      order: 1,
                      name: 'Alpha Sponsor',
                      logo: 'https://alpha.example/logo.png',
                      description: 'Line one\nLine two\n\nSecond paragraph',
                    },
                  ],
                },
                { name: 'Community', size: 'bad', sponsors: [] },
              ],
            },
          }),
      }),
    ),
  );
  resetDom(`
    <div data-sponsor-directory data-sponsor-endpoint="/api/sponsors" data-sponsor-fallback-logo="/fallback.jpg">
      <p data-sponsor-status></p>
      <section data-sponsor-tier="Gold" data-sponsor-default-size="S">
        <div data-sponsor-grid></div>
        <p data-sponsor-empty hidden>Empty</p>
      </section>
      <section data-sponsor-tier="Community" data-sponsor-default-size="M">
        <div data-sponsor-grid></div>
        <p data-sponsor-empty hidden>Empty</p>
      </section>
      <div data-sponsor-templates></div>
    </div>
  `);

  await importFreshSrcModule('sponsor-directory.js');
  await flushPromises();

  const root = document.querySelector('[data-sponsor-directory]');
  const goldGrid = root.querySelector('[data-sponsor-tier="Gold"] [data-sponsor-grid]');
  assert.equal(root.querySelector('[data-sponsor-status]').hidden, true);
  assert.equal(goldGrid.children.length, 3);
  assert.equal(goldGrid.children[0].textContent, 'Aardvark Sponsor');
  assert.equal(goldGrid.children[1].textContent, 'Alpha Sponsor');
  assert.equal(goldGrid.className, 'flex flex-wrap justify-center gap-6');
  assert.equal(
    root.querySelector('[data-sponsor-tier="Community"] [data-sponsor-empty]').hidden,
    false,
  );

  const betaTemplate = document.getElementById('details-modal-template-sponsor-two-id');
  assert.ok(betaTemplate);
  assert.equal(betaTemplate.innerHTML.includes('onclick'), false);
  assert.equal(betaTemplate.innerHTML.includes('<script'), false);
  assert.equal(
    betaTemplate.content.querySelector('a[href="https://beta.example/path"]').rel,
    'noopener noreferrer',
  );
  assert.equal(betaTemplate.content.querySelector('img').getAttribute('src'), '/fallback.jpg');

  const alphaTemplate = document.getElementById('details-modal-template-sponsor-one');
  assert.equal(alphaTemplate.content.querySelectorAll('.rich-content p').length, 2);
  assert.match(
    document.getElementById('details-modal-template-sponsor-same-order').content.textContent,
    /Sponsor details are coming soon/,
  );
});

test('sponsor directory handles absent roots, missing endpoints, non-ok responses, and rejected fetches', async () => {
  resetDom();
  await importFreshSrcModule('sponsor-directory.js');

  resetDom('<div data-sponsor-directory><p data-sponsor-status></p></div>');
  await importFreshSrcModule('sponsor-directory.js');
  assert.equal(document.querySelector('[data-sponsor-status]').textContent, '');

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false })),
  );
  resetDom(`
    <div data-sponsor-directory data-sponsor-endpoint="/api/sponsors">
      <p data-sponsor-status></p>
      <section data-sponsor-tier="Gold"><div data-sponsor-grid><span>Old</span></div><p data-sponsor-empty hidden>Empty</p></section>
    </div>
  `);
  await importFreshSrcModule('sponsor-directory.js');
  await flushPromises();
  assert.equal(
    document.querySelector('[data-sponsor-status]').textContent,
    'Sponsors will be announced soon.',
  );
  assert.equal(document.querySelector('[data-sponsor-empty]').hidden, false);
  assert.equal(document.querySelector('[data-sponsor-grid]').children.length, 0);

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  );
  resetDom(`
    <div data-sponsor-directory data-sponsor-endpoint="/api/sponsors">
      <p data-sponsor-status></p>
      <section data-sponsor-tier="Gold"><div data-sponsor-grid></div><p data-sponsor-empty hidden>Empty</p></section>
    </div>
  `);
  await importFreshSrcModule('sponsor-directory.js');
  await flushPromises();
  assert.equal(
    document.querySelector('[data-sponsor-status]').textContent,
    'Sponsors will be announced soon.',
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false })),
  );
  resetDom(`
    <div data-sponsor-directory data-sponsor-endpoint="/api/sponsors">
      <section data-sponsor-tier="Gold"><div data-sponsor-grid></div><p data-sponsor-empty hidden>Empty</p></section>
    </div>
  `);
  await importFreshSrcModule('sponsor-directory.js');
  await flushPromises();
  assert.equal(document.querySelector('[data-sponsor-empty]').hidden, false);
});
