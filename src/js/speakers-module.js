(() => {
  const moduleRoot = document.querySelector('[data-speaker-module]');
  if (!moduleRoot) return;

  const endpoint = moduleRoot.getAttribute('data-speaker-endpoint');
  if (!endpoint) return;

  const fallbackAvatar =
    moduleRoot.getAttribute('data-speaker-fallback-avatar') || '/images/brand/pnsqc-logo.jpg';
  const statusEl = moduleRoot.querySelector('[data-speaker-status]');
  const templateRoot = moduleRoot.querySelector('[data-speaker-templates]') || moduleRoot;

  const sections = new Map();
  moduleRoot.querySelectorAll('[data-speaker-category-id]').forEach((section) => {
    const idValue = Number(section.getAttribute('data-speaker-category-id'));
    const grid = section.querySelector('[data-speaker-grid]');
    const emptyState = section.querySelector('[data-speaker-empty]');
    const title = section.querySelector('[data-speaker-category-title]');
    if (!Number.isNaN(idValue) && grid) {
      sections.set(idValue, { grid, emptyState, title });
    }
  });

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

  const normalizeCompareText = (value) => normalizeSpace(value).replace(/:\s*$/, '').toLowerCase();

  const getDetails = (speaker) => {
    if (!speaker || typeof speaker !== 'object') return {};
    const numericKey = Object.keys(speaker).find((key) => /^\d+$/.test(key));
    if (numericKey && speaker[numericKey]) return speaker[numericKey];
    if (speaker.details && typeof speaker.details === 'object') return speaker.details;
    return {};
  };

  const getPresentationTitle = (details) => {
    const presentations = Array.isArray(details.presentations) ? details.presentations : [];
    return presentations[0]?.title || 'Presentation TBA';
  };

  const getAbstractText = (details, presentationTitle) => {
    const html = details?.presentations?.[0]?.session?.session?.description;
    if (!html || typeof html !== 'string') return 'TBA';

    const normalizedTitle = normalizeCompareText(presentationTitle);
    if (!normalizedTitle) return 'TBA';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const children = Array.from(doc.body.children);

    let blockquote = null;

    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      const text = normalizeCompareText(node.textContent || '');
      if (!text) continue;

      if (text === normalizedTitle || text.startsWith(normalizedTitle)) {
        for (let j = i + 1; j < children.length; j += 1) {
          const next = children[j];
          if (next.tagName?.toLowerCase() === 'blockquote') {
            blockquote = next;
            break;
          }
          if (normalizeCompareText(next.textContent || '') !== '') {
            break;
          }
        }
        break;
      }
    }

    if (!blockquote) return 'TBA';

    const paragraphs = Array.from(blockquote.querySelectorAll('p'))
      .map((p) => normalizeSpace(p.textContent || ''))
      .filter(Boolean);

    if (paragraphs.length > 0) {
      return paragraphs.join('\n\n');
    }

    const fallback = normalizeSpace(blockquote.textContent || '');
    return fallback || 'TBA';
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

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('class', 'w-4 h-4 text-white/80');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgPath);
    svg.appendChild(path);
    link.appendChild(svg);

    return link;
  };

  const buildModalTemplate = (speaker, details, categoryName) => {
    const speakerName = `${speaker.firstname || ''} ${speaker.lastname || ''}`.trim() || 'Speaker';
    const presentationTitle = getPresentationTitle(details);
    const abstractText = getAbstractText(details, presentationTitle);

    const template = document.createElement('template');
    template.id = `speaker-modal-${speaker.id}`;

    const wrapper = createEl('div', 'space-y-6', null);

    const top = createEl('div', 'flex flex-col sm:flex-row items-start gap-5', null);
    const avatar = createEl(
      'img',
      'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
      null,
    );
    avatar.src = speaker.avatar || fallbackAvatar;
    avatar.alt = speakerName + ' avatar';
    avatar.loading = 'lazy';

    const topContent = createEl('div', 'space-y-2', null);
    topContent.appendChild(createEl('h3', 'text-lg font-semibold text-white', speakerName));
    if (speaker.profession) {
      topContent.appendChild(createEl('p', 'text-sm text-pnsqc-slate', speaker.profession));
    }
    topContent.appendChild(createEl('p', 'text-sm text-pnsqc-gold', presentationTitle));

    const iconRow = createEl('div', 'flex flex-wrap items-center gap-2', null);
    const linkedinLink = createIconLink({
      href: details.linkedin,
      label: 'LinkedIn profile',
      svgPath:
        'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    });
    const homepageLink = createIconLink({
      href: details.homepage,
      label: 'Speaker homepage',
      svgPath: 'M12 3l9 8h-3v9a1 1 0 01-1 1h-4v-6H11v6H7a1 1 0 01-1-1v-9H3l9-8z',
    });

    if (linkedinLink) iconRow.appendChild(linkedinLink);
    if (homepageLink) iconRow.appendChild(homepageLink);
    if (iconRow.childElementCount > 0) {
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
    abstractSection.appendChild(
      createEl('p', 'text-sm leading-7 text-pnsqc-slate whitespace-pre-line', abstractText),
    );
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
      speakerName,
      presentationTitle,
      categoryLabel: categoryName || 'Speaker',
    };
  };

  const buildCard = ({ speaker, details, templateId, categoryLabel }) => {
    const speakerName = `${speaker.firstname || ''} ${speaker.lastname || ''}`.trim() || 'Speaker';
    const presentationTitle = getPresentationTitle(details);

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
    avatar.src = speaker.avatar || fallbackAvatar;
    avatar.alt = speakerName + ' avatar';
    avatar.loading = 'lazy';
    avatarWrap.appendChild(avatar);

    const content = createEl('div', null, null);
    const header = createEl('div', 'flex flex-wrap items-start justify-between gap-3', null);
    header.appendChild(createEl('h3', 'text-xl font-semibold text-white', speakerName));

    const iconRow = createEl('div', 'flex items-center gap-2', null);
    const linkedinLink = createIconLink({
      href: details.linkedin,
      label: 'LinkedIn profile',
      svgPath:
        'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    });
    const homepageLink = createIconLink({
      href: details.homepage,
      label: 'Speaker homepage',
      svgPath: 'M12 3l9 8h-3v9a1 1 0 01-1 1h-4v-6H11v6H7a1 1 0 01-1-1v-9H3l9-8z',
    });
    if (linkedinLink) iconRow.appendChild(linkedinLink);
    if (homepageLink) iconRow.appendChild(homepageLink);
    if (iconRow.childElementCount > 0) header.appendChild(iconRow);

    content.appendChild(header);
    if (speaker.profession) {
      content.appendChild(createEl('p', 'mt-1 text-sm text-pnsqc-slate', speaker.profession));
    }
    content.appendChild(createEl('p', 'mt-2 text-sm text-pnsqc-gold', presentationTitle));

    const buttonWrap = createEl('div', 'mt-4', null);
    const button = createEl(
      'button',
      'inline-flex items-center gap-1.5 text-xs font-semibold text-pnsqc-gold px-2.5 py-1.5 rounded bg-pnsqc-gold/10 hover:bg-pnsqc-gold/15 hover:text-pnsqc-gold-light transition-colors',
      'Read More',
    );
    button.type = 'button';
    button.setAttribute('data-track-modal-open', templateId);
    button.setAttribute('data-track-modal-title', speakerName);
    button.setAttribute('data-track-modal-label', categoryLabel);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'h-3.5 w-3.5');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('aria-hidden', 'true');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('stroke-linecap', 'round');
    arrowPath.setAttribute('stroke-linejoin', 'round');
    arrowPath.setAttribute('stroke-width', '2');
    arrowPath.setAttribute('d', 'M9 5l7 7-7 7');
    arrow.appendChild(arrowPath);
    button.appendChild(arrow);
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

  setStatus('Loading speakers...');

  fetch(endpoint)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load speakers.');
      }
      return response.json();
    })
    .then((payload) => {
      const eventData = payload?.data || payload || {};
      const categories = Array.isArray(eventData.speaker_categories)
        ? eventData.speaker_categories
        : [];
      const speakers = Array.isArray(eventData.speakers) ? eventData.speakers : [];

      categories.forEach((category) => {
        const section = sections.get(category.id);
        if (section?.title) {
          section.title.textContent = category.name;
        }
      });

      const sortedSpeakers = speakers
        .filter((speaker) => speaker && speaker.publish)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const counts = new Map();

      sortedSpeakers.forEach((speaker) => {
        const details = getDetails(speaker);
        const categoryId = speaker.event_speaker_category_id;
        const section = sections.get(categoryId);
        if (!section) return;

        const categoryName = categories.find((cat) => cat.id === categoryId)?.name || 'Speaker';
        const modalData = buildModalTemplate(speaker, details, categoryName);
        templateRoot.appendChild(modalData.template);

        const card = buildCard({
          speaker,
          details,
          templateId: modalData.templateId,
          categoryLabel: categoryName,
        });
        section.grid.appendChild(card);
        counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
      });

      sections.forEach((section, categoryId) => {
        const count = counts.get(categoryId) || 0;
        if (section.emptyState) {
          section.emptyState.hidden = count > 0;
        }
      });

      setStatus('');
    })
    .catch(() => {
      setStatus('Speakers will be announced soon.');
      sections.forEach((section) => {
        if (section.emptyState) section.emptyState.hidden = false;
      });
    });
})();
