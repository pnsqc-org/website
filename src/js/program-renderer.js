/* global module */

(function (root, factory) {
  const api = factory(root.PNSQCProgramData || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PNSQCProgramRenderer = api;
  root.PNSQCProgram = {
    ...(root.PNSQCProgram || {}),
    createRenderer: api.createRenderer,
    renderer: api,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this, function (data) {
  const asArray = data.asArray || ((value) => (Array.isArray(value) ? value : []));
  const normalizeSpace =
    data.normalizeSpace ||
    ((value) =>
      value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim());
  const textToHtml = data.textToHtml || ((value) => `<p>${String(value || '')}</p>`);
  const sortPeopleByLastName =
    data.sortPeopleByLastName ||
    ((people) =>
      asArray(people)
        .slice()
        .sort((left, right) =>
          normalizeSpace(left?.name).localeCompare(normalizeSpace(right?.name)),
        ));

  function createRenderer({
    fallbackAvatar = '/images/brand/pnsqc-logo.jpg',
    bioFallbackText = 'Bio coming soon.',
  } = {}) {
    const createEl = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (typeof text === 'string') el.textContent = text;
      return el;
    };

    const sanitizeHtmlFragment = (value) => {
      if (!value) return '';

      const parser = new DOMParser();
      const doc = parser.parseFromString(String(value), 'text/html');
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

      const sanitizeNode = (node) => {
        if (!node) return null;
        if (node.nodeType === Node.TEXT_NODE) {
          const textValue = node.textContent || '';
          if (!textValue.trim()) return null;
          return document.createTextNode(textValue.replace(/\u00a0/g, ' '));
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const tag = node.tagName.toLowerCase();
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
          if (!/^(https?:|mailto:|\/)/i.test(href)) return null;
          copy.setAttribute('href', href);
          if (/^https?:/i.test(href)) {
            copy.setAttribute('target', '_blank');
            copy.setAttribute('rel', 'noopener noreferrer');
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

    const createSvgIcon = ({ className, pathData, fill = 'currentColor', stroke }) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', fill);
      if (stroke) svg.setAttribute('stroke', stroke);
      if (className) svg.setAttribute('class', className);
      svg.setAttribute('aria-hidden', 'true');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (stroke) path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
      return svg;
    };

    const createIconLink = ({ href, label, svgPath }) => {
      if (!href) return null;
      const link = createEl(
        'a',
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10',
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

    const speakerLinkConfigs = [
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

    const createSpeakerLinks = (speaker, className) => {
      const linkRow = createEl('div', className);
      speakerLinkConfigs.forEach(({ hrefKey, label, svgPath }) => {
        const link = createIconLink({ href: speaker[hrefKey], label, svgPath });
        if (link) linkRow.appendChild(link);
      });
      return linkRow.childElementCount > 0 ? linkRow : null;
    };

    const createAvatar = ({ src, alt, className }) => {
      const avatar = createEl('img', className);
      avatar.src = src || fallbackAvatar;
      avatar.alt = alt;
      avatar.loading = 'lazy';
      return avatar;
    };

    const getSortedSpeakers = (speakers) => sortPeopleByLastName(speakers);

    /*
    const formatDisplayDate = (value) => {
      const raw = normalizeSpace(value);
      if (!raw) return '';
      const match = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (match) return `${match[2]}/${match[3]}/${match[1]}`;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return raw;
      const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const day = String(parsed.getUTCDate()).padStart(2, '0');
      return `${month}/${day}/${parsed.getUTCFullYear()}`;
    };
    */

    const createCardLayout = () => {
      const card = createEl(
        'div',
        'rounded-2xl border border-pnsqc-gold/20 bg-gradient-to-br from-pnsqc-blue-dark/50 to-pnsqc-navy p-8',
      );
      const layout = createEl('div', 'flex flex-col items-start gap-6 sm:flex-row');
      const content = createEl('div', 'w-full min-w-0 flex-1');
      card.appendChild(layout);
      return { card, layout, content };
    };

    const createCardHeader = ({ title, links }) => {
      const header = createEl('div', 'flex w-full items-start gap-3');
      header.appendChild(createEl('h3', 'min-w-0 flex-1 text-xl font-semibold text-white', title));
      if (links) header.appendChild(links);
      return header;
    };

    const createReadMoreButton = ({ templateId, title, label, subtitle }) => {
      const button = createEl(
        'button',
        'inline-flex items-center gap-1.5 rounded bg-pnsqc-gold/10 px-2.5 py-1.5 text-xs font-semibold text-pnsqc-gold transition-colors hover:bg-pnsqc-gold/15 hover:text-pnsqc-gold-light',
        'Read More',
      );
      button.type = 'button';
      button.setAttribute('data-details-modal-open', templateId);
      button.setAttribute('data-details-modal-title', title);
      button.setAttribute('data-details-modal-label', label);
      if (subtitle) button.setAttribute('data-details-modal-subtitle', subtitle);
      button.appendChild(
        createSvgIcon({
          className: 'h-3.5 w-3.5',
          pathData: 'M9 5l7 7-7 7',
          fill: 'none',
          stroke: 'currentColor',
        }),
      );
      return button;
    };

    const appendReadMore = ({ content, templateId, title, label, subtitle }) => {
      const buttonWrap = createEl('div', 'mt-4');
      buttonWrap.appendChild(createReadMoreButton({ templateId, title, label, subtitle }));
      content.appendChild(buttonWrap);
    };

    const appendSectionHeading = (section, text) => {
      section.appendChild(
        createEl('p', 'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80', text),
      );
    };

    const createDetailsText = (text) =>
      createEl('p', 'whitespace-pre-line text-sm leading-7 text-pnsqc-slate', text);

    const createHtmlContent = (html, className = 'details-modal-content') => {
      const content = createEl('div', `${className} space-y-3 text-sm leading-7 text-pnsqc-slate`);
      content.innerHTML = html;
      return content;
    };

    const appendHtmlOrFallback = ({ parent, html, fallbackText, className }) => {
      const sanitized = sanitizeHtmlFragment(html || '');
      if (sanitized) {
        parent.appendChild(createHtmlContent(sanitized, className));
        return;
      }
      parent.appendChild(createDetailsText(fallbackText));
    };

    const createTemplate = (id, content) => {
      const template = document.createElement('template');
      template.id = id;
      template.content.appendChild(content);
      return template;
    };

    const getPresentationHtml = (presentation) =>
      presentation?.descriptionHtml ||
      presentation?.abstractHtml ||
      textToHtml(presentation?.abstract || '');

    const getPresentationTopic = (presentation) => normalizeSpace(presentation?.topic || '');

    const createPresentationTopic = (presentation, className = 'text-xs text-pnsqc-cyan/90') => {
      const topic = getPresentationTopic(presentation);
      return topic ? createEl('p', className, topic) : null;
    };

    const getObjectivesHtml = (presentation) =>
      presentation?.objectivesHtml || textToHtml(presentation?.objectives || '');

    const buildPresentationListSection = (presentations) => {
      const section = createEl('div', 'space-y-3');
      appendSectionHeading(section, presentations.length > 1 ? 'Presentations' : 'Abstract');

      if (!presentations.length) {
        section.appendChild(createDetailsText('Presentation details are coming soon.'));
        return section;
      }

      if (presentations.length === 1) {
        appendHtmlOrFallback({
          parent: section,
          html: getPresentationHtml(presentations[0]),
          fallbackText: 'Abstract details are coming soon.',
          className: 'rich-content rich-content--compact',
        });
        return section;
      }

      const list = createEl('div', 'space-y-5');
      presentations.forEach((presentation, index) => {
        const item = createEl(
          'article',
          index === 0 ? 'space-y-2' : 'space-y-2 border-t border-white/10 pt-5',
        );
        item.appendChild(createEl('h4', 'text-base font-semibold text-white', presentation.title));
        /*
        const meta = [presentation.label, formatDisplayDate(presentation.date)]
          .filter(Boolean)
          .join(' | ');
        if (meta) {
          item.appendChild(
            createEl('p', 'text-xs uppercase tracking-widest text-pnsqc-gold/70', meta),
          );
        }
        */
        appendHtmlOrFallback({
          parent: item,
          html: getPresentationHtml(presentation),
          fallbackText: 'Abstract details are coming soon.',
          className: 'rich-content rich-content--compact',
        });
        list.appendChild(item);
      });
      section.appendChild(list);
      return section;
    };

    const buildSpeakerDetailsContent = (
      speaker,
      eligiblePresentations = asArray(speaker?.presentations),
      displayPresentation = eligiblePresentations[0] || null,
    ) => {
      const speakerName = speaker?.name || 'Presenter';
      const wrapper = createEl('div', 'space-y-6');
      const top = createEl('div', 'flex flex-col items-start gap-5 sm:flex-row');
      top.appendChild(
        createAvatar({
          src: speaker?.avatar,
          alt: `${speakerName} avatar`,
          className: 'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
        }),
      );

      const topContent = createEl('div', 'space-y-2');
      topContent.appendChild(createEl('h3', 'text-lg font-semibold text-white', speakerName));
      if (speaker?.profession) {
        topContent.appendChild(createEl('p', 'text-sm text-pnsqc-slate', speaker.profession));
      }
      if (speaker?.organization) {
        topContent.appendChild(createEl('p', 'text-sm text-pnsqc-slate', speaker.organization));
      }
      if (displayPresentation) {
        topContent.appendChild(createEl('p', 'text-sm text-pnsqc-gold', displayPresentation.title));
        const topic = createPresentationTopic(displayPresentation, 'text-sm text-pnsqc-cyan/90');
        if (topic) topContent.appendChild(topic);
      }
      /*
      if (eligiblePresentations.length > 1) {
        topContent.appendChild(
          createEl(
            'p',
            'text-xs uppercase tracking-widest text-pnsqc-cyan/80',
            `${eligiblePresentations.length} presentations`,
          ),
        );
      }
      */

      const links = createSpeakerLinks(speaker || {}, 'flex flex-wrap items-center gap-2');
      if (links) topContent.appendChild(links);
      top.appendChild(topContent);
      wrapper.appendChild(top);
      wrapper.appendChild(buildPresentationListSection(eligiblePresentations));

      const bioSection = createEl('div', 'space-y-2');
      appendSectionHeading(bioSection, 'Bio');
      appendHtmlOrFallback({
        parent: bioSection,
        html: speaker?.bioHtml || textToHtml(speaker?.bio || ''),
        fallbackText: bioFallbackText,
        className: 'rich-content rich-content--compact',
      });
      wrapper.appendChild(bioSection);

      return wrapper;
    };

    const buildPresentationDetailsContent = (presentation) => {
      const speakers = getSortedSpeakers(presentation?.speakers);
      const bioSpeakers = getSortedSpeakers(
        Array.isArray(presentation?.bioSpeakers) && presentation.bioSpeakers.length
          ? presentation.bioSpeakers
          : speakers,
      );
      const wrapper = createEl('div', 'space-y-6');
      const speakersSection = createEl('div', 'space-y-3');
      appendSectionHeading(speakersSection, speakers.length === 1 ? 'Speaker' : 'Speakers');

      if (speakers.length) {
        const speakersList = createEl(
          'div',
          speakers.length > 1 ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4',
        );
        speakers.forEach((speaker) => {
          const speakerName = speaker.name || 'Presenter';
          const speakerRow = createEl(
            'div',
            speakers.length > 1
              ? 'flex items-start gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-3'
              : 'flex flex-col items-start gap-4 sm:flex-row',
          );
          speakerRow.appendChild(
            createAvatar({
              src: speaker.avatar,
              alt: `${speakerName} avatar`,
              className:
                speakers.length > 1
                  ? 'h-16 w-16 shrink-0 rounded-lg object-cover ring-2 ring-pnsqc-gold/30'
                  : 'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
            }),
          );

          const speakerContent = createEl('div', 'space-y-2');
          speakerContent.appendChild(
            createEl('h4', 'text-base font-semibold text-white', speakerName),
          );
          if (speaker.profession) {
            speakerContent.appendChild(
              createEl('p', 'text-sm text-pnsqc-slate', speaker.profession),
            );
          }
          if (speaker.organization) {
            speakerContent.appendChild(
              createEl('p', 'text-sm text-pnsqc-slate', speaker.organization),
            );
          }
          const links = createSpeakerLinks(speaker, 'flex flex-wrap items-center gap-2');
          if (links) speakerContent.appendChild(links);
          speakerRow.appendChild(speakerContent);
          speakersList.appendChild(speakerRow);
        });
        speakersSection.appendChild(speakersList);
      } else {
        speakersSection.appendChild(createDetailsText('Speaker details are coming soon.'));
      }
      wrapper.appendChild(speakersSection);

      const abstractSection = createEl('div', 'space-y-2');
      appendSectionHeading(
        abstractSection,
        presentation?.presentationType === 'workshop' ? 'Description' : 'Abstract',
      );
      appendHtmlOrFallback({
        parent: abstractSection,
        html: getPresentationHtml(presentation),
        fallbackText: 'Abstract details are coming soon.',
        className: 'rich-content rich-content--compact',
      });
      wrapper.appendChild(abstractSection);

      const objectivesHtml = sanitizeHtmlFragment(getObjectivesHtml(presentation));
      if (objectivesHtml) {
        const objectivesSection = createEl('div', 'space-y-2');
        appendSectionHeading(objectivesSection, 'Learning Objectives');
        objectivesSection.appendChild(
          createHtmlContent(objectivesHtml, 'rich-content rich-content--compact'),
        );
        wrapper.appendChild(objectivesSection);
      }

      const bioSection = createEl('div', 'space-y-3');
      appendSectionHeading(bioSection, bioSpeakers.length === 1 ? 'Bio' : 'Bios');
      if (bioSpeakers.length) {
        bioSpeakers.forEach((speaker) => {
          if (bioSpeakers.length > 1) {
            bioSection.appendChild(
              createEl('h4', 'text-sm font-semibold text-white', speaker.name || 'Presenter'),
            );
          }
          appendHtmlOrFallback({
            parent: bioSection,
            html: speaker.bioHtml || textToHtml(speaker.bio || ''),
            fallbackText: bioFallbackText,
            className: 'rich-content rich-content--compact',
          });
        });
      } else {
        bioSection.appendChild(createDetailsText(bioFallbackText));
      }
      wrapper.appendChild(bioSection);
      return wrapper;
    };

    const buildSpeakerCard = ({ speaker, templateId, categoryLabel }) => {
      const speakerName = speaker.name || 'Presenter';
      const displayPresentation = asArray(speaker.presentations)[0] || null;
      const { card, layout, content } = createCardLayout();
      const avatarWrap = createEl('div', 'shrink-0');
      avatarWrap.appendChild(
        createAvatar({
          src: speaker.avatar,
          alt: `${speakerName} avatar`,
          className: 'h-32 w-32 rounded-lg object-cover ring-2 ring-pnsqc-gold/30',
        }),
      );

      const links = createSpeakerLinks(speaker, 'ml-auto flex shrink-0 items-center gap-2');
      content.appendChild(createCardHeader({ title: speakerName, links }));
      if (speaker.profession) {
        content.appendChild(createEl('p', 'mt-1 text-sm text-pnsqc-slate', speaker.profession));
      }
      if (speaker.organization) {
        content.appendChild(createEl('p', 'mt-1 text-sm text-pnsqc-slate', speaker.organization));
      }
      if (displayPresentation) {
        const topic = createPresentationTopic(
          displayPresentation,
          'mt-3 text-xs text-pnsqc-cyan/90',
        );
        if (topic) content.appendChild(topic);
        content.appendChild(
          createEl('p', 'mt-2 text-sm text-pnsqc-gold', displayPresentation.title),
        );
      }
      /*
      if (asArray(speaker.presentations).length > 1) {
        content.appendChild(
          createEl(
            'p',
            'mt-2 text-xs uppercase tracking-widest text-pnsqc-cyan/80',
            `${speaker.presentations.length} presentations`,
          ),
        );
      }
      */

      appendReadMore({
        content,
        templateId,
        title: speakerName,
        label: categoryLabel,
        subtitle: getPresentationTopic(displayPresentation),
      });
      layout.appendChild(avatarWrap);
      layout.appendChild(content);
      return card;
    };

    const buildPresentationCard = ({ presentation, templateId, categoryLabel }) => {
      const presentationTitle = presentation?.title || 'Presentation TBA';
      const speakers = getSortedSpeakers(presentation?.speakers);
      const { card, layout, content } = createCardLayout();
      const avatarWrap = createEl(
        'div',
        speakers.length > 1
          ? 'flex shrink-0 -space-x-4 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-x-0'
          : 'flex shrink-0 -space-x-4 sm:block sm:space-x-0',
      );

      speakers.slice(0, 4).forEach((speaker, index) => {
        const speakerName = speaker.name || 'Presenter';
        const avatar = createAvatar({
          src: speaker.avatar,
          alt: `${speakerName} avatar`,
          className:
            speakers.length > 1
              ? 'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30'
              : 'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30 sm:h-32 sm:w-32',
        });
        avatar.style.zIndex = String(speakers.length - index);
        if (speakers.length === 1 && index > 0) avatar.classList.add('sm:mt-3');
        avatarWrap.appendChild(avatar);
      });

      if (!avatarWrap.childElementCount) {
        avatarWrap.appendChild(
          createAvatar({
            src: fallbackAvatar,
            alt: 'PNSQC logo',
            className:
              'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30 sm:h-32 sm:w-32',
          }),
        );
      }

      const links =
        speakers.length === 1
          ? createSpeakerLinks(speakers[0], 'ml-auto flex shrink-0 items-center gap-2')
          : null;
      content.appendChild(createCardHeader({ title: presentationTitle, links }));

      /*
      const meta = [presentation.label, formatDisplayDate(presentation.date), presentation.start]
        .filter(Boolean)
        .join(' | ');
      if (meta)
        content.appendChild(
          createEl('p', 'mt-2 text-xs uppercase tracking-widest text-pnsqc-cyan/75', meta),
        );
      */

      const speakerList = createEl(
        'div',
        speakers.length > 1 ? 'mt-3 grid gap-2 sm:grid-cols-2' : 'mt-3 space-y-2',
      );
      speakers.forEach((speaker) => {
        const speakerItem = createEl('div', 'min-w-0');
        speakerItem.appendChild(
          createEl('p', 'text-sm text-pnsqc-gold', speaker.name || 'Presenter'),
        );
        if (speaker.profession) {
          speakerItem.appendChild(
            createEl('p', 'mt-1 text-sm text-pnsqc-slate', speaker.profession),
          );
        }
        speakerList.appendChild(speakerItem);
      });
      content.appendChild(speakerList);

      appendReadMore({
        content,
        templateId,
        title: presentationTitle,
        label: categoryLabel,
        subtitle: getPresentationTopic(presentation),
      });
      layout.appendChild(avatarWrap);
      layout.appendChild(content);
      return card;
    };

    const buildSpeakerModalTemplate = ({ speaker, templateId, categoryLabel }) => ({
      template: createTemplate(templateId, buildSpeakerDetailsContent(speaker)),
      templateId,
      title: speaker.name || 'Presenter',
      categoryLabel,
    });

    const buildPresentationModalTemplate = ({ presentation, templateId, categoryLabel }) => ({
      template: createTemplate(templateId, buildPresentationDetailsContent(presentation)),
      templateId,
      title: presentation.title || 'Presentation TBA',
      categoryLabel,
    });

    return {
      asArray,
      buildModalTemplate: (speaker, categoryLabel) =>
        buildSpeakerModalTemplate({
          speaker,
          categoryLabel,
          templateId: `details-modal-template-speaker-${speaker.slug || speaker.id}`,
        }),
      buildPresentationCard,
      buildPresentationDetailsContent,
      buildPresentationModalTemplate,
      buildPresenterCard: ({ presenter, templateId, categoryLabel }) =>
        buildSpeakerCard({ speaker: presenter, templateId, categoryLabel }),
      buildPresenterDetailsContent: buildSpeakerDetailsContent,
      buildSessionCard: ({ displayPresentation, templateId, categoryLabel }) =>
        buildPresentationCard({ presentation: displayPresentation, templateId, categoryLabel }),
      buildSessionDetailsTemplate: ({ displayPresentation, templateId, categoryName }) =>
        buildPresentationModalTemplate({
          presentation: displayPresentation,
          templateId,
          categoryLabel: categoryName,
        }),
      buildSpeakerCard,
      buildSpeakerDetailsContent,
      buildSpeakerModalTemplate,
      createTemplate,
      normalizeSpace,
      sanitizeHtmlFragment,
    };
  }

  return { createRenderer };
});
