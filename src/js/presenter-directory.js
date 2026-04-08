(() => {
  const directoryRoot = document.querySelector('[data-presenter-directory]');
  if (!directoryRoot) return;

  const endpoint = directoryRoot.getAttribute('data-presenter-endpoint');
  if (!endpoint) return;

  const fallbackAvatar =
    directoryRoot.getAttribute('data-presenter-fallback-avatar') || '/images/brand/pnsqc-logo.jpg';
  const statusEl = directoryRoot.querySelector('[data-presenter-status]');
  const templateRoot = directoryRoot.querySelector('[data-presenter-templates]') || directoryRoot;
  const defaultSectionEl = directoryRoot.querySelector('[data-presenter-default-section]');

  const sections = new Map();
  directoryRoot.querySelectorAll('[data-presenter-category-id]').forEach((section) => {
    const idValue = Number(section.getAttribute('data-presenter-category-id'));
    const grid = section.querySelector('[data-presenter-grid]');
    const emptyState = section.querySelector('[data-presenter-empty]');
    const title = section.querySelector('[data-presenter-category-title]');
    if (!Number.isNaN(idValue) && grid) {
      sections.set(idValue, { grid, emptyState, title });
    }
  });

  const defaultSection =
    defaultSectionEl && defaultSectionEl.querySelector('[data-presenter-grid]')
      ? {
          grid: defaultSectionEl.querySelector('[data-presenter-grid]'),
          emptyState: defaultSectionEl.querySelector('[data-presenter-empty]'),
          title: defaultSectionEl.querySelector('[data-presenter-category-title]'),
        }
      : null;
  const usesDefaultSection = Boolean(defaultSection);
  const defaultSectionKey = '__default__';

  const createEl = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === 'string') el.textContent = text;
    return el;
  };

  const normalizeSpace = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
  };

  const loadingText =
    normalizeSpace(directoryRoot.getAttribute('data-presenter-loading-text')) ||
    normalizeSpace(statusEl?.textContent || '') ||
    'Loading presenters...';
  const errorText =
    normalizeSpace(directoryRoot.getAttribute('data-presenter-error-text')) ||
    'Presenters will be announced soon.';
  const requestedPresentationDate = normalizeSpace(
    directoryRoot.getAttribute('data-presenter-presentation-date'),
  );
  const excludedPresentationDate = normalizeSpace(
    directoryRoot.getAttribute('data-presenter-exclude-presentation-date'),
  );
  const defaultCategoryLabel =
    normalizeSpace(directoryRoot.getAttribute('data-presenter-default-label')) || 'Presenter';

  const normalizeCompareText = (value) => normalizeSpace(value).replace(/:\s*$/, '').toLowerCase();
  const abstractMapCache = new WeakMap();

  const extractDateKey = (value) => {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  };

  const presentationDateFilter = extractDateKey(requestedPresentationDate);
  const excludedPresentationDateFilter = extractDateKey(excludedPresentationDate);

  const sanitizeHtmlFragment = (value) => {
    if (!value) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(String(value), 'text/html');

    const sanitizeNode = (node) => {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE) {
        const textValue = node.textContent || '';
        if (!textValue.trim()) return null;
        return document.createTextNode(textValue.replace(/\u00a0/g, ' '));
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const tag = node.tagName.toLowerCase();
      const allowed = ['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br'];
      if (!allowed.includes(tag)) {
        const fragment = document.createDocumentFragment();
        Array.from(node.childNodes).forEach((child) => {
          const cleaned = sanitizeNode(child);
          if (cleaned) fragment.appendChild(cleaned);
        });
        return fragment.childNodes.length ? fragment : null;
      }

      const copy = document.createElement(tag);
      Array.from(node.childNodes).forEach((child) => {
        const cleanedChild = sanitizeNode(child);
        if (cleanedChild) copy.appendChild(cleanedChild);
      });
      return copy;
    };

    const wrapper = document.createElement('div');
    Array.from(doc.body.childNodes).forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) wrapper.appendChild(cleaned);
    });

    return wrapper.innerHTML.trim();
  };

  const getPresenterDetails = (presenter) => {
    if (!presenter || typeof presenter !== 'object') return {};
    const numericKey = Object.keys(presenter).find((key) => /^\d+$/.test(key));
    if (numericKey && presenter[numericKey]) return presenter[numericKey];
    if (presenter.details && typeof presenter.details === 'object') return presenter.details;
    return {};
  };

  const getPresenterName = (presenter) =>
    `${presenter?.firstname || ''} ${presenter?.lastname || ''}`.trim() || 'Presenter';

  const getPresentations = (details) =>
    (Array.isArray(details?.presentations) ? details.presentations : []).filter(Boolean);

  const getSessionRecord = (presentation) => presentation?.session?.session || null;

  const getPresentationDateKey = (presentation) =>
    extractDateKey(getSessionRecord(presentation)?.day?.date);

  const comparePresentations = (left, right) => {
    const leftDate = getPresentationDateKey(left);
    const rightDate = getPresentationDateKey(right);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate !== rightDate) return leftDate ? -1 : 1;

    const leftStart = normalizeSpace(getSessionRecord(left)?.start || '');
    const rightStart = normalizeSpace(getSessionRecord(right)?.start || '');
    if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);

    const leftOrder = Number(left?.session?.order ?? left?.order ?? Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(right?.session?.order ?? right?.order ?? Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return normalizeSpace(left?.title || '').localeCompare(normalizeSpace(right?.title || ''));
  };

  const getSortedPresentations = (details) =>
    getPresentations(details).slice().sort(comparePresentations);

  const getEligiblePresentations = (details) => {
    let presentations = getSortedPresentations(details);
    if (excludedPresentationDateFilter) {
      presentations = presentations.filter(
        (presentation) => getPresentationDateKey(presentation) !== excludedPresentationDateFilter,
      );
    }
    if (!presentationDateFilter) return presentations;
    return presentations.filter(
      (presentation) => getPresentationDateKey(presentation) === presentationDateFilter,
    );
  };

  const getPresenterDisplayState = (details) => {
    const presentations = getPresentations(details);
    const eligiblePresentations = getEligiblePresentations(details);
    const displayPresentation = eligiblePresentations[0] || null;

    if (presentationDateFilter) {
      return { displayPresentation, shouldDisplay: eligiblePresentations.length > 0 };
    }
    if (excludedPresentationDateFilter && presentations.length > 0) {
      return { displayPresentation, shouldDisplay: eligiblePresentations.length > 0 };
    }
    return { displayPresentation, shouldDisplay: true };
  };

  const getPresentationTitle = (presentation) => presentation?.title || 'Presentation TBA';

  const extractAbstractMap = (session) => {
    if (session && abstractMapCache.has(session)) {
      return abstractMapCache.get(session);
    }

    const html = session?.description;
    const map = new Map();
    if (!html || typeof html !== 'string') {
      if (session) abstractMapCache.set(session, map);
      return map;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const children = Array.from(doc.body.children);

    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      const titleText = normalizeCompareText(node.textContent || '');
      if (!titleText) continue;

      let blockquote = null;
      for (let j = i + 1; j < children.length; j += 1) {
        const next = children[j];
        if (next.tagName && next.tagName.toLowerCase() === 'blockquote') {
          blockquote = next;
          break;
        }
        if (normalizeCompareText(next.textContent || '') !== '') break;
      }

      if (!blockquote) continue;

      const abstractHtml = sanitizeHtmlFragment(blockquote.innerHTML);
      if (abstractHtml) map.set(titleText, abstractHtml);
    }

    if (session) abstractMapCache.set(session, map);
    return map;
  };

  const getAbstractHtml = (presentation) => {
    const normalizedTitle = normalizeCompareText(presentation?.title || '');
    if (!normalizedTitle) return '';

    const session = getSessionRecord(presentation);
    const abstractMap = extractAbstractMap(session);
    return abstractMap.get(normalizedTitle) || '';
  };

  const createSvgIcon = ({
    className,
    pathData,
    fill = 'currentColor',
    stroke,
    strokeWidth,
    linecap,
    linejoin,
  }) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', fill);
    if (stroke) svg.setAttribute('stroke', stroke);
    if (className) svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    if (strokeWidth) path.setAttribute('stroke-width', String(strokeWidth));
    if (linecap) path.setAttribute('stroke-linecap', linecap);
    if (linejoin) path.setAttribute('stroke-linejoin', linejoin);
    svg.appendChild(path);

    return svg;
  };

  const createIconLink = ({ href, label, svgPath }) => {
    if (!href) return null;
    const link = createEl(
      'a',
      'inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors',
      null,
    );
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', label);
    link.setAttribute('title', label);
    link.appendChild(createSvgIcon({ className: 'w-4 h-4 text-white/80', pathData: svgPath }));

    return link;
  };

  const presenterLinkConfigs = [
    {
      hrefKey: 'linkedin',
      label: 'LinkedIn profile',
      svgPath:
        'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    },
    {
      hrefKey: 'homepage',
      label: 'Presenter homepage',
      svgPath: 'M12 3l9 8h-3v9a1 1 0 01-1 1h-4v-6H11v6H7a1 1 0 01-1-1v-9H3l9-8z',
    },
  ];

  const createPresenterLinks = (details, className) => {
    const linkRow = createEl('div', className, null);

    presenterLinkConfigs.forEach(({ hrefKey, label, svgPath }) => {
      const link = createIconLink({ href: details[hrefKey], label, svgPath });
      if (link) {
        linkRow.appendChild(link);
      }
    });

    return linkRow.childElementCount > 0 ? linkRow : null;
  };

  const buildDetailsTemplate = (presenter, details, categoryName, displayPresentation) => {
    const presenterName = getPresenterName(presenter);
    const presentationTitle = getPresentationTitle(displayPresentation);
    const abstractHtml = getAbstractHtml(displayPresentation);

    const template = document.createElement('template');
    template.id = `details-modal-template-presenter-${presenter.id}`;

    const wrapper = createEl('div', 'space-y-6', null);

    const top = createEl('div', 'flex flex-col sm:flex-row items-start gap-5', null);
    const avatar = createEl(
      'img',
      'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
      null,
    );
    avatar.src = presenter.avatar || fallbackAvatar;
    avatar.alt = presenterName + ' avatar';
    avatar.loading = 'lazy';

    const topContent = createEl('div', 'space-y-2', null);
    topContent.appendChild(createEl('h3', 'text-lg font-semibold text-white', presenterName));
    if (presenter.profession) {
      topContent.appendChild(createEl('p', 'text-sm text-pnsqc-slate', presenter.profession));
    }
    topContent.appendChild(createEl('p', 'text-sm text-pnsqc-gold', presentationTitle));

    const iconRow = createPresenterLinks(details, 'flex flex-wrap items-center gap-2');
    if (iconRow) {
      topContent.appendChild(iconRow);
    }

    top.appendChild(avatar);
    top.appendChild(topContent);
    wrapper.appendChild(top);

    const abstractSection = createEl('div', 'space-y-2', null);
    abstractSection.appendChild(
      createEl(
        'p',
        'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80',
        'Abstract',
      ),
    );
    if (abstractHtml) {
      const abstractBody = createEl('div', 'rich-content rich-content--compact space-y-3', null);
      abstractBody.innerHTML = abstractHtml;
      abstractSection.appendChild(abstractBody);
    } else {
      abstractSection.appendChild(
        createEl(
          'p',
          'text-sm leading-7 text-pnsqc-slate whitespace-pre-line',
          'Abstract details are coming soon.',
        ),
      );
    }
    wrapper.appendChild(abstractSection);

    const bioSection = createEl('div', 'space-y-2', null);
    bioSection.appendChild(
      createEl('p', 'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80', 'Bio'),
    );
    bioSection.appendChild(
      createEl(
        'p',
        'text-sm leading-7 text-pnsqc-slate whitespace-pre-line',
        details.short_bio || 'Bio coming soon.',
      ),
    );
    wrapper.appendChild(bioSection);

    template.content.appendChild(wrapper);

    return {
      template,
      templateId: template.id,
      presenterName,
      presentationTitle,
      categoryLabel: categoryName || 'Presenter',
    };
  };

  const buildPresenterCard = ({
    presenter,
    details,
    displayPresentation,
    templateId,
    categoryLabel,
  }) => {
    const presenterName = getPresenterName(presenter);
    const presentationTitle = getPresentationTitle(displayPresentation);

    const card = createEl(
      'div',
      'rounded-2xl bg-gradient-to-br from-pnsqc-blue-dark/50 to-pnsqc-navy border border-pnsqc-gold/20 p-8',
      null,
    );

    const layout = createEl('div', 'flex flex-col sm:flex-row items-start gap-6', null);
    const avatarWrap = createEl('div', 'flex-shrink-0', null);
    const avatar = createEl(
      'img',
      'w-32 h-32 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
      null,
    );
    avatar.src = presenter.avatar || fallbackAvatar;
    avatar.alt = presenterName + ' avatar';
    avatar.loading = 'lazy';
    avatarWrap.appendChild(avatar);

    const content = createEl('div', 'w-full min-w-0 flex-1', null);
    const header = createEl('div', 'flex w-full items-start gap-3', null);
    header.appendChild(
      createEl('h3', 'min-w-0 flex-1 text-xl font-semibold text-white', presenterName),
    );

    const iconRow = createPresenterLinks(details, 'ml-auto flex shrink-0 items-center gap-2');
    if (iconRow) header.appendChild(iconRow);

    content.appendChild(header);
    if (presenter.profession) {
      content.appendChild(createEl('p', 'mt-1 text-sm text-pnsqc-slate', presenter.profession));
    }
    content.appendChild(createEl('p', 'mt-2 text-sm text-pnsqc-gold', presentationTitle));

    const buttonWrap = createEl('div', 'mt-4', null);
    const button = createEl(
      'button',
      'inline-flex items-center gap-1.5 text-xs font-semibold text-pnsqc-gold px-2.5 py-1.5 rounded bg-pnsqc-gold/10 hover:bg-pnsqc-gold/15 hover:text-pnsqc-gold-light transition-colors',
      'Read More',
    );
    button.type = 'button';
    button.setAttribute('data-details-modal-open', templateId);
    button.setAttribute('data-details-modal-title', presenterName);
    button.setAttribute('data-details-modal-label', categoryLabel);
    button.appendChild(
      createSvgIcon({
        className: 'h-3.5 w-3.5',
        pathData: 'M9 5l7 7-7 7',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        linecap: 'round',
        linejoin: 'round',
      }),
    );
    buttonWrap.appendChild(button);

    content.appendChild(buttonWrap);
    layout.appendChild(avatarWrap);
    layout.appendChild(content);
    card.appendChild(layout);

    return card;
  };

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  };

  setStatus(loadingText);

  fetch(endpoint)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load presenters.');
      }
      return response.json();
    })
    .then((payload) => {
      const eventData = payload?.data || payload || {};
      const presenterCategories = Array.isArray(eventData.speaker_categories)
        ? eventData.speaker_categories
        : [];
      const categoryNames = new Map(
        presenterCategories.map((category) => [category.id, category.name || 'Presenter']),
      );
      const presenters = Array.isArray(eventData.speakers) ? eventData.speakers : [];

      if (!usesDefaultSection) {
        presenterCategories.forEach((category) => {
          const section = sections.get(category.id);
          if (section?.title) {
            section.title.textContent = category.name;
          }
        });
      }

      const sortedPresenters = presenters
        .filter((presenter) => presenter && presenter.publish)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const counts = new Map();

      sortedPresenters.forEach((presenter) => {
        const details = getPresenterDetails(presenter);
        const { shouldDisplay, displayPresentation } = getPresenterDisplayState(details);
        if (!shouldDisplay) return;

        const categoryId = presenter.event_speaker_category_id;
        const section = usesDefaultSection ? defaultSection : sections.get(categoryId);
        if (!section) return;

        const categoryName = usesDefaultSection
          ? defaultCategoryLabel
          : categoryNames.get(categoryId) || 'Presenter';
        const detailsTemplate = buildDetailsTemplate(
          presenter,
          details,
          categoryName,
          displayPresentation,
        );
        templateRoot.appendChild(detailsTemplate.template);

        const card = buildPresenterCard({
          presenter,
          details,
          displayPresentation,
          templateId: detailsTemplate.templateId,
          categoryLabel: categoryName,
        });
        section.grid.appendChild(card);
        const countKey = usesDefaultSection ? defaultSectionKey : categoryId;
        counts.set(countKey, (counts.get(countKey) || 0) + 1);
      });

      if (usesDefaultSection) {
        const count = counts.get(defaultSectionKey) || 0;
        if (defaultSection.emptyState) {
          defaultSection.emptyState.hidden = count > 0;
        }
      } else {
        sections.forEach((section, categoryId) => {
          const count = counts.get(categoryId) || 0;
          if (section.emptyState) {
            section.emptyState.hidden = count > 0;
          }
        });
      }

      setStatus('');
    })
    .catch(() => {
      setStatus(errorText);
      if (usesDefaultSection) {
        if (defaultSection.emptyState) defaultSection.emptyState.hidden = false;
      } else {
        sections.forEach((section) => {
          if (section.emptyState) section.emptyState.hidden = false;
        });
      }
    });
})();
