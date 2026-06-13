(() => {
  const root = document.querySelector('[data-program-directory]');
  if (!root || !window.PNSQCProgramData || !window.PNSQCProgramRenderer) return;

  const data = window.PNSQCProgramData;
  const normalizeSpace =
    data.normalizeSpace ||
    ((value) =>
      value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim());
  const route = data.parseProgramListRoute(window.location.pathname);
  if (!route) return;

  const fallbackAvatar =
    data.getProgramFallbackAvatar?.({
      source: route.source,
      year: route.year,
      fallbackAvatar: root.getAttribute('data-program-fallback-avatar'),
    }) ||
    root.getAttribute('data-program-fallback-avatar') ||
    '/images/brand/pnsqc-logo.jpg';
  const renderer = window.PNSQCProgramRenderer.createRenderer({
    fallbackAvatar,
    bioFallbackText: route.source === 'archive' ? 'No bio was provided.' : undefined,
  });
  const statusEl = root.querySelector('[data-program-status]');
  const sectionsEl = root.querySelector('[data-program-sections]');
  const templateRoot = root.querySelector('[data-program-templates]') || root;
  const config = route.config;
  const modalRecords = new Map();

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  };

  const createEl = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === 'string') el.textContent = text;
    return el;
  };

  const createSection = (sectionConfig) => {
    const section = createEl('section', 'flex flex-col gap-8');
    const title = createEl(
      'h2',
      `text-center text-xs font-semibold uppercase tracking-widest ${
        sectionConfig.headingClass || 'text-pnsqc-gold'
      }`,
      sectionConfig.title || config.title,
    );
    const grid = createEl('div', 'mx-auto grid max-w-5xl gap-8 md:grid-cols-2');
    const empty = createEl(
      'p',
      'mt-6 text-center text-sm italic text-pnsqc-slate',
      sectionConfig.emptyText || config.emptyText,
    );
    empty.hidden = true;
    section.appendChild(title);
    section.appendChild(grid);
    section.appendChild(empty);
    return { empty, grid, section };
  };

  const getTemplateId = (type, item, index) =>
    `details-modal-template-${type}-${item.slug || item.id || index}`;

  const getSpeakerSummary = (speaker) => ({
    id: speaker?.id,
    slug: speaker?.slug,
    name: speaker?.name || 'Presenter',
    profession: speaker?.profession || '',
    organization: speaker?.organization || '',
    avatar: speaker?.avatar || fallbackAvatar,
    linkedin: speaker?.linkedin || '',
    homepage: speaker?.homepage || '',
    bio: speaker?.bio || '',
    bioHtml: speaker?.bioHtml || '',
  });

  const shouldUsePresentationModalForSpeaker = (speaker) =>
    route.source === 'conference' &&
    config.slug === 'paper-presenters' &&
    data.asArray(speaker?.presentations).length === 1;

  const getSpeakerPresentationDetail = (speaker) => {
    const presentation = data.asArray(speaker?.presentations)[0] || null;
    if (!presentation) return null;
    return {
      ...presentation,
      speakers: [getSpeakerSummary(speaker)],
    };
  };

  const getModalConfig = ({ item, templateId, categoryLabel }) => {
    if (config.cardType === 'speaker' && shouldUsePresentationModalForSpeaker(item)) {
      const presentation = getSpeakerPresentationDetail(item);
      if (presentation) {
        return {
          modal: renderer.buildPresentationModalTemplate({
            presentation,
            templateId,
            categoryLabel: 'Presentation',
          }),
          title: presentation.title || item.name || 'Presentation',
          label: 'Presentation',
        };
      }
    }

    if (config.cardType === 'speaker') {
      return {
        modal: renderer.buildSpeakerModalTemplate({ speaker: item, templateId, categoryLabel }),
        title: item.name || 'Presenter',
        label: categoryLabel,
      };
    }

    return {
      modal: renderer.buildPresentationModalTemplate({
        presentation: item,
        templateId,
        categoryLabel,
      }),
      title: item.title || 'Presentation TBA',
      label: categoryLabel,
    };
  };

  const hasPresentationDetail = (presentation) =>
    !!(
      normalizeSpace(presentation?.abstract) ||
      normalizeSpace(presentation?.abstractHtml) ||
      normalizeSpace(presentation?.descriptionHtml) ||
      normalizeSpace(presentation?.objectives) ||
      normalizeSpace(presentation?.objectivesHtml)
    );

  const hasSpeakerBio = (speaker) =>
    !!(normalizeSpace(speaker?.bio) || normalizeSpace(speaker?.bioHtml));

  const getSubmissionId = (presentation) =>
    data.getPresentationSubmissionId
      ? data.getPresentationSubmissionId(presentation)
      : normalizeSpace(
          presentation?.submissionId ||
            (presentation?.presentationType === 'paper' ? presentation?.id : ''),
        );

  const presentationNeedsSubmissionDetail = (presentation, speaker) =>
    route.source === 'conference' &&
    !!getSubmissionId(presentation) &&
    (!hasPresentationDetail(presentation) ||
      (speaker
        ? !hasSpeakerBio(speaker)
        : data.asArray(presentation?.speakers).some((person) => !hasSpeakerBio(person))));

  const getPresentationsNeedingSubmissionDetail = (item) => {
    if (config.cardType === 'speaker') {
      return data
        .asArray(item?.presentations)
        .filter((presentation) => presentationNeedsSubmissionDetail(presentation, item));
    }
    return presentationNeedsSubmissionDetail(item) ? [item] : [];
  };

  const replaceTemplate = ({ templateId, item, categoryLabel }) => {
    const { modal } = getModalConfig({ item, templateId, categoryLabel });
    document.getElementById(templateId)?.replaceWith(modal.template);
  };

  const mergeSubmissionDetail = (presentation, detail) =>
    data.mergeMeetingHandSubmissionDetail
      ? data.mergeMeetingHandSubmissionDetail(presentation, detail)
      : presentation;

  const mergeSubmissionDetailIntoSpeaker = (speaker, presentation, detail) =>
    data.mergeMeetingHandSubmissionDetailIntoSpeaker
      ? data.mergeMeetingHandSubmissionDetailIntoSpeaker(speaker, presentation, detail)
      : speaker;

  const loadSubmissionDetail = async (presentation) => {
    const submissionId = getSubmissionId(presentation);
    if (!submissionId) return null;
    return data.loadMeetingHandSubmission({ year: route.year, id: submissionId });
  };

  const hydrateItemSubmissionDetails = async (item) => {
    let hydrated = item;
    const presentations = getPresentationsNeedingSubmissionDetail(item);

    for (const presentation of presentations) {
      const detail = await loadSubmissionDetail(presentation);
      if (!detail) continue;

      if (config.cardType === 'speaker') {
        hydrated = mergeSubmissionDetailIntoSpeaker(hydrated, presentation, detail);
      } else {
        hydrated = mergeSubmissionDetail(hydrated, detail);
      }
    }

    return hydrated;
  };

  const markSubmissionTrigger = ({ card, templateId }) => {
    const trigger = card.querySelector(`[data-details-modal-open="${templateId}"]`);
    if (
      !trigger ||
      !getPresentationsNeedingSubmissionDetail(modalRecords.get(templateId)?.item).length
    ) {
      return;
    }
    trigger.setAttribute('data-program-submission-trigger', 'true');
    trigger.setAttribute('data-program-template-id', templateId);
  };

  const renderCard = ({ item, sectionConfig, index }) => {
    const categoryLabel = sectionConfig.label || config.defaultLabel;
    if (config.cardType === 'speaker') {
      const templateId = getTemplateId('speaker', item, index);
      const { label, modal, title } = getModalConfig({ item, templateId, categoryLabel });
      const card = renderer.buildSpeakerCard({
        speaker: item,
        templateId: modal.templateId,
        categoryLabel,
      });
      const trigger = card.querySelector(`[data-details-modal-open="${modal.templateId}"]`);
      if (trigger) {
        trigger.setAttribute('data-details-modal-title', title);
        trigger.setAttribute('data-details-modal-label', label);
      }
      modalRecords.set(modal.templateId, { categoryLabel, item, templateId: modal.templateId });
      markSubmissionTrigger({ card, templateId: modal.templateId });
      return { card, template: modal.template };
    }

    const templateId = getTemplateId('presentation', item, index);
    const { modal } = getModalConfig({ item, templateId, categoryLabel });
    const card = renderer.buildPresentationCard({
      presentation: item,
      templateId: modal.templateId,
      categoryLabel,
    });
    modalRecords.set(modal.templateId, { categoryLabel, item, templateId: modal.templateId });
    markSubmissionTrigger({ card, templateId: modal.templateId });
    return { card, template: modal.template };
  };

  const openHydratedModal = async (trigger) => {
    const templateId = trigger.getAttribute('data-program-template-id');
    const record = modalRecords.get(templateId);
    if (!record || trigger.getAttribute('data-program-loading') === 'true') return;

    trigger.setAttribute('data-program-loading', 'true');
    trigger.setAttribute('aria-busy', 'true');
    if (trigger instanceof HTMLButtonElement) trigger.disabled = true;

    try {
      const hydrated = await hydrateItemSubmissionDetails(record.item);
      modalRecords.set(templateId, { ...record, item: hydrated });
      replaceTemplate({ ...record, item: hydrated });
    } catch (error) {
      console.error(error);
    } finally {
      trigger.removeAttribute('data-program-loading');
      trigger.removeAttribute('aria-busy');
      trigger.removeAttribute('data-program-submission-trigger');
      if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
    }

    trigger.click();
  };

  root.addEventListener('click', (event) => {
    const trigger =
      event.target instanceof Element
        ? event.target.closest('[data-program-submission-trigger="true"]')
        : null;
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openHydratedModal(trigger);
  });

  const renderProgram = (program) => {
    if (!sectionsEl) return;
    sectionsEl.replaceChildren();
    templateRoot.replaceChildren();
    modalRecords.clear();

    const selectedItems = data.selectProgramItems(program, config);
    const sectionViews = new Map();

    data.asArray(config.sections).forEach((sectionConfig) => {
      const view = createSection(sectionConfig);
      sectionViews.set(sectionConfig.key, { ...view, count: 0, sectionConfig });
      sectionsEl.appendChild(view.section);
    });

    selectedItems.forEach((item, index) => {
      const sectionConfig = data.getSectionForItem(item, config) || config.sections[0];
      const sectionView = sectionViews.get(sectionConfig.key);
      if (!sectionView) return;

      const { card, template } = renderCard({ item, sectionConfig, index });
      templateRoot.appendChild(template);
      sectionView.grid.appendChild(card);
      sectionView.count += 1;
    });

    sectionViews.forEach((sectionView) => {
      sectionView.empty.hidden = sectionView.count > 0;
    });
  };

  const load = async () => {
    setStatus(config.loadingText);
    try {
      const program = await data.loadProgram({
        source: route.source,
        year: route.year,
        fallbackAvatar,
        categorySlug: route.category,
      });
      renderProgram(program);
      setStatus('');
    } catch {
      setStatus(config.errorText);
      if (sectionsEl) {
        sectionsEl.replaceChildren();
        data.asArray(config.sections).forEach((sectionConfig) => {
          const view = createSection(sectionConfig);
          view.empty.hidden = false;
          sectionsEl.appendChild(view.section);
        });
      }
    }
  };

  load();
})();
