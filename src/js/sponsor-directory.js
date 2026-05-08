(() => {
  const directoryRoot = document.querySelector('[data-sponsor-directory]');
  if (!directoryRoot) return;

  const endpoint = directoryRoot.getAttribute('data-sponsor-endpoint');
  if (!endpoint) return;

  const fallbackLogo =
    directoryRoot.getAttribute('data-sponsor-fallback-logo') || '/images/brand/pnsqc-logo.jpg';
  const statusEl = directoryRoot.querySelector('[data-sponsor-status]');
  const templateRoot = directoryRoot.querySelector('[data-sponsor-templates]') || directoryRoot;

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

  const normalizeName = (value) => normalizeSpace(value).toLowerCase();

  const normalizeSize = (value, fallback = 'M') => {
    const size = normalizeSpace(value).toUpperCase();
    return ['L', 'M', 'S'].includes(size) ? size : fallback;
  };

  const sanitizeUrl = (value) => {
    const url = normalizeSpace(value);
    if (!url) return '';

    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch {
      return '';
    }
  };

  const sanitizeHtmlFragment = (value) => {
    if (!value) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(String(value), 'text/html');
    const allowedTags = ['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br'];

    const sanitizeNode = (node) => {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE) {
        const textValue = node.textContent || '';
        if (!textValue.trim()) return null;
        return document.createTextNode(textValue.replace(/\u00a0/g, ' '));
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const tag = node.tagName.toLowerCase();
      if (!allowedTags.includes(tag)) {
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

  const sizeConfigs = {
    L: {
      grid: 'flex flex-wrap justify-center gap-6',
      card: 'card-hover mx-auto inline-flex w-fit min-w-72 max-w-full flex-col items-center px-5 py-6 bg-pnsqc-blue/10 border border-pnsqc-gold/25 rounded-xl text-center transition-colors cursor-pointer hover:border-pnsqc-gold/50 hover:bg-pnsqc-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pnsqc-gold',
      logoWrap: 'mb-5 flex h-44 w-44 items-center justify-center',
      logo: 'mx-auto max-h-44 max-w-44 w-auto',
      title: 'max-w-80 text-2xl font-semibold text-white text-center break-words',
    },
    M: {
      grid: 'flex flex-wrap justify-center gap-4',
      card: 'card-hover mx-auto inline-flex w-fit min-w-60 max-w-full flex-col items-center px-4 py-4 bg-pnsqc-blue/10 border border-pnsqc-gold/20 rounded-xl text-center transition-colors cursor-pointer hover:border-pnsqc-gold/40 hover:bg-pnsqc-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pnsqc-gold',
      logoWrap: 'mb-3 flex h-28 w-28 items-center justify-center',
      logo: 'mx-auto max-h-28 max-w-28 w-auto',
      title: 'max-w-64 text-lg font-semibold text-white text-center break-words',
    },
    S: {
      grid: 'flex flex-wrap justify-center gap-4',
      card: 'card-hover mx-auto inline-flex w-fit min-w-48 max-w-full flex-col items-center px-3 py-3 bg-pnsqc-blue/10 border border-pnsqc-gold/20 rounded-xl text-center transition-colors cursor-pointer hover:border-pnsqc-gold/40 hover:bg-pnsqc-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pnsqc-gold',
      logoWrap: 'mb-2 flex h-16 w-16 items-center justify-center',
      logo: 'mx-auto max-h-16 max-w-16 w-auto',
      title: 'max-w-48 text-base font-semibold text-white text-center break-words',
    },
  };

  const tierSections = Array.from(directoryRoot.querySelectorAll('[data-sponsor-tier]')).map(
    (section) => ({
      section,
      name: normalizeSpace(section.getAttribute('data-sponsor-tier')),
      defaultSize: normalizeSize(section.getAttribute('data-sponsor-default-size')),
      grid: section.querySelector('[data-sponsor-grid]'),
      emptyState: section.querySelector('[data-sponsor-empty]'),
    }),
  );

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  };

  const getSponsorName = (sponsor) =>
    normalizeSpace(sponsor?.title) || normalizeSpace(sponsor?.name) || 'Sponsor';

  const getSponsorLogo = (sponsor) => sanitizeUrl(sponsor?.logo) || fallbackLogo;

  const compareSponsors = (left, right) => {
    const leftOrder = Number(left?.order ?? Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(right?.order ?? Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return getSponsorName(left).localeCompare(getSponsorName(right));
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

  const linkConfigs = [
    {
      key: 'website',
      label: 'Website',
      svgPath:
        'M13.5 6H18v4.5m-.75-3.75L10.5 13.5M6.75 4.5h4.5v1.5h-4.5a.75.75 0 00-.75.75v10.5c0 .414.336.75.75.75h10.5a.75.75 0 00.75-.75v-4.5h1.5v4.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 016.75 4.5z',
      iconProps: {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        linecap: 'round',
        linejoin: 'round',
      },
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      svgPath:
        'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
      iconProps: {
        fill: 'currentColor',
      },
    },
  ];

  const createSponsorLinks = (sponsor) => {
    const linkRow = createEl('div', 'flex flex-wrap items-center gap-2', null);

    linkConfigs.forEach(({ key, label, svgPath, iconProps }) => {
      const href = sanitizeUrl(sponsor?.[key]);
      if (!href) return;

      const link = createEl(
        'a',
        'button-gold-ghost inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold',
        null,
      );
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(createSvgIcon({ className: 'h-4 w-4', pathData: svgPath, ...iconProps }));
      link.appendChild(document.createTextNode(label));
      linkRow.appendChild(link);
    });

    return linkRow.childElementCount > 0 ? linkRow : null;
  };

  const buildDetailsTemplate = ({ sponsor, tierName, templateId }) => {
    const sponsorName = getSponsorName(sponsor);
    const descriptionHtml = sanitizeHtmlFragment(sponsor?.description);
    const template = document.createElement('template');
    template.id = templateId;

    const wrapper = createEl('div', 'space-y-6', null);
    const top = createEl('div', 'flex flex-col sm:flex-row items-center gap-5', null);
    const logoWrap = createEl(
      'div',
      'flex h-28 w-full shrink-0 items-center justify-center sm:w-56',
      null,
    );
    const logo = createEl('img', 'mx-auto max-h-28 max-w-56 w-auto', null);
    logo.src = getSponsorLogo(sponsor);
    logo.alt = sponsorName + ' logo';
    logo.loading = 'lazy';
    logoWrap.appendChild(logo);

    const topContent = createEl('div', 'space-y-3 min-w-0 flex-1', null);
    topContent.appendChild(
      createEl('h3', 'text-lg font-semibold text-white text-center sm:text-left', sponsorName),
    );
    topContent.appendChild(
      createEl('p', 'text-sm text-pnsqc-gold text-center sm:text-left', tierName + ' Sponsor'),
    );

    const links = createSponsorLinks(sponsor);
    if (links) topContent.appendChild(links);

    top.appendChild(logoWrap);
    top.appendChild(topContent);
    wrapper.appendChild(top);

    const descriptionSection = createEl('div', 'modal-section', null);
    descriptionSection.appendChild(createEl('p', 'modal-section-label', 'Description'));
    if (descriptionHtml) {
      const descriptionBody = createEl('div', 'rich-content rich-content--compact space-y-3', null);
      descriptionBody.innerHTML = descriptionHtml;
      descriptionSection.appendChild(descriptionBody);
    } else {
      descriptionSection.appendChild(
        createEl('p', 'text-sm leading-7 text-pnsqc-slate', 'Sponsor details are coming soon.'),
      );
    }
    wrapper.appendChild(descriptionSection);

    template.content.appendChild(wrapper);
    return template;
  };

  const buildSponsorCard = ({ sponsor, tierName, size, templateId }) => {
    const config = sizeConfigs[size] || sizeConfigs.M;
    const sponsorName = getSponsorName(sponsor);
    const card = createEl('button', config.card, null);
    card.type = 'button';
    card.setAttribute('data-details-modal-open', templateId);
    card.setAttribute('data-details-modal-title', sponsorName);
    card.setAttribute('data-details-modal-label', tierName + ' Sponsor');

    const logoWrap = createEl('div', config.logoWrap, null);
    const logo = createEl('img', config.logo, null);
    logo.src = getSponsorLogo(sponsor);
    logo.alt = sponsorName + ' logo';
    logo.loading = 'lazy';
    logoWrap.appendChild(logo);

    const title = createEl('h3', config.title, sponsorName);

    card.appendChild(logoWrap);
    card.appendChild(title);

    return card;
  };

  const buildTemplateId = (sponsor, tierName, index) => {
    const rawId = normalizeSpace(String(sponsor?.id || `${tierName}-${index}`));
    return `details-modal-template-sponsor-${rawId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  };

  const renderEmptyState = (tier) => {
    tier.grid?.replaceChildren();
    if (tier.emptyState) tier.emptyState.hidden = false;
  };

  setStatus('Loading sponsors...');

  fetch(endpoint)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load sponsors.');
      }
      return response.json();
    })
    .then((payload) => {
      const eventData = payload?.data || payload || {};
      const sponsorCategories = Array.isArray(eventData.sponsors) ? eventData.sponsors : [];
      const categoriesByName = new Map(
        sponsorCategories.map((category) => [normalizeName(category?.name), category]),
      );

      tierSections.forEach((tier) => {
        if (!tier.grid) return;

        const category = categoriesByName.get(normalizeName(tier.name));
        const size = normalizeSize(category?.size, tier.defaultSize);
        const config = sizeConfigs[size] || sizeConfigs.M;
        const sponsors = (Array.isArray(category?.sponsors) ? category.sponsors : [])
          .filter(Boolean)
          .slice()
          .sort(compareSponsors);

        tier.grid.className = config.grid;
        tier.grid.replaceChildren();

        sponsors.forEach((sponsor, index) => {
          const templateId = buildTemplateId(sponsor, tier.name, index);
          const template = buildDetailsTemplate({ sponsor, tierName: tier.name, templateId });
          templateRoot.appendChild(template);

          const card = buildSponsorCard({
            sponsor,
            tierName: tier.name,
            size,
            templateId,
          });
          tier.grid.appendChild(card);
        });

        if (tier.emptyState) tier.emptyState.hidden = sponsors.length > 0;
      });

      setStatus('');
    })
    .catch(() => {
      setStatus('Sponsors will be announced soon.');
      tierSections.forEach(renderEmptyState);
    });
})();
