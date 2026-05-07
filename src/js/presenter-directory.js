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

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const textToHtml = (value) => {
    const normalized = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim();
    if (!normalized) return '';
    return normalized
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');
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
      const allowed = [
        'a',
        'p',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'b',
        'i',
        'u',
        'br',
        'blockquote',
        'code',
        'pre',
        'hr',
      ];
      if (!allowed.includes(tag)) {
        const fragment = document.createDocumentFragment();
        Array.from(node.childNodes).forEach((child) => {
          const cleaned = sanitizeNode(child);
          if (cleaned) fragment.appendChild(cleaned);
        });
        return fragment.childNodes.length ? fragment : null;
      }

      const copy = document.createElement(tag);
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        if (/^(https?:|mailto:|\/)/i.test(href)) {
          copy.setAttribute('href', href);
          if (/^https?:/i.test(href)) {
            copy.setAttribute('target', '_blank');
            copy.setAttribute('rel', 'noopener noreferrer');
          }
        } else {
          return null;
        }
      }

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

  const normalizeCategory = (category) => {
    if (!category || typeof category !== 'object') return null;

    const id = Number(category.id);
    return {
      id: Number.isNaN(id) ? null : id,
      name: normalizeSpace(category.name || ''),
    };
  };

  const normalizeMeetingHandPresenter = (presenter, index) => {
    const details = getPresenterDetails(presenter);
    const presenterName = getPresenterName(presenter);
    const presentations = getSortedPresentations(details).map((presentation) => ({
      title: getPresentationTitle(presentation),
      descriptionHtml: getAbstractHtml(presentation),
      date: getPresentationDateKey(presentation),
      label: '',
    }));

    const sortOrder = Number(presenter.order);
    const categoryId = Number(presenter.event_speaker_category_id);

    return {
      id: String(presenter.id ?? index),
      name: presenterName,
      profession: normalizeSpace(presenter.profession || ''),
      avatar: presenter.avatar || fallbackAvatar,
      linkedin: normalizeSpace(details.linkedin || ''),
      homepage: normalizeSpace(details.homepage || ''),
      bioHtml: textToHtml(details.short_bio || ''),
      categoryId: Number.isNaN(categoryId) ? null : categoryId,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : null,
      publish: Boolean(presenter.publish),
      presentations,
    };
  };

  const normalizeArchivePresenter = (presenter, index) => ({
    id: String(presenter.id ?? index),
    name: normalizeSpace(presenter.name || '') || 'Presenter',
    profession: normalizeSpace(presenter.profession || ''),
    avatar: normalizeSpace(presenter.avatar || '') || fallbackAvatar,
    linkedin: normalizeSpace(presenter.linkedin || ''),
    homepage: normalizeSpace(presenter.homepage || ''),
    bioHtml: sanitizeHtmlFragment(presenter.bioHtml || ''),
    categoryId: Number.isFinite(Number(presenter.categoryId)) ? Number(presenter.categoryId) : null,
    sortOrder: Number.isFinite(Number(presenter.sortOrder)) ? Number(presenter.sortOrder) : null,
    publish: true,
    presentations: Array.isArray(presenter.presentations)
      ? presenter.presentations.filter(Boolean).map((presentation) => ({
          title: normalizeSpace(presentation.title || '') || 'Presentation TBA',
          descriptionHtml: sanitizeHtmlFragment(
            presentation.descriptionHtml || textToHtml(presentation.description || ''),
          ),
          date: extractDateKey(presentation.date || ''),
          label: normalizeSpace(presentation.label || ''),
        }))
      : [],
  });

  const normalizePayload = (payload) => {
    if (Array.isArray(payload?.speakers)) {
      return {
        categories: Array.isArray(payload.categories)
          ? payload.categories.map(normalizeCategory).filter(Boolean)
          : [],
        presenters: payload.speakers.map(normalizeArchivePresenter),
      };
    }

    const eventData = payload?.data || payload || {};
    const categories = Array.isArray(eventData.speaker_categories)
      ? eventData.speaker_categories.map(normalizeCategory).filter(Boolean)
      : [];
    const presenters = Array.isArray(eventData.speakers)
      ? eventData.speakers
          .map(normalizeMeetingHandPresenter)
          .filter((presenter) => presenter.publish)
      : [];

    return { categories, presenters };
  };

  const comparePresenters = (left, right) => {
    if (left.sortOrder !== null && right.sortOrder !== null && left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.name.localeCompare(right.name);
  };

  const getEligiblePresentations = (presenter) => {
    let presentations = Array.isArray(presenter.presentations)
      ? presenter.presentations.slice()
      : [];
    if (excludedPresentationDateFilter) {
      presentations = presentations.filter(
        (presentation) => extractDateKey(presentation.date) !== excludedPresentationDateFilter,
      );
    }
    if (!presentationDateFilter) return presentations;
    return presentations.filter(
      (presentation) => extractDateKey(presentation.date) === presentationDateFilter,
    );
  };

  const getPresenterDisplayState = (presenter) => {
    const presentations = Array.isArray(presenter.presentations) ? presenter.presentations : [];
    const eligiblePresentations = getEligiblePresentations(presenter);
    const displayPresentation = eligiblePresentations[0] || presentations[0] || null;

    if (presentationDateFilter) {
      return {
        displayPresentation,
        eligiblePresentations,
        shouldDisplay: eligiblePresentations.length > 0,
      };
    }
    if (excludedPresentationDateFilter && presentations.length > 0) {
      return {
        displayPresentation,
        eligiblePresentations,
        shouldDisplay: eligiblePresentations.length > 0,
      };
    }

    return { displayPresentation, eligiblePresentations, shouldDisplay: true };
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
      'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10',
      null,
    );
    link.href = href;
    if (/^https?:/i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.setAttribute('aria-label', label);
    link.setAttribute('title', label);
    link.appendChild(createSvgIcon({ className: 'h-4 w-4 text-white/80', pathData: svgPath }));

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

  const createPresenterLinks = (presenter, className) => {
    const linkRow = createEl('div', className, null);

    presenterLinkConfigs.forEach(({ hrefKey, label, svgPath }) => {
      const link = createIconLink({ href: presenter[hrefKey], label, svgPath });
      if (link) linkRow.appendChild(link);
    });

    return linkRow.childElementCount > 0 ? linkRow : null;
  };

  const buildPresentationsSection = (presentations) => {
    const section = createEl('div', 'space-y-3', null);
    const headingText = presentations.length > 1 ? 'Presentations' : 'Abstract';
    section.appendChild(
      createEl(
        'p',
        'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80',
        headingText,
      ),
    );

    if (!presentations.length) {
      section.appendChild(
        createEl(
          'p',
          'whitespace-pre-line text-sm leading-7 text-pnsqc-slate',
          'Presentation details are coming soon.',
        ),
      );
      return section;
    }

    if (presentations.length === 1) {
      const descriptionHtml = sanitizeHtmlFragment(presentations[0].descriptionHtml || '');
      if (descriptionHtml) {
        const abstractBody = createEl(
          'div',
          'details-modal-content space-y-3 text-sm leading-7 text-pnsqc-slate',
          null,
        );
        abstractBody.innerHTML = descriptionHtml;
        section.appendChild(abstractBody);
      } else {
        section.appendChild(
          createEl(
            'p',
            'whitespace-pre-line text-sm leading-7 text-pnsqc-slate',
            'Abstract details are coming soon.',
          ),
        );
      }
      return section;
    }

    const list = createEl('div', 'space-y-5', null);
    presentations.forEach((presentation, index) => {
      const item = createEl(
        'article',
        index === 0 ? 'space-y-2' : 'space-y-2 border-t border-white/10 pt-5',
        null,
      );
      item.appendChild(createEl('h4', 'text-base font-semibold text-white', presentation.title));

      const meta = [presentation.label, presentation.date].filter(Boolean).join(' | ');
      if (meta) {
        item.appendChild(
          createEl('p', 'text-xs uppercase tracking-widest text-pnsqc-gold/70', meta),
        );
      }

      const descriptionHtml = sanitizeHtmlFragment(presentation.descriptionHtml || '');
      if (descriptionHtml) {
        const description = createEl(
          'div',
          'details-modal-content space-y-3 text-sm leading-7 text-pnsqc-slate',
          null,
        );
        description.innerHTML = descriptionHtml;
        item.appendChild(description);
      } else {
        item.appendChild(
          createEl(
            'p',
            'whitespace-pre-line text-sm leading-7 text-pnsqc-slate',
            'Abstract details are coming soon.',
          ),
        );
      }

      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  };

  const buildModalTemplate = (
    presenter,
    categoryName,
    eligiblePresentations,
    displayPresentation,
  ) => {
    const presenterName = presenter.name || 'Presenter';
    const template = document.createElement('template');
    template.id = `details-modal-template-presenter-${presenter.id}`;

    const wrapper = createEl('div', 'space-y-6', null);

    const top = createEl('div', 'flex flex-col items-start gap-5 sm:flex-row', null);
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
    if (displayPresentation) {
      topContent.appendChild(createEl('p', 'text-sm text-pnsqc-gold', displayPresentation.title));
    }
    if (eligiblePresentations.length > 1) {
      topContent.appendChild(
        createEl(
          'p',
          'text-xs uppercase tracking-widest text-pnsqc-cyan/80',
          `${eligiblePresentations.length} presentations`,
        ),
      );
    }

    const iconRow = createPresenterLinks(presenter, 'flex flex-wrap items-center gap-2');
    if (iconRow) topContent.appendChild(iconRow);

    top.appendChild(avatar);
    top.appendChild(topContent);
    wrapper.appendChild(top);
    wrapper.appendChild(buildPresentationsSection(eligiblePresentations));

    const bioSection = createEl('div', 'space-y-2', null);
    bioSection.appendChild(
      createEl('p', 'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80', 'Bio'),
    );

    const bioHtml = sanitizeHtmlFragment(presenter.bioHtml || '');
    if (bioHtml) {
      const bioBody = createEl(
        'div',
        'details-modal-content space-y-3 text-sm leading-7 text-pnsqc-slate',
        null,
      );
      bioBody.innerHTML = bioHtml;
      bioSection.appendChild(bioBody);
    } else {
      bioSection.appendChild(
        createEl('p', 'whitespace-pre-line text-sm leading-7 text-pnsqc-slate', 'Bio coming soon.'),
      );
    }
    wrapper.appendChild(bioSection);

    template.content.appendChild(wrapper);

    return {
      template,
      templateId: template.id,
      presenterName,
      categoryLabel: categoryName || 'Presenter',
    };
  };

  const buildPresenterCard = ({
    presenter,
    displayPresentation,
    presentationCount,
    templateId,
    categoryLabel,
  }) => {
    const presenterName = presenter.name || 'Presenter';
    const presentationTitle = displayPresentation?.title || 'Presentation TBA';

    const card = createEl(
      'div',
      'rounded-2xl border border-pnsqc-gold/20 bg-gradient-to-br from-pnsqc-blue-dark/50 to-pnsqc-navy p-8',
      null,
    );

    const layout = createEl('div', 'flex flex-col items-start gap-6 sm:flex-row', null);
    const avatarWrap = createEl('div', 'shrink-0', null);
    const avatar = createEl(
      'img',
      'h-32 w-32 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
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

    const iconRow = createPresenterLinks(presenter, 'ml-auto flex shrink-0 items-center gap-2');
    if (iconRow) header.appendChild(iconRow);

    content.appendChild(header);
    if (presenter.profession) {
      content.appendChild(createEl('p', 'mt-1 text-sm text-pnsqc-slate', presenter.profession));
    }
    content.appendChild(createEl('p', 'mt-2 text-sm text-pnsqc-gold', presentationTitle));

    if (presentationCount > 1) {
      content.appendChild(
        createEl(
          'p',
          'mt-2 text-xs uppercase tracking-widest text-pnsqc-cyan/80',
          `${presentationCount} presentations`,
        ),
      );
    }

    const buttonWrap = createEl('div', 'mt-4', null);
    const button = createEl(
      'button',
      'inline-flex items-center gap-1.5 rounded bg-pnsqc-gold/10 px-2.5 py-1.5 text-xs font-semibold text-pnsqc-gold transition-colors hover:bg-pnsqc-gold/15 hover:text-pnsqc-gold-light',
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
      const normalized = normalizePayload(payload);
      const categories = Array.isArray(normalized.categories) ? normalized.categories : [];
      const categoryNames = new Map(
        categories
          .filter((category) => category && category.id !== null)
          .map((category) => [category.id, category.name || defaultCategoryLabel]),
      );

      if (!usesDefaultSection) {
        categories.forEach((category) => {
          if (!category || category.id === null) return;
          const section = sections.get(category.id);
          if (section?.title && category.name) {
            section.title.textContent = category.name;
          }
        });
      }

      const sortedPresenters = normalized.presenters.slice().sort(comparePresenters);
      const counts = new Map();

      sortedPresenters.forEach((presenter) => {
        const { shouldDisplay, displayPresentation, eligiblePresentations } =
          getPresenterDisplayState(presenter);
        if (!shouldDisplay) return;

        const sectionKey = usesDefaultSection ? defaultSectionKey : presenter.categoryId;
        const section = usesDefaultSection ? defaultSection : sections.get(presenter.categoryId);
        if (!section) return;

        const categoryName = usesDefaultSection
          ? defaultCategoryLabel
          : categoryNames.get(presenter.categoryId) || defaultCategoryLabel;
        const modalData = buildModalTemplate(
          presenter,
          categoryName,
          eligiblePresentations,
          displayPresentation,
        );
        templateRoot.appendChild(modalData.template);

        const card = buildPresenterCard({
          presenter,
          displayPresentation,
          presentationCount: eligiblePresentations.length,
          templateId: modalData.templateId,
          categoryLabel: categoryName,
        });
        section.grid.appendChild(card);
        counts.set(sectionKey, (counts.get(sectionKey) || 0) + 1);
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
