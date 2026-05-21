/* global module */

(function (root, factory) {
  const api = factory(
    root.PNSQCProgramData || {},
    root.PNSQCProgramRenderer || {},
    root.PNSQCSlugs || {},
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PNSQCProgramSchedule = api;
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function (programData, rendererModule, slugs) {
    const asArray = programData.asArray || ((value) => (Array.isArray(value) ? value : []));
    const normalizeSpace =
      programData.normalizeSpace ||
      ((value) =>
        value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim());
    const extractDateKey =
      programData.extractDateKey || ((value) => String(value || '').slice(0, 10));
    const slugify =
      slugs.slugify ||
      ((value, fallback = 'item') =>
        normalizeSpace(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || fallback);
    const normalizeCompareText =
      programData.normalizeCompareText ||
      ((value) =>
        normalizeSpace(String(value || '').replace(/<[^>]*>/g, ' '))
          .replace(/:\s*$/, '')
          .toLowerCase());
    const extractAbstractMap =
      programData.extractAbstractMap ||
      ((html) => {
        const map = new Map();
        const pattern = /<p[^>]*>([\s\S]*?)<\/p>\s*<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
        let match = pattern.exec(String(html || ''));
        while (match) {
          const titleText = normalizeCompareText(match[1]);
          if (titleText && match[2]) map.set(titleText, match[2].trim());
          match = pattern.exec(String(html || ''));
        }
        return map;
      });
    const formatPersonName =
      programData.getMeetingHandPersonName ||
      ((person) =>
        normalizeSpace(person?.name) ||
        normalizeSpace(`${person?.firstname || ''} ${person?.lastname || ''}`) ||
        normalizeSpace(person?.full_name));
    const getPresenterDetails =
      programData.getPresenterDetails ||
      ((person) => {
        if (!person || typeof person !== 'object') return {};
        const numericKey = Object.keys(person).find((key) => /^\d+$/.test(key));
        if (numericKey && person[numericKey] && typeof person[numericKey] === 'object') {
          return person[numericKey];
        }
        if (person.details && typeof person.details === 'object') return person.details;
        return {};
      });
    const getSchedulePresentationSpeakerCandidates =
      programData.getSchedulePresentationSpeakerCandidates ||
      ((presentation) => {
        const candidates = []
          .concat(asArray(presentation?.speakers))
          .concat(presentation?.speaker ? [presentation.speaker] : [])
          .concat(asArray(presentation?.authors))
          .concat(presentation?.presenterAuthor ? [presentation.presenterAuthor] : [])
          .concat(presentation?.presenter_author ? [presentation.presenter_author] : [])
          .concat(presentation?.participant ? [presentation.participant] : []);
        const seen = new Set();
        return candidates.filter((candidate) => {
          const key = normalizeCompareText(formatPersonName(candidate));
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
    const getScheduleItemSubmissionId =
      programData.getScheduleItemSubmissionId ||
      ((item) => {
        if (Array.isArray(item?._scheduleItems)) {
          const found = item._scheduleItems.map(getScheduleItemSubmissionId).find(Boolean);
          return found || '';
        }
        if (item?.participant_submission_id) return String(item.participant_submission_id);
        if (item?.presentation?.presentation_type && item?.presentation?.id) {
          return String(item.presentation.id);
        }
        return '';
      });
    const mergeMeetingHandSubmissionDetail =
      programData.mergeMeetingHandSubmissionDetail ||
      ((presentation, detail) => {
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
            return { ...speaker, bio: detail.bio || '', bioHtml: detail.bioHtml };
          });
        }
        return merged;
      });
    const sortPeopleByLastName =
      programData.sortPeopleByLastName ||
      ((people) =>
        asArray(people)
          .slice()
          .sort((left, right) =>
            normalizeSpace(left?.name).localeCompare(normalizeSpace(right?.name)),
          ));

    const PLACEHOLDER_TITLE = 'Unassigned Meeting';
    const FALLBACK_AVATAR = '/images/brand/pnsqc-logo.jpg';

    class Dom {
      static el(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (typeof text === 'string') node.textContent = text;
        return node;
      }

      static icon(pathData, className = 'h-4 w-4') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', className);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = pathData;
        return svg;
      }
    }

    class TextUtils {
      static normalizeCompareText(value) {
        return normalizeCompareText(value);
      }
    }

    class TimeUtils {
      static parseTimeToMinutes(rawTime) {
        if (typeof rawTime !== 'string' || !rawTime.includes(':')) return null;
        const [hourText, minuteText] = rawTime.split(':');
        const hour = Number(hourText);
        const minute = Number(minuteText);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
        return hour * 60 + minute;
      }

      static parseDateOnly(dateIso) {
        if (typeof dateIso !== 'string') return null;
        const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
          const parsed = new Date(dateIso);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      }

      static getTimeZoneOffset(date, timeZone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        const values = {};
        formatter.formatToParts(date).forEach((part) => {
          if (part.type !== 'literal') values[part.type] = part.value;
        });
        const asUtc = Date.UTC(
          Number(values.year),
          Number(values.month) - 1,
          Number(values.day),
          Number(values.hour),
          Number(values.minute),
          Number(values.second),
        );
        return (asUtc - date.getTime()) / 60000;
      }

      static getUtcMillisForEventTime(dayIso, minutesFromMidnight, eventTimeZone) {
        if (minutesFromMidnight === null || minutesFromMidnight === undefined) return null;
        const dateOnly = TimeUtils.parseDateOnly(dayIso);
        if (!dateOnly) return null;
        const hour = Math.floor(minutesFromMidnight / 60);
        const minute = minutesFromMidnight % 60;
        const utcCandidate = new Date(
          Date.UTC(
            dateOnly.getUTCFullYear(),
            dateOnly.getUTCMonth(),
            dateOnly.getUTCDate(),
            hour,
            minute,
            0,
          ),
        );
        const offsetMinutes = TimeUtils.getTimeZoneOffset(utcCandidate, eventTimeZone);
        return utcCandidate.getTime() - offsetMinutes * 60000;
      }

      static formatMinutesForDisplay(
        dayIso,
        minutesFromMidnight,
        timeFormat,
        displayTimeZone,
        eventTimeZone,
      ) {
        const utcMillis = TimeUtils.getUtcMillisForEventTime(
          dayIso,
          minutesFromMidnight,
          eventTimeZone,
        );
        if (utcMillis === null) return '';
        return new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: timeFormat !== 'h24',
          timeZone: displayTimeZone === 'event' ? eventTimeZone : undefined,
        })
          .format(new Date(utcMillis))
          .toLowerCase();
      }

      static formatSessionTimeRange(session, dayIso, timeFormat, displayTimeZone, eventTimeZone) {
        const startMinutes = TimeUtils.parseTimeToMinutes(session?.start);
        const endMinutes = TimeUtils.parseTimeToMinutes(session?.end);
        const startText =
          startMinutes !== null
            ? TimeUtils.formatMinutesForDisplay(
                dayIso,
                startMinutes,
                timeFormat,
                displayTimeZone,
                eventTimeZone,
              )
            : '';
        const endText =
          endMinutes !== null
            ? TimeUtils.formatMinutesForDisplay(
                dayIso,
                endMinutes,
                timeFormat,
                displayTimeZone,
                eventTimeZone,
              )
            : '';
        if (startText && endText) return `${startText} - ${endText}`;
        return startText || endText || 'Time TBA';
      }

      static formatEventDateRange(startDateIso, endDateIso) {
        if (!startDateIso || !endDateIso) return '';
        const startDate = TimeUtils.parseDateOnly(startDateIso);
        const endDate = TimeUtils.parseDateOnly(endDateIso);
        if (!startDate || !endDate) return '';
        const formatter = new Intl.DateTimeFormat('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        });
        return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
      }

      static formatDayHeading(dateIso) {
        const dateOnly = TimeUtils.parseDateOnly(dateIso);
        if (!dateOnly) return 'Date TBA';
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(dateOnly);
      }

      static formatDayNavLabel(dateIso, index) {
        const dateOnly = TimeUtils.parseDateOnly(dateIso);
        if (!dateOnly) return `Day ${index + 1}`;
        const shortWeekday = new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(dateOnly);
        return `${shortWeekday} - Day ${index + 1}`;
      }
    }

    class SubmissionFormatter {
      static sanitizeHtmlFragment(value) {
        if (typeof DOMParser === 'undefined') return String(value || '');
        const renderer = rendererModule.createRenderer?.();
        if (renderer?.sanitizeHtmlFragment) return renderer.sanitizeHtmlFragment(value);
        return String(value || '');
      }

      static extractAbstractMap(session) {
        const html = session?.description;
        const map = new Map();
        if (!html || typeof html !== 'string') return map;

        extractAbstractMap(html).forEach((value, key) => {
          map.set(key, SubmissionFormatter.sanitizeHtmlFragment(value));
        });

        return map;
      }
    }

    function getRawSpeakerCandidates(item) {
      if (Array.isArray(item?._scheduleItems)) {
        const seen = new Set();
        return item._scheduleItems.flatMap(getRawSpeakerCandidates).filter((candidate) => {
          const key = TextUtils.normalizeCompareText(formatPersonName(candidate));
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      return getSchedulePresentationSpeakerCandidates(item?.presentation || {});
    }

    function groupSessionsByTime(sessions) {
      const grouped = [];
      const groupMap = new Map();
      asArray(sessions).forEach((session) => {
        const key = `${session?.start || ''}|${session?.end || ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
          grouped.push(groupMap.get(key));
        }
        groupMap.get(key).push(session);
      });
      return grouped;
    }

    function groupScheduleItems(items) {
      const grouped = [];
      const groupMap = new Map();
      asArray(items)
        .filter(Boolean)
        .slice()
        .sort((left, right) => (Number(left?.order) || 9999) - (Number(right?.order) || 9999))
        .forEach((item) => {
          const titleKey = TextUtils.normalizeCompareText(item?.presentation?.title);
          const key = titleKey || `item-${item?.id || grouped.length}`;
          if (!groupMap.has(key)) {
            const clone = {
              ...item,
              _scheduleItems: [item],
            };
            groupMap.set(key, clone);
            grouped.push(clone);
            return;
          }
          groupMap.get(key)._scheduleItems.push(item);
        });
      return grouped;
    }

    function hasPresentationDetail(presentation) {
      return !!(
        normalizeSpace(presentation?.abstract) ||
        normalizeSpace(presentation?.abstractHtml) ||
        normalizeSpace(presentation?.descriptionHtml) ||
        normalizeSpace(presentation?.objectives) ||
        normalizeSpace(presentation?.objectivesHtml)
      );
    }

    class ScheduleRenderer {
      constructor({
        root,
        dayNav,
        timezoneToggle,
        timezoneLabel,
        eventMeta,
        eventIntro,
        templateRoot,
        year,
        fallbackAvatar,
      }) {
        this.root = root;
        this.dayNav = dayNav;
        this.timezoneToggle = timezoneToggle;
        this.timezoneLabel = timezoneLabel;
        this.eventMeta = eventMeta;
        this.eventIntro = eventIntro;
        this.templateRoot = templateRoot || document.body;
        this.year = String(year || '');
        this.fallbackAvatar = fallbackAvatar || FALLBACK_AVATAR;
        this.detailRenderer = rendererModule.createRenderer?.({
          fallbackAvatar: this.fallbackAvatar,
        });
        this.displayTimeZone = 'local';
        this.scheduleCache = null;
        this.program = null;
        this.speakerByName = new Map();
        this.submissionDetails = new Map();
        this.templateCounter = 0;
      }

      setProgram(program) {
        this.program = program || null;
        this.speakerByName = new Map();
        asArray(program?.speakers).forEach((speaker) => {
          const key = TextUtils.normalizeCompareText(speaker?.name);
          if (key) this.speakerByName.set(key, speaker);
        });
      }

      setDisplayTimeZone(mode) {
        this.displayTimeZone = mode;
        if (this.scheduleCache) this.render(this.scheduleCache);
      }

      nextTemplateId(prefix) {
        this.templateCounter += 1;
        return `${prefix}-${this.templateCounter}`;
      }

      resetTemplates() {
        this.templateCounter = 0;
        if (this.templateRoot) this.templateRoot.innerHTML = '';
      }

      registerTemplate(modalConfig) {
        if (!modalConfig?.template) return '';
        this.templateRoot.appendChild(modalConfig.template);
        return modalConfig.templateId;
      }

      isKeynoteSession(session) {
        return !!(session?.title && /keynote/i.test(session.title));
      }

      isInvitedSpeakersSession(session) {
        return !!(session?.title && /invited\s+speakers?/i.test(session.title));
      }

      isWorkshopDay(dateIso) {
        return extractDateKey(dateIso) === programData.getWorkshopDate?.(this.year);
      }

      formatDayBadgeLabel(index, dateIso) {
        return `Day ${index + 1} | ${this.isWorkshopDay(dateIso) ? 'Workshops' : 'Program'}`;
      }

      findProgramPresentation(item, dayIso, session) {
        const titleKey = TextUtils.normalizeCompareText(item?.presentation?.title);
        if (!titleKey) return null;
        const candidates = asArray(this.program?.presentations).filter(
          (presentation) => TextUtils.normalizeCompareText(presentation?.title) === titleKey,
        );
        if (!candidates.length) return null;
        const dateKey = extractDateKey(dayIso);
        const start = normalizeSpace(session?.start || '');
        return (
          candidates.find(
            (presentation) =>
              extractDateKey(presentation.date || '') === dateKey &&
              normalizeSpace(presentation.start || '') === start,
          ) ||
          candidates.find((presentation) => extractDateKey(presentation.date || '') === dateKey) ||
          candidates[0]
        );
      }

      normalizeRawSpeaker(rawSpeaker, presentation) {
        const details = getPresenterDetails(rawSpeaker);
        const name = formatPersonName(rawSpeaker) || 'Presenter';
        return {
          id: normalizeSpace(rawSpeaker?.id || slugify(name, 'speaker')),
          slug: slugify(name, 'speaker'),
          name,
          avatar: normalizeSpace(rawSpeaker?.avatar || details.avatar || '') || this.fallbackAvatar,
          profession: normalizeSpace(
            rawSpeaker?.profession || rawSpeaker?.title || details.profession || '',
          ),
          organization: normalizeSpace(rawSpeaker?.organization || details.organization || ''),
          linkedin: normalizeSpace(rawSpeaker?.linkedin || details.linkedin || ''),
          homepage: normalizeSpace(rawSpeaker?.homepage || details.homepage || ''),
          bio: normalizeSpace(rawSpeaker?.bio || rawSpeaker?.short_bio || details.short_bio || ''),
          bioHtml: rawSpeaker?.bioHtml || details.bioHtml || '',
          presentations: presentation ? [presentation] : [],
        };
      }

      resolveSpeakers(item, presentation) {
        const rawCandidates = getRawSpeakerCandidates(item);
        const speakersByName = new Map();
        asArray(presentation?.speakers).forEach((speaker) => {
          const key = TextUtils.normalizeCompareText(speaker?.name);
          if (key) speakersByName.set(key, speaker);
        });

        rawCandidates.forEach((candidate) => {
          const name = formatPersonName(candidate);
          const normalized = this.speakerByName.get(TextUtils.normalizeCompareText(name));
          const speaker = normalized || this.normalizeRawSpeaker(candidate, presentation);
          const key = TextUtils.normalizeCompareText(speaker?.name);
          if (key) speakersByName.set(key, speaker);
        });
        return sortPeopleByLastName(Array.from(speakersByName.values()));
      }

      buildPresentationDetail({ item, session, dayIso, abstractMap }) {
        const rawPresentation = item?.presentation || {};
        const normalized = this.findProgramPresentation(item, dayIso, session);
        const title = normalizeSpace(
          rawPresentation.title || normalized?.title || PLACEHOLDER_TITLE,
        );
        const submissionId = getScheduleItemSubmissionId(item);
        const submissionDetail = submissionId ? this.submissionDetails.get(submissionId) : null;
        const fallbackAbstractHtml = abstractMap.get(TextUtils.normalizeCompareText(title)) || '';
        let presentation = {
          ...(normalized || {}),
          id: normalizeSpace(normalized?.id || rawPresentation.id || title),
          slug: normalizeSpace(normalized?.slug || slugify(title, 'presentation')),
          submissionId: normalizeSpace(normalized?.submissionId || submissionId),
          title,
          date: normalizeSpace(normalized?.date || dayIso || ''),
          start: normalizeSpace(normalized?.start || session?.start || ''),
          end: normalizeSpace(normalized?.end || session?.end || ''),
          location: normalizeSpace(normalized?.location || session?.location || ''),
          label: normalizeSpace(normalized?.label || session?.title || ''),
          presentationType:
            normalized?.presentationType || (this.isWorkshopDay(dayIso) ? 'workshop' : 'paper'),
        };

        if (!presentation.abstractHtml && !presentation.descriptionHtml && fallbackAbstractHtml) {
          presentation.abstractHtml = fallbackAbstractHtml;
          presentation.descriptionHtml = fallbackAbstractHtml;
        }

        if (submissionDetail) {
          presentation = mergeMeetingHandSubmissionDetail(presentation, submissionDetail);
        }

        presentation.speakers = sortPeopleByLastName(this.resolveSpeakers(item, presentation));
        if (submissionDetail) {
          presentation = mergeMeetingHandSubmissionDetail(presentation, submissionDetail);
          presentation.speakers = sortPeopleByLastName(presentation.speakers);
        }
        return presentation;
      }

      renderTimezoneToggle() {
        if (!this.timezoneToggle) return;
        this.timezoneToggle.querySelectorAll('[data-timezone-option]').forEach((option) => {
          const mode = option.getAttribute('data-timezone-option');
          const active = mode === this.displayTimeZone;
          option.className = active
            ? 'rounded-full border border-pnsqc-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-pnsqc-gold'
            : 'rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-pnsqc-slate transition-colors hover:border-white/30 hover:text-white';
        });

        if (!this.timezoneLabel) return;
        if (this.displayTimeZone === 'event') {
          this.timezoneLabel.textContent = 'Showing times in Pacific Time.';
        } else {
          const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your timezone';
          this.timezoneLabel.textContent = `Showing times in ${browserZone}.`;
        }
      }

      renderEventHeader(data) {
        if (this.eventMeta) {
          const pieces = [];
          const dateRange = TimeUtils.formatEventDateRange(data?.start_date, data?.end_date);
          if (dateRange) pieces.push(dateRange);
          const locationParts = [];
          if (data?.event_location?.city) locationParts.push(data.event_location.city);
          if (data?.event_location?.state) locationParts.push(data.event_location.state);
          if (locationParts.length) pieces.push(locationParts.join(', '));
          if (pieces.length) this.eventMeta.textContent = pieces.join(' | ');
        }

        if (this.eventIntro && data?.long_name && !normalizeSpace(this.eventIntro.textContent)) {
          this.eventIntro.textContent = `Live schedule for ${data.long_name}.`;
        }
      }

      renderDayNavigation(days) {
        if (!this.dayNav) return;
        this.dayNav.innerHTML = '';
        if (!days.length) {
          this.dayNav.appendChild(
            Dom.el(
              'span',
              'inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-pnsqc-slate',
              'No schedule days published yet',
            ),
          );
          return;
        }

        days.forEach((day, index) => {
          const link = Dom.el(
            'a',
            'day-nav-link inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold',
            TimeUtils.formatDayNavLabel(day.date, index),
          );
          link.href = `#day-${index + 1}`;
          this.dayNav.appendChild(link);
        });
      }

      createPresentationButton({
        title,
        presentation,
        submissionId,
        shouldLazyLoad,
        buttonText,
        buttonClass,
      }) {
        const button = Dom.el(
          'button',
          buttonClass || 'text-left font-medium text-white transition-colors hover:text-pnsqc-gold',
          buttonText || title,
        );
        button.type = 'button';
        button.setAttribute('data-details-modal-title', title);
        button.setAttribute('data-details-modal-label', 'Presentation');
        if (submissionId) button.setAttribute('data-schedule-submission-id', submissionId);

        if (shouldLazyLoad) {
          button.setAttribute('data-schedule-submission-trigger', 'true');
          return button;
        }

        const templateId = this.nextTemplateId('schedule-presentation');
        this.registerTemplate(
          this.detailRenderer.buildPresentationModalTemplate({
            presentation,
            templateId,
            categoryLabel:
              presentation.presentationType === 'workshop' ? 'Workshop' : 'Presentation',
          }),
        );
        button.setAttribute('data-details-modal-open', templateId);
        return button;
      }

      createSpeakerButton({ speaker, presentation, submissionId, shouldLazyLoad }) {
        return this.createPresentationButton({
          title: presentation.title || PLACEHOLDER_TITLE,
          presentation,
          submissionId,
          shouldLazyLoad,
          buttonText: speaker.name || 'Presenter',
          buttonClass: 'text-left text-sm text-pnsqc-slate transition-colors hover:text-pnsqc-gold',
        });
      }

      buildSessionCard({ session, dayIso, timeFormat, eventTimeZone, displayTimeZone }) {
        const isBreak = !!session?.is_break;
        const isKeynote = this.isKeynoteSession(session);
        const cardClass = isBreak
          ? 'rounded-lg border border-pnsqc-cyan/20 bg-pnsqc-cyan/10 px-4 py-4'
          : isKeynote
            ? 'session-card glow-gold rounded-xl border border-pnsqc-gold/30 bg-gradient-to-br from-pnsqc-gold/10 via-pnsqc-cyan/10 to-pnsqc-blue/50 px-4 py-4'
            : 'session-card gold-readable-surface rounded-lg border border-white/10 px-4 py-4';
        const card = Dom.el('div', `${cardClass} h-full`);

        const timeWrapper = Dom.el(
          'div',
          `mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide tabular-nums ${
            isBreak ? 'text-white' : 'text-pnsqc-gold'
          }`,
        );
        timeWrapper.appendChild(
          Dom.icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
        );
        timeWrapper.appendChild(
          Dom.el(
            'span',
            '',
            TimeUtils.formatSessionTimeRange(
              session,
              dayIso,
              timeFormat,
              displayTimeZone,
              eventTimeZone,
            ),
          ),
        );
        card.appendChild(timeWrapper);

        const titleRow = Dom.el('div', 'flex items-center gap-2');
        titleRow.appendChild(
          Dom.el(
            'p',
            isKeynote
              ? 'text-lg font-bold leading-snug text-white sm:text-xl'
              : isBreak
                ? 'text-lg font-semibold text-pnsqc-cyan'
                : 'text-lg font-semibold text-white',
            normalizeSpace(session?.title) || PLACEHOLDER_TITLE,
          ),
        );
        card.appendChild(titleRow);

        if (session?.location) {
          const locationWrapper = Dom.el(
            'div',
            'mb-2 mt-1 flex items-center gap-2 text-sm text-pnsqc-slate',
          );
          locationWrapper.appendChild(
            Dom.icon(
              '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
              'h-4 w-4 shrink-0',
            ),
          );
          locationWrapper.appendChild(Dom.el('span', '', String(session.location)));
          card.appendChild(locationWrapper);
        }

        const items = asArray(session?.items).filter(Boolean);
        if (isBreak || !items.length) return card;

        const list = Dom.el('div', 'mt-3 space-y-3');
        const baseStartMinutes = TimeUtils.parseTimeToMinutes(session.start);
        let lastEndMinutes = baseStartMinutes;
        const abstractMap = SubmissionFormatter.extractAbstractMap(session);
        const showPresentationTimes = !isKeynote && !session?.is_timeless_items;

        groupScheduleItems(items).forEach((item, index) => {
          const duration = Number(item?.duration) || 0;
          const startMinutes =
            index === 0
              ? baseStartMinutes
              : typeof lastEndMinutes === 'number'
                ? lastEndMinutes + 10
                : null;
          const endMinutes = typeof startMinutes === 'number' ? startMinutes + duration - 10 : null;
          lastEndMinutes = endMinutes;

          const presentation = this.buildPresentationDetail({
            item,
            session,
            dayIso,
            abstractMap,
          });
          const submissionId = getScheduleItemSubmissionId(item);
          const submissionLoaded = submissionId && this.submissionDetails.has(submissionId);
          const shouldLazyLoad =
            !!submissionId && !submissionLoaded && !hasPresentationDetail(presentation);
          const row = showPresentationTimes
            ? Dom.el('div', 'grid gap-x-4 gap-y-1 sm:grid-cols-[140px,1fr]')
            : Dom.el('div');

          if (showPresentationTimes) {
            const timeLabel =
              typeof startMinutes === 'number' && typeof endMinutes === 'number'
                ? `${TimeUtils.formatMinutesForDisplay(dayIso, startMinutes, timeFormat, displayTimeZone, eventTimeZone)} - ${TimeUtils.formatMinutesForDisplay(dayIso, endMinutes, timeFormat, displayTimeZone, eventTimeZone)}`
                : 'Time TBA';
            row.appendChild(
              Dom.el(
                'span',
                'text-xs font-semibold uppercase leading-6 tracking-widest text-pnsqc-gold tabular-nums',
                timeLabel,
              ),
            );
          }

          const detail = Dom.el('div', 'space-y-1');
          const titleRowInner = Dom.el('div', 'flex items-start gap-2');
          const speakers = asArray(presentation.speakers);
          if (speakers[0]?.avatar) {
            const avatar = Dom.el('img', 'h-6 w-6 rounded-full object-cover ring-1 ring-white/20');
            avatar.src = speakers[0].avatar;
            avatar.alt = speakers[0].name || 'Presenter';
            avatar.loading = 'lazy';
            titleRowInner.appendChild(avatar);
          }

          const titleContent = Dom.el('div', 'flex min-w-0 flex-1 flex-col gap-1');
          titleContent.appendChild(
            this.createPresentationButton({
              title: presentation.title || PLACEHOLDER_TITLE,
              presentation,
              submissionId,
              shouldLazyLoad,
            }),
          );
          speakers.forEach((speaker) =>
            titleContent.appendChild(
              this.createSpeakerButton({
                speaker,
                presentation,
                submissionId,
                shouldLazyLoad,
              }),
            ),
          );
          titleRowInner.appendChild(titleContent);
          detail.appendChild(titleRowInner);
          row.appendChild(detail);
          list.appendChild(row);
        });

        card.appendChild(list);
        return card;
      }

      render(data) {
        if (!this.root) return;
        this.scheduleCache = data;
        const days = asArray(data?.schedule);
        const eventTimeZone = data?.timezone?.key || 'America/Los_Angeles';
        const timeFormat = data?.time_format === 'h24' ? 'h24' : 'h12';

        this.renderEventHeader(data);
        this.renderDayNavigation(days);
        this.renderTimezoneToggle();
        this.root.innerHTML = '';
        this.resetTemplates();

        if (!days.length) {
          const emptyCard = Dom.el(
            'div',
            'rounded-lg border border-pnsqc-gold/20 bg-pnsqc-blue/10 p-6',
          );
          emptyCard.appendChild(
            Dom.el('p', 'text-lg text-pnsqc-slate', 'Schedule details are coming soon.'),
          );
          this.root.appendChild(emptyCard);
          return;
        }

        days.forEach((day, dayIndex) => {
          const daySection = Dom.el('section');
          daySection.id = `day-${dayIndex + 1}`;
          const dayHeader = Dom.el('div', 'mb-6 flex items-center gap-4');
          dayHeader.appendChild(
            Dom.el(
              'h2',
              'whitespace-nowrap text-2xl font-bold text-white sm:text-3xl',
              TimeUtils.formatDayHeading(day.date),
            ),
          );
          dayHeader.appendChild(Dom.el('div', 'hr-gradient mt-1 flex-1'));
          dayHeader.appendChild(
            Dom.el(
              'span',
              'gold-readable whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-pnsqc-gold',
              this.formatDayBadgeLabel(dayIndex, day.date),
            ),
          );
          daySection.appendChild(dayHeader);

          const timeline = Dom.el('div', 'space-y-6');
          const sessions = asArray(day.sessions)
            .slice()
            .sort((left, right) =>
              String(left?.start || '99:99').localeCompare(String(right?.start || '99:99')),
            );

          if (!sessions.length) {
            timeline.appendChild(
              Dom.el(
                'div',
                'rounded-lg border border-white/10 p-4 text-pnsqc-slate',
                'Sessions for this day are still being assigned.',
              ),
            );
          }

          groupSessionsByTime(sessions).forEach((group) => {
            group.sort((left, right) => {
              const leftInvited = this.isInvitedSpeakersSession(left) ? 1 : 0;
              const rightInvited = this.isInvitedSpeakersSession(right) ? 1 : 0;
              return rightInvited - leftInvited;
            });
            const hasKeynote = group.some((session) => this.isKeynoteSession(session));
            const hasNonBreak = group.some((session) => session && !session.is_break);
            const dotClass = hasKeynote
              ? 'timeline-dot timeline-dot--keynote'
              : hasNonBreak
                ? 'timeline-dot'
                : 'timeline-dot timeline-dot--social';
            const wrapper = Dom.el('div', 'timeline-block pb-6');
            wrapper.appendChild(Dom.el('div', dotClass));

            if (group.length > 1) {
              const row = Dom.el('div', 'schedule-sessions-grid grid gap-6');
              row.style.setProperty('--grid-columns', group.length);
              group.forEach((session) => {
                row.appendChild(
                  this.buildSessionCard({
                    session,
                    dayIso: day.date,
                    timeFormat,
                    eventTimeZone,
                    displayTimeZone: this.displayTimeZone,
                  }),
                );
              });
              wrapper.appendChild(row);
            } else {
              wrapper.appendChild(
                this.buildSessionCard({
                  session: group[0],
                  dayIso: day.date,
                  timeFormat,
                  eventTimeZone,
                  displayTimeZone: this.displayTimeZone,
                }),
              );
            }

            timeline.appendChild(wrapper);
          });

          daySection.appendChild(timeline);
          this.root.appendChild(daySection);
        });
      }
    }

    class ScheduleApp {
      constructor(container, options = {}) {
        this.container = container;
        this.source = options.source || container?.dataset.programSource || 'conference';
        this.year = options.year || container?.dataset.programYear || '2026';
        this.fallbackAvatar =
          options.fallbackAvatar ||
          container?.dataset.programFallbackAvatar ||
          container?.dataset.scheduleFallbackAvatar ||
          FALLBACK_AVATAR;
        this.renderer = new ScheduleRenderer({
          root: container?.querySelector('[data-schedule-root]'),
          dayNav: container?.querySelector('[data-schedule-day-nav]'),
          timezoneToggle: container?.querySelector('[data-schedule-timezone-toggle]'),
          timezoneLabel: container?.querySelector('[data-schedule-timezone-label]'),
          eventMeta: container?.querySelector('[data-schedule-event-meta]'),
          eventIntro: container?.querySelector('[data-schedule-event-intro]'),
          templateRoot: container?.querySelector('[data-schedule-templates]'),
          year: this.year,
          fallbackAvatar: this.fallbackAvatar,
        });
        this.bindEvents();
      }

      bindEvents() {
        const toggleRoot = this.container?.querySelector('[data-schedule-timezone-toggle]');
        if (toggleRoot) {
          toggleRoot.addEventListener('click', (event) => {
            const target = event.target.closest('[data-timezone-option]');
            if (!target) return;
            const mode = target.getAttribute('data-timezone-option');
            if (!mode || mode === this.renderer.displayTimeZone) return;
            this.renderer.setDisplayTimeZone(mode);
          });
        }

        const scheduleRoot = this.container?.querySelector('[data-schedule-root]');
        if (scheduleRoot) {
          scheduleRoot.addEventListener('click', (event) => {
            const trigger =
              event.target instanceof Element
                ? event.target.closest('[data-schedule-submission-trigger="true"]')
                : null;
            if (!(trigger instanceof HTMLButtonElement)) return;
            if (trigger.hasAttribute('data-details-modal-open')) return;
            event.preventDefault();
            event.stopPropagation();
            this.loadSubmissionDetails(trigger);
          });
        }
      }

      findSubmissionTrigger(submissionId) {
        const buttons = this.container?.querySelectorAll('[data-schedule-submission-id]') || [];
        return (
          Array.from(buttons).find(
            (button) => button.getAttribute('data-schedule-submission-id') === submissionId,
          ) || null
        );
      }

      openTemporaryMessage(trigger, title, message) {
        const templateId = this.renderer.nextTemplateId('schedule-message');
        const template = document.createElement('template');
        const wrapper = Dom.el('div', 'space-y-3');
        wrapper.appendChild(Dom.el('p', 'text-sm leading-7 text-pnsqc-slate', message));
        template.id = templateId;
        template.content.appendChild(wrapper);
        this.renderer.templateRoot.appendChild(template);
        trigger.setAttribute('data-details-modal-open', templateId);
        trigger.setAttribute('data-details-modal-title', title);
        trigger.setAttribute('data-details-modal-label', 'Details');
        trigger.click();
        window.setTimeout(() => {
          trigger.removeAttribute('data-details-modal-open');
        }, 0);
      }

      async loadSubmissionDetails(trigger) {
        const submissionId = trigger.getAttribute('data-schedule-submission-id');
        if (!submissionId || trigger.getAttribute('data-schedule-loading') === 'true') return;
        trigger.setAttribute('data-schedule-loading', 'true');
        trigger.setAttribute('aria-busy', 'true');
        trigger.disabled = true;

        try {
          const detail = await programData.loadMeetingHandSubmission({
            year: this.year,
            id: submissionId,
          });
          this.renderer.submissionDetails.set(submissionId, detail || null);
          if (this.renderer.scheduleCache) {
            this.renderer.render(this.renderer.scheduleCache);
            const updatedTrigger = this.findSubmissionTrigger(submissionId);
            if (updatedTrigger instanceof HTMLButtonElement) updatedTrigger.click();
          }
        } catch (error) {
          console.error(error);
          this.openTemporaryMessage(
            trigger,
            trigger.getAttribute('data-details-modal-title') || 'Details',
            'We could not load those details right now. Please try again.',
          );
        } finally {
          trigger.removeAttribute('data-schedule-loading');
          trigger.removeAttribute('aria-busy');
          trigger.disabled = false;
        }
      }

      async init() {
        try {
          const payload = await programData.loadProgramPayload({
            source: this.source,
            year: this.year,
          });
          const eventData = payload?.data || payload || {};
          this.renderer.setProgram(
            programData.normalizeProgramPayload(payload, {
              source: this.source,
              year: this.year,
              fallbackAvatar: this.fallbackAvatar,
            }),
          );
          this.renderer.render(eventData);
        } catch (error) {
          console.error(error);
          this.renderError(
            'The live schedule is temporarily unavailable. Please check back shortly.',
          );
        }
      }

      renderError(message) {
        const nav = this.container?.querySelector('[data-schedule-day-nav]');
        const root = this.container?.querySelector('[data-schedule-root]');
        if (nav) {
          nav.innerHTML = '';
          nav.appendChild(
            Dom.el(
              'span',
              'inline-flex items-center gap-2 rounded-full border border-red-300/30 px-5 py-2 text-sm font-semibold text-red-200',
              'Unable to load day navigation',
            ),
          );
        }
        if (root) {
          root.innerHTML = '';
          const card = Dom.el('div', 'rounded-lg border border-red-300/30 bg-red-500/10 p-6');
          card.appendChild(Dom.el('p', 'text-lg text-red-100', message));
          root.appendChild(card);
        }
      }
    }

    function createScheduleApp(container, options) {
      return new ScheduleApp(container, options);
    }

    function initSchedulePages(doc = document) {
      doc.querySelectorAll('[data-program-schedule]').forEach((container) => {
        const app = createScheduleApp(container);
        app.init();
      });
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initSchedulePages(), { once: true });
      } else {
        initSchedulePages();
      }
    }

    return {
      SubmissionFormatter,
      TextUtils,
      TimeUtils,
      createScheduleApp,
      getScheduleItemSubmissionId,
      groupScheduleItems,
      groupSessionsByTime,
      initSchedulePages,
    };
  },
);
