(() => {
  const root = document.querySelector('[data-program-detail]');
  if (!root || !window.PNSQCProgramData || !window.PNSQCProgramRenderer) return;

  const data = window.PNSQCProgramData;
  const configuredFallbackAvatar = root.getAttribute('data-program-detail-fallback-avatar') || '';
  let fallbackAvatar =
    data.getProgramFallbackAvatar?.({ fallbackAvatar: configuredFallbackAvatar }) ||
    configuredFallbackAvatar ||
    '/images/brand/pnsqc-logo.jpg';
  let renderer = window.PNSQCProgramRenderer.createRenderer({ fallbackAvatar });
  const statusEl = root.querySelector('[data-program-detail-status]');
  const contentEl = root.querySelector('[data-program-detail-content]');
  const eyebrowEl = root.querySelector('[data-program-detail-eyebrow]');
  const titleEl = root.querySelector('[data-program-detail-title]');
  const subtitleEl = root.querySelector('[data-program-detail-subtitle]');
  const pageTitleSuffix = 'PNSQC';
  let pageTitleHierarchy = [];

  const getRouteTitleHierarchy = (route) => {
    if (!route) return [];

    const sourceLabel =
      {
        archive: 'Archive',
        conference: 'Conference',
      }[route.source] || route.source;

    return [route.year, sourceLabel].map((part) => data.normalizeSpace(part || '')).filter(Boolean);
  };

  const getDetailCategorySlug = (route) =>
    route?.source === 'conference' && route?.year === '2026' ? 'paper-presenters' : '';

  const setDocumentTitle = (title) => {
    const normalizedTitle = data.normalizeSpace(title || '');
    const titleParts = [normalizedTitle, ...pageTitleHierarchy, pageTitleSuffix].filter(Boolean);
    document.title = titleParts.join(' - ');
  };

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  };

  const setHeader = ({ eyebrow, title, subtitle, subtitleTone = 'muted' }) => {
    if (eyebrowEl) eyebrowEl.textContent = eyebrow;
    if (titleEl) titleEl.textContent = title;
    setDocumentTitle(title);
    if (subtitleEl) {
      subtitleEl.textContent = subtitle || '';
      subtitleEl.hidden = !subtitle;
      subtitleEl.classList.toggle('text-pnsqc-cyan/90', subtitleTone === 'topic');
      subtitleEl.classList.toggle('text-pnsqc-slate', subtitleTone !== 'topic');
    }
  };

  const showMessage = ({ eyebrow, title, message }) => {
    setHeader({ eyebrow, title, subtitle: '' });
    setStatus('');
    if (!contentEl) return;

    const card = document.createElement('div');
    card.className = 'mx-auto max-w-3xl p-4 text-center';
    const text = document.createElement('p');
    text.className = 'text-sm leading-7 text-pnsqc-slate';
    text.textContent = message;
    card.appendChild(text);
    contentEl.replaceChildren(card);
  };

  const getEyebrow = ({ source, year, type }) => {
    const sectionLabel = source === 'conference' ? 'Conference' : 'Archive';
    const typeLabel = type === 'speaker' ? 'Speaker' : 'Presentation';
    return `PNSQC ${year} ${sectionLabel} ${typeLabel}`;
  };

  const getSpeakerSubtitle = (speaker) => {
    if (speaker.profession) return speaker.profession;
    const presentationTitle = data.asArray(speaker.presentations)[0]?.title;
    return presentationTitle || '';
  };

  const getPresentationSubtitle = (presentation) => {
    const topic = data.normalizeSpace(presentation?.topic || '');
    if (topic) return { text: topic, tone: 'topic' };
    return {
      text: data
        .asArray(presentation.speakers)
        .map((speaker) => speaker.name)
        .filter(Boolean)
        .join(', '),
      tone: 'muted',
    };
  };

  const hasDetailText = (value) => !!data.normalizeSpace(value || '');

  const hasPresentationDetail = (presentation) =>
    !!(
      hasDetailText(presentation?.abstract) ||
      hasDetailText(presentation?.abstractHtml) ||
      hasDetailText(presentation?.descriptionHtml) ||
      hasDetailText(presentation?.objectives) ||
      hasDetailText(presentation?.objectivesHtml)
    );

  const hasSpeakerBio = (speaker) =>
    !!(hasDetailText(speaker?.bio) || hasDetailText(speaker?.bioHtml));

  const getSubmissionId = (presentation) =>
    data.getPresentationSubmissionId
      ? data.getPresentationSubmissionId(presentation)
      : data.normalizeSpace(
          presentation?.submissionId ||
            (presentation?.presentationType === 'paper' ? presentation?.id : ''),
        );

  const presentationNeedsSubmissionDetail = (presentation, speaker) =>
    !!getSubmissionId(presentation) &&
    (!hasPresentationDetail(presentation) ||
      (speaker
        ? !hasSpeakerBio(speaker)
        : data.asArray(presentation?.speakers).some((person) => !hasSpeakerBio(person))));

  const hydratePresentation = async (presentation) => {
    if (!presentationNeedsSubmissionDetail(presentation)) return presentation;
    try {
      const detail = await data.loadMeetingHandSubmission({
        year: presentation.year || '',
        id: getSubmissionId(presentation),
      });
      return data.mergeMeetingHandSubmissionDetail
        ? data.mergeMeetingHandSubmissionDetail(presentation, detail)
        : presentation;
    } catch (error) {
      console.error(error);
      return presentation;
    }
  };

  const hydrateSpeaker = async (speaker, year) => {
    let hydrated = speaker;
    for (const presentation of data.asArray(speaker?.presentations)) {
      if (!presentationNeedsSubmissionDetail(presentation, hydrated)) continue;
      try {
        const detail = await data.loadMeetingHandSubmission({
          year,
          id: getSubmissionId(presentation),
        });
        hydrated = data.mergeMeetingHandSubmissionDetailIntoSpeaker
          ? data.mergeMeetingHandSubmissionDetailIntoSpeaker(hydrated, presentation, detail)
          : hydrated;
      } catch (error) {
        console.error(error);
      }
    }
    return hydrated;
  };

  const hydrateDetailItem = async (route, item) => {
    if (route.source !== 'conference') return item;
    return route.type === 'speaker'
      ? hydrateSpeaker(item, route.year)
      : hydratePresentation({ ...item, year: route.year });
  };

  const configureFallbackAvatar = (route) => {
    fallbackAvatar =
      data.getProgramFallbackAvatar?.({
        source: route.source,
        year: route.year,
        fallbackAvatar: configuredFallbackAvatar,
      }) ||
      configuredFallbackAvatar ||
      fallbackAvatar;
    renderer = window.PNSQCProgramRenderer.createRenderer({
      fallbackAvatar,
      bioFallbackText: route.source === 'archive' ? 'No bio was provided.' : undefined,
    });
  };

  const renderDetail = ({ route, item }) => {
    const isSpeaker = route.type === 'speaker';
    const title = isSpeaker ? item.name : item.title;
    const presentationSubtitle = isSpeaker ? null : getPresentationSubtitle(item);
    const subtitle = isSpeaker ? getSpeakerSubtitle(item) : presentationSubtitle.text;
    const subtitleTone = isSpeaker ? 'muted' : presentationSubtitle.tone;
    const eyebrow = getEyebrow(route);
    const content = isSpeaker
      ? renderer.buildSpeakerDetailsContent(item)
      : renderer.buildPresentationDetailsContent(item);

    setHeader({ eyebrow, title, subtitle, subtitleTone });
    setStatus('');
    if (contentEl) contentEl.replaceChildren(content);
  };

  const load = async () => {
    const route = data.parseProgramDetailRoute(window.location.pathname);
    if (!route) {
      pageTitleHierarchy = [];
      showMessage({
        eyebrow: 'Program Details',
        title: 'Page not found',
        message: 'This program detail route is not recognized.',
      });
      return;
    }
    pageTitleHierarchy = getRouteTitleHierarchy(route);
    configureFallbackAvatar(route);

    const name = new URLSearchParams(window.location.search).get('name')?.trim();
    const eyebrow = getEyebrow(route);
    if (!name) {
      showMessage({
        eyebrow,
        title: 'Missing detail name',
        message: 'Add a name query parameter to choose the speaker or presentation to display.',
      });
      return;
    }

    setHeader({
      eyebrow,
      title: route.type === 'speaker' ? 'Loading speaker...' : 'Loading presentation...',
      subtitle: '',
    });
    setStatus(
      route.type === 'speaker' ? 'Loading speaker details...' : 'Loading presentation details...',
    );

    try {
      const indexes = await data.loadProgram({
        source: route.source,
        year: route.year,
        fallbackAvatar,
        categorySlug: getDetailCategorySlug(route),
      });
      const item =
        route.type === 'speaker'
          ? indexes.speakerBySlug.get(name)
          : indexes.presentationBySlug.get(name);

      if (!item) {
        showMessage({
          eyebrow,
          title: 'Details not found',
          message: `No ${route.type} matched "${name}" for PNSQC ${route.year}.`,
        });
        return;
      }

      const hydratedItem = await hydrateDetailItem(route, item);
      renderDetail({ route, item: hydratedItem });
    } catch {
      showMessage({
        eyebrow,
        title: 'Details unavailable',
        message: 'Program details are not available right now. Please try again later.',
      });
    }
  };

  load();
})();
