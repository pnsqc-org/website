/* global module */

(function (root, factory) {
  const api = factory(root.PNSQCSlugs || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PNSQCProgramData = api;
  root.PNSQCProgram = {
    ...(root.PNSQCProgram || {}),
    data: api,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this, function (slugs) {
  const fallbackSlugify =
    slugs.slugify ||
    ((value, fallback = 'item') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback);

  const assignGeneratedSlugs =
    slugs.assignGeneratedSlugs ||
    ((items, { getText, getId, fallback = 'item' } = {}) =>
      asArray(items).map((item, index) => ({
        ...item,
        slug: fallbackSlugify(getText?.(item) || getId?.(item) || index + 1, fallback),
      })));

  const FALLBACK_AVATAR = '/images/brand/pnsqc-logo.jpg';
  const YEAR_FALLBACK_AVATARS = {
    2025: '/images/brand/pnsqc-logo-2025.jpg',
    2026: '/images/brand/pnsqc-logo-2026.jpg',
  };
  const WORKSHOP_DATES = {
    2026: '2026-10-14',
  };

  const CATEGORY_CONFIGS = {
    'keynotes-invited-speakers': {
      slug: 'keynotes-invited-speakers',
      sourceKinds: ['conference'],
      cardType: 'presentation',
      title: 'Keynotes & Invited Speakers',
      defaultLabel: 'Speaker',
      loadingText: 'Loading speakers...',
      errorText: 'Speakers will be announced soon.',
      emptyText: 'More speakers to be announced.',
      filters: {
        includeCategoryIds: [111, 104],
        excludeWorkshopDate: true,
      },
      sections: [
        {
          key: 'keynotes',
          title: 'Keynote Speakers',
          label: 'Keynote',
          categoryIds: [111],
          headingClass: 'text-pnsqc-gold',
        },
        {
          key: 'invited',
          title: 'Invited Speakers / Special Guests',
          label: 'Invited Speaker',
          categoryIds: [104],
          headingClass: 'text-pnsqc-cyan',
        },
      ],
    },
    workshops: {
      slug: 'workshops',
      sourceKinds: ['conference'],
      cardType: 'presentation',
      title: 'Workshops',
      defaultLabel: 'Workshop',
      loadingText: 'Loading workshops...',
      errorText: 'Workshops will be announced soon.',
      emptyText: 'Workshop speakers will be announced soon.',
      filters: {
        includeWorkshopDate: true,
      },
      sections: [
        {
          key: 'workshops',
          title: 'Workshops',
          label: 'Workshop',
          headingClass: 'text-pnsqc-gold',
        },
      ],
    },
    'paper-presenters': {
      slug: 'paper-presenters',
      sourceKinds: ['conference', 'archive'],
      cardType: 'speaker',
      title: 'Paper Presenters',
      defaultLabel: 'Paper Presenter',
      loadingText: 'Loading paper presenters...',
      errorText: 'Paper presenters are not available right now.',
      emptyText: 'Check back soon for our accepted paper presenters!',
      filters: {
        includePresentationTypes: ['paper'],
        excludeCategoryIds: [111, 104],
        excludeWorkshopDate: true,
      },
      sections: [
        {
          key: 'paper-presenters',
          title: 'Paper Presenters',
          label: 'Paper Presenter',
          categorySlugs: ['paper-presenters'],
          headingClass: 'text-pnsqc-gold',
        },
      ],
    },
  };

  const requestCache = new Map();

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeSpace(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function toNullableNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function textToHtml(value) {
    const normalized = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim();
    if (!normalized) return '';
    return normalized
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function compactRecord(record) {
    Object.keys(record).forEach((key) => {
      if (record[key] === '' || record[key] === null || record[key] === undefined) {
        delete record[key];
      }
    });
    return record;
  }

  function stripHtml(value) {
    return normalizeSpace(String(value || '').replace(/<[^>]*>/g, ' '));
  }

  function normalizeCompareText(value) {
    return normalizeSpace(stripHtml(value)).replace(/:\s*$/, '').toLowerCase();
  }

  function extractDateKey(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function getProgramFallbackAvatar({ year, fallbackAvatar } = {}) {
    const explicitFallback = normalizeSpace(fallbackAvatar);
    if (explicitFallback && explicitFallback !== FALLBACK_AVATAR) return explicitFallback;
    return YEAR_FALLBACK_AVATARS[String(year)] || FALLBACK_AVATAR;
  }

  function getWorkshopDate(year) {
    return WORKSHOP_DATES[String(year)] || '';
  }

  function getProgramCategoryConfig(categorySlug, year) {
    const base = CATEGORY_CONFIGS[categorySlug] || null;
    if (!base) return null;
    return {
      ...base,
      filters: { ...(base.filters || {}) },
      sections: asArray(base.sections).map((section) => ({ ...section })),
      workshopDate: getWorkshopDate(year),
    };
  }

  function parseProgramListRoute(pathname) {
    const match = String(pathname || '').match(/^\/(conference|archive)\/(\d{4})\/([^/?#]+)\/?$/);
    if (!match) return null;
    const route = {
      source: match[1],
      year: match[2],
      category: match[3],
    };
    const config = getProgramCategoryConfig(route.category, route.year);
    if (!config || !config.sourceKinds.includes(route.source)) return null;
    return { ...route, config };
  }

  function parseProgramDetailRoute(pathname) {
    const match = String(pathname || '').match(
      /^\/(conference|archive)\/(\d{4})\/(speaker|presentation)$/,
    );
    if (!match) return null;
    return {
      source: match[1],
      year: match[2],
      type: match[3],
    };
  }

  function getProgramEndpoint({ source, year }) {
    if (source === 'conference') return `https://api.meetinghand.com/api/events/pnsqc-${year}`;
    return `/data/archive/${year}/program.json`;
  }

  function getMeetingHandSubmissionEndpoint({ year, id }) {
    return `${getProgramEndpoint({ source: 'conference', year })}/submissions/${encodeURIComponent(
      String(id || ''),
    )}`;
  }

  function getPresenterDetails(presenter) {
    if (!presenter || typeof presenter !== 'object') return {};
    const numericKey = Object.keys(presenter).find((key) => /^\d+$/.test(key));
    const presenterFields = Object.fromEntries(
      Object.entries(presenter).filter(([key]) => key !== 'details' && !/^\d+$/.test(key)),
    );
    const details =
      presenter.details && typeof presenter.details === 'object' ? presenter.details : {};
    const numericDetails =
      numericKey && presenter[numericKey] && typeof presenter[numericKey] === 'object'
        ? presenter[numericKey]
        : {};
    return {
      ...presenterFields,
      ...details,
      ...numericDetails,
    };
  }

  function getMeetingHandSpeakerName(speaker) {
    return `${speaker?.firstname || ''} ${speaker?.lastname || ''}`.trim() || 'Presenter';
  }

  function getSessionRecord(presentation) {
    return presentation?.session?.session || null;
  }

  function getMeetingHandPresentationDate(presentation) {
    return extractDateKey(getSessionRecord(presentation)?.day?.date || '');
  }

  function compareMeetingHandPresentations(left, right) {
    const leftDate = getMeetingHandPresentationDate(left);
    const rightDate = getMeetingHandPresentationDate(right);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    if (leftDate !== rightDate) return leftDate ? -1 : 1;

    const leftStart = normalizeSpace(getSessionRecord(left)?.start || '');
    const rightStart = normalizeSpace(getSessionRecord(right)?.start || '');
    if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);

    const leftOrder = Number(left?.session?.order ?? left?.order ?? Number.MAX_SAFE_INTEGER);
    const rightOrder = Number(right?.session?.order ?? right?.order ?? Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return normalizeSpace(left?.title || '').localeCompare(normalizeSpace(right?.title || ''));
  }

  function getSortedMeetingHandPresentations(details) {
    return asArray(details?.presentations)
      .filter(Boolean)
      .slice()
      .sort(compareMeetingHandPresentations);
  }

  function extractAbstractMapWithDom(html) {
    if (typeof DOMParser === 'undefined') return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ''), 'text/html');
    const children = Array.from(doc.body.children);
    const map = new Map();

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

      if (blockquote?.innerHTML) {
        map.set(titleText, blockquote.innerHTML.trim());
      }
    }

    return map;
  }

  function extractAbstractMapWithRegex(html) {
    const map = new Map();
    const pattern = /<p[^>]*>([\s\S]*?)<\/p>\s*<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    let match = pattern.exec(String(html || ''));
    while (match) {
      const titleText = normalizeCompareText(match[1]);
      if (titleText && match[2]) map.set(titleText, match[2].trim());
      match = pattern.exec(String(html || ''));
    }
    return map;
  }

  function extractAbstractMap(html) {
    return extractAbstractMapWithDom(html) || extractAbstractMapWithRegex(html);
  }

  function extractMeetingHandAbstractHtml(presentation) {
    const titleKey = normalizeCompareText(presentation?.title || '');
    if (!titleKey) return '';
    const session = getSessionRecord(presentation);
    const html = session?.description || '';
    if (!html) return '';
    const abstractMap = extractAbstractMap(html);
    return abstractMap.get(titleKey) || '';
  }

  function normalizeCategory(category) {
    if (!category || typeof category !== 'object') return null;
    const id = toNullableNumber(category.id);
    const name = normalizeSpace(category.name || '');
    return {
      id,
      slug: normalizeSpace(category.slug || '') || fallbackSlugify(name || id, 'category'),
      name,
      order: toNullableNumber(category.order),
    };
  }

  function presentationTypeFor({ categoryId, date, year, categorySlug, explicitType }) {
    const normalizedExplicitType = normalizePresentationType(explicitType);
    if (normalizedExplicitType) return normalizedExplicitType;
    if (categorySlug === 'paper-presenters') return 'paper';
    if (date && date === getWorkshopDate(year)) return 'workshop';
    if (categoryId === 111) return 'keynote';
    if (categoryId === 104) return 'invited';
    return 'paper';
  }

  function normalizePresentationType(value) {
    const normalized = normalizeSpace(value).toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('workshop')) return 'workshop';
    if (normalized.includes('keynote')) return 'keynote';
    if (normalized.includes('invited')) return 'invited';
    if (normalized.includes('paper') || normalized.includes('submission')) return 'paper';
    return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function getLastNameKey(name) {
    const parts = normalizeSpace(name).split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || '').toLowerCase();
  }

  function comparePeopleByLastName(left, right) {
    const lastName = getLastNameKey(left?.name).localeCompare(getLastNameKey(right?.name));
    if (lastName !== 0) return lastName;
    return normalizeSpace(left?.name).localeCompare(normalizeSpace(right?.name));
  }

  function sortPeopleByLastName(people) {
    return asArray(people).slice().sort(comparePeopleByLastName);
  }

  function compareSpeakers(left, right) {
    if (left.sortOrder !== null && right.sortOrder !== null && left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return normalizeSpace(left.name).localeCompare(normalizeSpace(right.name));
  }

  function comparePresentations(left, right) {
    if (left.date && right.date && left.date !== right.date)
      return left.date.localeCompare(right.date);
    if (left.date !== right.date) return left.date ? -1 : 1;
    if (left.start && right.start && left.start !== right.start)
      return left.start.localeCompare(right.start);
    if (left.start !== right.start) return left.start ? -1 : 1;
    if (left.order !== right.order) return (left.order || 0) - (right.order || 0);
    if (left.sortOrder !== right.sortOrder) return (left.sortOrder || 0) - (right.sortOrder || 0);
    return normalizeSpace(left.title).localeCompare(normalizeSpace(right.title));
  }

  function getPresentationGroupKey(presentation, speaker) {
    const session = getSessionRecord(presentation);
    const title = normalizeCompareText(presentation?.title || '');
    const categoryId = speaker?.event_speaker_category_id || 'category';
    if (session?.id && title) return `session-${session.id}-${title}-${categoryId}`;
    const date = getMeetingHandPresentationDate(presentation);
    const start = normalizeSpace(session?.start || '');
    if (date && start && title) return `slot-${date}-${start}-${title}-${categoryId}`;
    if (title) return `title-${title}-${categoryId}`;
    if (presentation?.id) return `presentation-${presentation.id}`;
    return `speaker-${speaker?.id || 'unknown'}`;
  }

  function getMeetingHandPersonName(person) {
    return (
      normalizeSpace(person?.name) ||
      normalizeSpace(`${person?.firstname || ''} ${person?.lastname || ''}`) ||
      normalizeSpace(person?.full_name)
    );
  }

  function getSchedulePresentationSpeakerCandidates(presentation) {
    const candidates = []
      .concat(asArray(presentation?.speakers))
      .concat(presentation?.speaker ? [presentation.speaker] : [])
      .concat(asArray(presentation?.authors))
      .concat(presentation?.presenterAuthor ? [presentation.presenterAuthor] : [])
      .concat(presentation?.presenter_author ? [presentation.presenter_author] : [])
      .concat(presentation?.participant ? [presentation.participant] : []);
    const seen = new Set();
    return candidates.filter((candidate) => {
      const name = getMeetingHandPersonName(candidate);
      if (!name) return false;
      const key = normalizeCompareText(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getScheduleItemSubmissionId(item) {
    if (Array.isArray(item?._scheduleItems)) {
      const found = item._scheduleItems.map(getScheduleItemSubmissionId).find(Boolean);
      return found || '';
    }
    if (item?.participant_submission_id) return String(item.participant_submission_id);
    if (item?.presentation?.presentation_type && item?.presentation?.id) {
      return String(item.presentation.id);
    }
    return '';
  }

  function getPresentationSubmissionId(presentation) {
    return normalizeSpace(
      presentation?.submissionId ||
        presentation?.participantSubmissionId ||
        presentation?.source?.submissionId ||
        (presentation?.presentationType === 'paper' ? presentation?.id : ''),
    );
  }

  function getSchedulePresentationGroupMatch(groups, { title, date, start }) {
    const titleKey = normalizeCompareText(title);
    return groups.find(
      (group) =>
        normalizeCompareText(group.title) === titleKey &&
        (!date || !group.date || group.date === date) &&
        (!start || !group.start || group.start === start),
    );
  }

  function getUniqueSlug(baseValue, usedSlugs, fallback) {
    const base = fallbackSlugify(baseValue, fallback);
    let candidate = base;
    let index = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    usedSlugs.add(candidate);
    return candidate;
  }

  function normalizeMeetingHandProgram(payload, options = {}) {
    const year = String(options.year || '');
    const fallbackAvatar = getProgramFallbackAvatar({
      year,
      fallbackAvatar: options.fallbackAvatar,
    });
    const eventData = payload?.data || payload || {};
    const categories = asArray(eventData.speaker_categories).map(normalizeCategory).filter(Boolean);
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const rawSpeakers = asArray(eventData.speakers)
      .filter((speaker) => speaker && speaker.publish)
      .slice()
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

    const speakers = rawSpeakers.map((speaker, index) => {
      const details = getPresenterDetails(speaker);
      const category =
        categoryById.get(toNullableNumber(speaker.event_speaker_category_id)) || null;
      return {
        id: String(speaker.id ?? index),
        name: getMeetingHandSpeakerName(speaker),
        profession: normalizeSpace(speaker.profession || ''),
        organization: normalizeSpace(details.organization || ''),
        avatar: normalizeSpace(speaker.avatar || '') || fallbackAvatar,
        linkedin: normalizeSpace(details.linkedin || ''),
        homepage: normalizeSpace(details.homepage || ''),
        email: normalizeSpace(details.email || ''),
        bio: normalizeSpace(details.short_bio || ''),
        bioHtml: textToHtml(details.short_bio || ''),
        categoryId: category?.id ?? toNullableNumber(speaker.event_speaker_category_id),
        categorySlug: category?.slug || '',
        sortOrder: toNullableNumber(speaker.order),
        presentationRefs: [],
        presentations: [],
      };
    });

    const speakersWithSlugs = assignGeneratedSlugs(speakers, {
      getText: (speaker) => speaker.name,
      getId: (speaker) => speaker.id,
      fallback: 'speaker',
    });
    const speakerById = new Map(speakersWithSlugs.map((speaker) => [speaker.id, speaker]));

    const groups = [];
    const groupsByKey = new Map();

    rawSpeakers.forEach((rawSpeaker) => {
      const speaker = speakerById.get(String(rawSpeaker.id));
      if (!speaker) return;
      const details = getPresenterDetails(rawSpeaker);

      getSortedMeetingHandPresentations(details).forEach((rawPresentation) => {
        const session = getSessionRecord(rawPresentation);
        const date = getMeetingHandPresentationDate(rawPresentation);
        const key = getPresentationGroupKey(rawPresentation, rawSpeaker);
        const category = categoryById.get(speaker.categoryId) || null;
        let group = groupsByKey.get(key);

        if (!group) {
          group = {
            id: String(rawPresentation?.id ?? session?.id ?? key),
            title: normalizeSpace(rawPresentation?.title || '') || 'Presentation TBA',
            abstract: stripHtml(extractMeetingHandAbstractHtml(rawPresentation)),
            abstractHtml: extractMeetingHandAbstractHtml(rawPresentation),
            descriptionHtml: extractMeetingHandAbstractHtml(rawPresentation),
            presentationType: presentationTypeFor({
              categoryId: speaker.categoryId,
              date,
              year,
              categorySlug: category?.slug || '',
            }),
            categoryId: speaker.categoryId,
            categorySlug: category?.slug || '',
            label: normalizeSpace(session?.title || ''),
            submissionId: normalizeSpace(rawPresentation?.submissionId || ''),
            date,
            start: normalizeSpace(session?.start || ''),
            end: normalizeSpace(session?.end || ''),
            location: normalizeSpace(session?.location || ''),
            order: Number(
              rawPresentation?.session?.order ?? rawPresentation?.order ?? Number.MAX_SAFE_INTEGER,
            ),
            sortOrder: Number(rawSpeaker.order ?? Number.MAX_SAFE_INTEGER),
            speakerSlugs: [],
            speakers: [],
          };
          groupsByKey.set(key, group);
          groups.push(group);
        }

        group.sortOrder = Math.min(
          group.sortOrder,
          Number(rawSpeaker.order ?? Number.MAX_SAFE_INTEGER),
        );
        if (!group.speakerSlugs.includes(speaker.slug)) group.speakerSlugs.push(speaker.slug);
      });
    });

    const presentationsWithSlugs = assignGeneratedSlugs(groups.sort(comparePresentations), {
      getText: (presentation) => presentation.title,
      getId: (presentation) => presentation.id,
      fallback: 'presentation',
    });

    const usedSpeakerSlugs = new Set(speakersWithSlugs.map((speaker) => speaker.slug));
    const usedPresentationSlugs = new Set(
      presentationsWithSlugs.map((presentation) => presentation.slug),
    );
    const speakerByName = new Map(
      speakersWithSlugs.map((speaker) => [normalizeCompareText(speaker.name), speaker]),
    );

    const ensureScheduleSpeaker = (rawSpeaker) => {
      const details = getPresenterDetails(rawSpeaker);
      const name = getMeetingHandPersonName(rawSpeaker);
      if (!name) return null;
      const nameKey = normalizeCompareText(name);
      const existing = speakerByName.get(nameKey);
      if (existing) return existing;

      const speaker = {
        id: normalizeSpace(String(rawSpeaker?.id ?? `schedule-${nameKey}`)),
        slug: getUniqueSlug(name, usedSpeakerSlugs, 'speaker'),
        name,
        profession: normalizeSpace(
          rawSpeaker?.profession || rawSpeaker?.title || details.profession || '',
        ),
        organization: normalizeSpace(rawSpeaker?.organization || details.organization || ''),
        avatar: normalizeSpace(rawSpeaker?.avatar || details.avatar || '') || fallbackAvatar,
        linkedin: normalizeSpace(rawSpeaker?.linkedin || details.linkedin || ''),
        homepage: normalizeSpace(rawSpeaker?.homepage || details.homepage || ''),
        email: normalizeSpace(rawSpeaker?.email || details.email || ''),
        bio: normalizeSpace(rawSpeaker?.bio || rawSpeaker?.short_bio || details.short_bio || ''),
        bioHtml: textToHtml(rawSpeaker?.bio || rawSpeaker?.short_bio || details.short_bio || ''),
        categoryId: toNullableNumber(rawSpeaker?.event_speaker_category_id),
        categorySlug: '',
        sortOrder: Number.MAX_SAFE_INTEGER,
        presentationRefs: [],
        presentations: [],
      };
      speakersWithSlugs.push(speaker);
      speakerByName.set(nameKey, speaker);
      return speaker;
    };

    asArray(eventData.schedule).forEach((day) => {
      const date = extractDateKey(day?.date || '');
      asArray(day?.sessions).forEach((session) => {
        const sessionStart = normalizeSpace(session?.start || '');
        const sessionEnd = normalizeSpace(session?.end || '');
        const sessionLocation = normalizeSpace(session?.location || '');
        const sessionTitle = normalizeSpace(session?.title || '');

        asArray(session?.items).forEach((item) => {
          const rawPresentation = item?.presentation;
          const title = normalizeSpace(rawPresentation?.title || '');
          if (!title) return;

          const explicitType = normalizePresentationType(
            rawPresentation?.presentation_type || item?.type,
          );
          const presentationType = presentationTypeFor({
            categoryId: null,
            date,
            year,
            categorySlug: explicitType === 'paper' ? 'paper-presenters' : '',
            explicitType,
          });
          const categorySlug = presentationType === 'paper' ? 'paper-presenters' : '';
          const submissionId = getScheduleItemSubmissionId(item);
          const existingGroup = getSchedulePresentationGroupMatch(presentationsWithSlugs, {
            title,
            date,
            start: sessionStart,
          });
          const group =
            existingGroup ||
            compactRecord({
              id: String(rawPresentation?.id ?? item?.id ?? title),
              slug: getUniqueSlug(title, usedPresentationSlugs, 'presentation'),
              title,
              abstract: '',
              abstractHtml: '',
              descriptionHtml: '',
              presentationType,
              categoryId: null,
              categorySlug,
              label: sessionTitle,
              submissionId,
              date,
              start: sessionStart,
              end: sessionEnd,
              location: sessionLocation,
              order: Number(item?.order ?? Number.MAX_SAFE_INTEGER),
              sortOrder: Number(item?.order ?? Number.MAX_SAFE_INTEGER),
              speakerSlugs: [],
              speakers: [],
            });

          if (!existingGroup) presentationsWithSlugs.push(group);
          if (!group.date && date) group.date = date;
          if (!group.start && sessionStart) group.start = sessionStart;
          if (!group.end && sessionEnd) group.end = sessionEnd;
          if (!group.location && sessionLocation) group.location = sessionLocation;
          if (!group.label && sessionTitle) group.label = sessionTitle;
          if (!group.categorySlug && categorySlug) group.categorySlug = categorySlug;
          if (!group.submissionId && submissionId) group.submissionId = submissionId;
          if (!group.presentationType && presentationType)
            group.presentationType = presentationType;

          getSchedulePresentationSpeakerCandidates(rawPresentation).forEach((rawSpeaker) => {
            const speaker = ensureScheduleSpeaker(rawSpeaker);
            if (speaker && !group.speakerSlugs.includes(speaker.slug)) {
              group.speakerSlugs.push(speaker.slug);
            }
          });
        });
      });
    });

    crossLinkProgram({
      source: 'conference',
      year,
      categories,
      speakers: speakersWithSlugs.sort(compareSpeakers),
      presentations: presentationsWithSlugs,
    });

    return createProgramIndexes({
      source: 'conference',
      year,
      categories,
      speakers: speakersWithSlugs.sort(compareSpeakers),
      presentations: presentationsWithSlugs.sort(comparePresentations),
    });
  }

  function normalizeArchiveSpeaker(speaker, index, options = {}) {
    const fallbackAvatar = getProgramFallbackAvatar({
      year: options.year,
      fallbackAvatar: options.fallbackAvatar,
    });
    const slug = normalizeSpace(speaker?.slug || speaker?.id || '') || `speaker-${index + 1}`;
    const bio = speaker?.bio || '';
    return {
      id: normalizeSpace(String(speaker?.id ?? slug)),
      slug,
      name: normalizeSpace(speaker?.name || '') || 'Presenter',
      profession: normalizeSpace(speaker?.profession || ''),
      organization: normalizeSpace(speaker?.organization || ''),
      avatar: normalizeSpace(speaker?.avatar || '') || fallbackAvatar,
      linkedin: normalizeSpace(speaker?.linkedin || ''),
      homepage: normalizeSpace(speaker?.homepage || ''),
      email: normalizeSpace(speaker?.email || ''),
      bio: normalizeSpace(bio),
      bioHtml: speaker?.bioHtml || textToHtml(bio),
      categoryId: toNullableNumber(speaker?.categoryId),
      categorySlug: normalizeSpace(speaker?.categorySlug || ''),
      sortOrder: toNullableNumber(speaker?.sortOrder),
      presentationRefs: asArray(speaker?.presentationRefs).map((ref) => ({
        slug: normalizeSpace(ref?.slug || ref?.id || ''),
        year: normalizeSpace(String(ref?.year ?? options.year ?? '')),
      })),
      presentations: [],
      source: speaker?.source && typeof speaker.source === 'object' ? speaker.source : {},
    };
  }

  function normalizeArchivePresentation(presentation, index, options = {}) {
    const slug =
      normalizeSpace(presentation?.slug || presentation?.id || '') || `presentation-${index + 1}`;
    const abstract = presentation?.abstract || '';
    const categorySlug = normalizeSpace(presentation?.categorySlug || '') || 'paper-presenters';
    return {
      id: normalizeSpace(String(presentation?.id ?? slug)),
      slug,
      title: normalizeSpace(presentation?.title || '') || 'Presentation TBA',
      abstract: normalizeSpace(abstract),
      abstractHtml:
        presentation?.abstractHtml || presentation?.descriptionHtml || textToHtml(abstract),
      descriptionHtml:
        presentation?.descriptionHtml || presentation?.abstractHtml || textToHtml(abstract),
      presentationType: normalizeSpace(presentation?.presentationType || '') || 'paper',
      categoryId: toNullableNumber(presentation?.categoryId),
      categorySlug,
      submissionId: normalizeSpace(
        presentation?.submissionId ||
          presentation?.participantSubmissionId ||
          presentation?.source?.submissionId ||
          '',
      ),
      date: extractDateKey(presentation?.date || ''),
      start: normalizeSpace(presentation?.start || ''),
      end: normalizeSpace(presentation?.end || ''),
      location: normalizeSpace(presentation?.location || ''),
      order: Number(presentation?.order ?? Number.MAX_SAFE_INTEGER),
      sortOrder: Number(presentation?.sortOrder ?? Number.MAX_SAFE_INTEGER),
      speakerSlugs: asArray(presentation?.speakerSlugs).map((speaker) =>
        normalizeSpace(typeof speaker === 'string' ? speaker : speaker?.slug || speaker?.id || ''),
      ),
      speakers: [],
      source:
        presentation?.source && typeof presentation.source === 'object' ? presentation.source : {},
      year: normalizeSpace(String(presentation?.year ?? options.year ?? '')),
    };
  }

  function normalizeArchiveProgram(payload, options = {}) {
    const year = String(payload?.year ?? options.year ?? '');
    const categories = asArray(payload?.categories).map(normalizeCategory).filter(Boolean);
    if (!categories.length) {
      categories.push({
        id: null,
        slug: 'paper-presenters',
        name: 'Paper Presenters',
        order: 0,
      });
    }

    const speakers = asArray(payload?.speakers).map((speaker, index) =>
      normalizeArchiveSpeaker(speaker, index, { ...options, year }),
    );
    const presentations = asArray(payload?.presentations).map((presentation, index) =>
      normalizeArchivePresentation(presentation, index, { ...options, year }),
    );

    const program = {
      source: 'archive',
      year,
      categories,
      speakers: speakers.sort(compareSpeakers),
      presentations: presentations.sort(comparePresentations),
    };
    crossLinkProgram(program);
    return createProgramIndexes(program);
  }

  function toSpeakerSummary(speaker) {
    return {
      id: speaker.id,
      slug: speaker.slug,
      name: speaker.name,
      profession: speaker.profession,
      organization: speaker.organization,
      avatar: speaker.avatar,
      linkedin: speaker.linkedin,
      homepage: speaker.homepage,
      bio: speaker.bio,
      bioHtml: speaker.bioHtml,
      categoryId: speaker.categoryId,
      categorySlug: speaker.categorySlug,
      sortOrder: speaker.sortOrder,
    };
  }

  function toPresentationSummary(presentation) {
    return compactRecord({
      id: presentation.id,
      slug: presentation.slug,
      title: presentation.title,
      abstract: presentation.abstract,
      abstractHtml: presentation.abstractHtml,
      descriptionHtml: presentation.descriptionHtml,
      presentationType: presentation.presentationType,
      categoryId: presentation.categoryId,
      categorySlug: presentation.categorySlug,
      label: presentation.label,
      submissionId: presentation.submissionId,
      date: presentation.date,
      start: presentation.start,
      end: presentation.end,
      location: presentation.location,
      order: presentation.order,
      sortOrder: presentation.sortOrder,
      source: presentation.source,
    });
  }

  function crossLinkProgram(program) {
    const speakerBySlug = new Map(program.speakers.map((speaker) => [speaker.slug, speaker]));
    const presentationBySlug = new Map(
      program.presentations.map((presentation) => [presentation.slug, presentation]),
    );

    program.presentations.forEach((presentation) => {
      presentation.speakerSlugs = asArray(presentation.speakerSlugs).filter(Boolean);
      presentation.speakers = presentation.speakerSlugs
        .map((slug) => speakerBySlug.get(slug))
        .filter(Boolean)
        .map(toSpeakerSummary)
        .sort(comparePeopleByLastName);
    });

    program.speakers.forEach((speaker) => {
      const refs = asArray(speaker.presentationRefs).filter((ref) => ref?.slug);
      const fromRefs = refs.map((ref) => presentationBySlug.get(ref.slug)).filter(Boolean);
      const fromPresentations = program.presentations.filter((presentation) =>
        asArray(presentation.speakerSlugs).includes(speaker.slug),
      );
      const unique = new Map();
      [...fromRefs, ...fromPresentations].forEach((presentation) => {
        unique.set(presentation.slug, toPresentationSummary(presentation));
      });
      speaker.presentations = Array.from(unique.values()).sort(comparePresentations);
    });
  }

  function createProgramIndexes(program) {
    const speakerBySlug = new Map(program.speakers.map((speaker) => [speaker.slug, speaker]));
    const presentationBySlug = new Map(
      program.presentations.map((presentation) => [presentation.slug, presentation]),
    );
    return {
      ...program,
      speakerBySlug,
      presenterBySlug: speakerBySlug,
      presentationBySlug,
    };
  }

  function hasMeaningfulNumber(value) {
    return Number.isFinite(value) && value !== Number.MAX_SAFE_INTEGER;
  }

  function serializeCategory(category) {
    const serialized = {
      id: category?.id ?? null,
      slug: normalizeSpace(category?.slug || ''),
      name: normalizeSpace(category?.name || ''),
    };
    if (hasMeaningfulNumber(category?.order)) serialized.order = category.order;
    return serialized;
  }

  function serializeSpeakerSummary(speaker) {
    return {
      id: speaker?.id,
      slug: speaker?.slug,
      name: speaker?.name || '',
      profession: speaker?.profession || '',
      organization: speaker?.organization || '',
      avatar: speaker?.avatar || '',
      linkedin: speaker?.linkedin || '',
      homepage: speaker?.homepage || '',
      bio: speaker?.bio || '',
      bioHtml: speaker?.bioHtml || '',
    };
  }

  function serializePresentationSummary(presentation) {
    const serialized = compactRecord({
      id: presentation?.id,
      slug: presentation?.slug,
      title: presentation?.title,
      abstract: presentation?.abstract,
      abstractHtml: presentation?.abstractHtml,
      descriptionHtml: presentation?.descriptionHtml,
      presentationType: presentation?.presentationType,
      categoryId: presentation?.categoryId,
      categorySlug: presentation?.categorySlug,
      label: presentation?.label,
      submissionId: presentation?.submissionId,
      date: presentation?.date,
      start: presentation?.start,
      end: presentation?.end,
      location: presentation?.location,
      source: presentation?.source,
    });
    if (hasMeaningfulNumber(presentation?.order)) serialized.order = presentation.order;
    if (hasMeaningfulNumber(presentation?.sortOrder)) serialized.sortOrder = presentation.sortOrder;
    return serialized;
  }

  function serializeSpeaker(speaker) {
    const serialized = serializeSpeakerSummary(speaker);
    serialized.presentationRefs = asArray(speaker?.presentationRefs)
      .map((ref) =>
        compactRecord({
          slug: normalizeSpace(ref?.slug || ref?.id || ''),
          year: normalizeSpace(String(ref?.year ?? '')),
        }),
      )
      .filter((ref) => ref.slug);
    serialized.presentations = asArray(speaker?.presentations).map(serializePresentationSummary);
    return serialized;
  }

  function serializePresentation(presentation) {
    const serialized = serializePresentationSummary(presentation);
    serialized.speakerSlugs = asArray(presentation?.speakerSlugs)
      .map((slug) => normalizeSpace(typeof slug === 'string' ? slug : slug?.slug || slug?.id || ''))
      .filter(Boolean);
    serialized.speakers = sortPeopleByLastName(
      asArray(presentation?.speakers).map(serializeSpeakerSummary),
    );
    return compactRecord(serialized);
  }

  function serializeProgram(program) {
    return {
      year: normalizeSpace(String(program?.year ?? '')),
      source: normalizeSpace(program?.source || ''),
      categories: asArray(program?.categories).map(serializeCategory),
      speakers: asArray(program?.speakers).map(serializeSpeaker),
      presentations: asArray(program?.presentations).map(serializePresentation),
    };
  }

  function normalizeProgramPayload(payload, options = {}) {
    if (Array.isArray(payload?.speakers) || Array.isArray(payload?.presentations)) {
      const hasMeetingHandShape = asArray(payload?.speakers).some(
        (speaker) => speaker && ('firstname' in speaker || 'event_speaker_category_id' in speaker),
      );
      if (!hasMeetingHandShape) return normalizeArchiveProgram(payload, options);
    }
    return normalizeMeetingHandProgram(payload, options);
  }

  function idsMatch(value, ids) {
    if (!ids || !ids.length) return true;
    return ids.includes(toNullableNumber(value));
  }

  function idsExcluded(value, ids) {
    if (!ids || !ids.length) return false;
    return ids.includes(toNullableNumber(value));
  }

  function slugsMatch(value, slugsToMatch) {
    if (!slugsToMatch || !slugsToMatch.length) return true;
    return slugsToMatch.includes(normalizeSpace(value));
  }

  function slugsExcluded(value, slugsToExclude) {
    if (!slugsToExclude || !slugsToExclude.length) return false;
    return slugsToExclude.includes(normalizeSpace(value));
  }

  function resolveDateFilters(filters, year) {
    const workshopDate = getWorkshopDate(year);
    const includeDates = asArray(filters.includeDates).map(extractDateKey).filter(Boolean);
    const excludeDates = asArray(filters.excludeDates).map(extractDateKey).filter(Boolean);
    if (filters.includeWorkshopDate && workshopDate) includeDates.push(workshopDate);
    if (filters.excludeWorkshopDate && workshopDate) excludeDates.push(workshopDate);
    return { includeDates, excludeDates };
  }

  function presentationMatchesFilters(presentation, filters = {}, year = '') {
    const { includeDates, excludeDates } = resolveDateFilters(filters, year);
    const date = extractDateKey(presentation.date || '');

    if (!idsMatch(presentation.categoryId, filters.includeCategoryIds)) return false;
    if (idsExcluded(presentation.categoryId, filters.excludeCategoryIds)) return false;
    if (!slugsMatch(presentation.categorySlug, filters.includeCategorySlugs)) return false;
    if (slugsExcluded(presentation.categorySlug, filters.excludeCategorySlugs)) return false;
    if (
      filters.includePresentationTypes?.length &&
      !filters.includePresentationTypes.includes(presentation.presentationType)
    ) {
      return false;
    }
    if (
      filters.excludePresentationTypes?.length &&
      filters.excludePresentationTypes.includes(presentation.presentationType)
    ) {
      return false;
    }
    if (includeDates.length && !includeDates.includes(date)) return false;
    if (excludeDates.length && excludeDates.includes(date)) return false;
    return true;
  }

  function selectPresentations(program, config) {
    return asArray(program.presentations)
      .filter((presentation) =>
        presentationMatchesFilters(presentation, config.filters, program.year),
      )
      .sort(comparePresentations);
  }

  function selectSpeakers(program, config) {
    return asArray(program.speakers)
      .map((speaker) => {
        const presentations = asArray(speaker.presentations).filter((presentation) =>
          presentationMatchesFilters(presentation, config.filters, program.year),
        );
        return { ...speaker, presentations };
      })
      .filter((speaker) => speaker.presentations.length > 0)
      .sort(compareSpeakers);
  }

  function selectProgramItems(program, config) {
    return config.cardType === 'speaker'
      ? selectSpeakers(program, config)
      : selectPresentations(program, config);
  }

  function sectionMatchesPresentation(section, presentation) {
    if (
      section.categoryIds?.length &&
      !section.categoryIds.includes(toNullableNumber(presentation.categoryId))
    ) {
      return false;
    }
    if (
      section.categorySlugs?.length &&
      !section.categorySlugs.includes(presentation.categorySlug)
    ) {
      return false;
    }
    return true;
  }

  function getSectionForItem(item, config) {
    const sections = asArray(config.sections);
    if (!sections.length) return null;
    if (config.cardType === 'presentation') {
      return sections.find((section) => sectionMatchesPresentation(section, item)) || sections[0];
    }
    return (
      sections.find((section) =>
        asArray(item.presentations).some((presentation) =>
          sectionMatchesPresentation(section, presentation),
        ),
      ) || sections[0]
    );
  }

  async function loadProgramPayload({ source, year, fetchImpl } = {}) {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) throw new Error('No fetch implementation is available.');
    const cacheKey = `program:${source}:${year}`;
    if (!requestCache.has(cacheKey)) {
      requestCache.set(
        cacheKey,
        fetcher(getProgramEndpoint({ source, year })).then((response) => {
          if (!response.ok) throw new Error(`Program data request failed: ${response.status}`);
          return response.json();
        }),
      );
    }
    return requestCache.get(cacheKey);
  }

  function normalizeSubmissionValue(value) {
    return String(value || '')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .trim();
  }

  function submissionValueToHtml(value) {
    const normalized = normalizeSubmissionValue(value);
    if (!normalized) return '';
    if (/<\/?[a-z][\s\S]*>/i.test(normalized)) return normalized;
    return textToHtml(normalized);
  }

  function normalizeMeetingHandSubmission(payload) {
    const fields = Array.isArray(payload?.data?.fields)
      ? payload.data.fields
      : Array.isArray(payload?.fields)
        ? payload.fields
        : [];
    const result = {};

    fields.forEach((field) => {
      const fieldId = String(field?.event_submission_field_id || field?.id || '');
      if (!fieldId) return;
      const html = submissionValueToHtml(field?.value);
      if (!html) return;
      const text = stripHtml(html);

      if (fieldId === '1469') {
        result.abstract = text;
        result.abstractHtml = html;
      } else if (fieldId === '1470') {
        result.objectives = text;
        result.objectivesHtml = html;
      } else if (fieldId === '1471') {
        result.bio = text;
        result.bioHtml = html;
      }
    });

    return Object.keys(result).length ? result : null;
  }

  async function loadMeetingHandSubmission({ year, id, fetchImpl } = {}) {
    const submissionId = normalizeSpace(id);
    if (!submissionId) return null;
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) throw new Error('No fetch implementation is available.');

    const cacheKey = `submission:conference:${year}:${submissionId}`;
    if (!requestCache.has(cacheKey)) {
      requestCache.set(
        cacheKey,
        fetcher(getMeetingHandSubmissionEndpoint({ year, id: submissionId })).then((response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error(`Submission data request failed: ${response.status}`);
          return response.json().then(normalizeMeetingHandSubmission);
        }),
      );
    }
    return requestCache.get(cacheKey);
  }

  async function loadProgram({ source, year, fetchImpl, fallbackAvatar } = {}) {
    const payload = await loadProgramPayload({ source, year, fetchImpl });
    return normalizeProgramPayload(payload, { source, year, fallbackAvatar });
  }

  function clearProgramCache() {
    requestCache.clear();
  }

  function mergeMeetingHandSubmissionDetail(presentation, detail) {
    if (!detail) return presentation;
    const merged = { ...(presentation || {}) };

    if (detail.abstractHtml) {
      merged.abstract = detail.abstract || merged.abstract || '';
      merged.abstractHtml = detail.abstractHtml;
      merged.descriptionHtml = detail.abstractHtml;
    }

    if (detail.objectivesHtml) {
      merged.objectives = detail.objectives || '';
      merged.objectivesHtml = detail.objectivesHtml;
    }

    if (detail.bioHtml) {
      merged.speakers = asArray(merged.speakers).map((speaker) => {
        if (normalizeSpace(speaker?.bio) || normalizeSpace(speaker?.bioHtml)) return speaker;
        return {
          ...speaker,
          bio: detail.bio || '',
          bioHtml: detail.bioHtml,
        };
      });
    }

    return merged;
  }

  function mergeMeetingHandSubmissionDetailIntoSpeaker(speaker, presentation, detail) {
    if (!detail) return speaker;
    const presentationKey = normalizeSpace(presentation?.slug || presentation?.id || '');
    const mergedPresentation = mergeMeetingHandSubmissionDetail(presentation, detail);
    const mergedSpeaker = {
      ...(speaker || {}),
      presentations: asArray(speaker?.presentations).map((candidate) => {
        const candidateKey = normalizeSpace(candidate?.slug || candidate?.id || '');
        return candidateKey && candidateKey === presentationKey ? mergedPresentation : candidate;
      }),
    };

    if (
      detail.bioHtml &&
      !normalizeSpace(mergedSpeaker.bio) &&
      !normalizeSpace(mergedSpeaker.bioHtml)
    ) {
      mergedSpeaker.bio = detail.bio || '';
      mergedSpeaker.bioHtml = detail.bioHtml;
    }

    return mergedSpeaker;
  }

  return {
    CATEGORY_CONFIGS,
    asArray,
    clearProgramCache,
    comparePresentations,
    compareSpeakers,
    comparePeopleByLastName,
    createProgramIndexes,
    extractAbstractMap,
    extractDateKey,
    getMeetingHandPersonName,
    getMeetingHandSpeakerName,
    getPersonName: getMeetingHandPersonName,
    getPresentationSubmissionId,
    getProgramFallbackAvatar,
    getPresenterDetails,
    getProgramCategoryConfig,
    getProgramEndpoint,
    getMeetingHandSubmissionEndpoint,
    getSectionForItem,
    getLastNameKey,
    getScheduleItemSubmissionId,
    getSchedulePresentationSpeakerCandidates,
    getWorkshopDate,
    loadMeetingHandSubmission,
    loadProgram,
    loadProgramPayload,
    mergeMeetingHandSubmissionDetail,
    mergeMeetingHandSubmissionDetailIntoSpeaker,
    normalizeArchiveProgram,
    normalizeCompareText,
    normalizeMeetingHandProgram,
    normalizeMeetingHandSubmission,
    normalizePresentationType,
    normalizeProgramPayload,
    normalizeSpace,
    parseProgramDetailRoute,
    parseProgramListRoute,
    presentationMatchesFilters,
    serializeProgram,
    selectProgramItems,
    selectPresentations,
    selectSpeakers,
    sortPeopleByLastName,
    stripHtml,
    textToHtml,
  };
});
