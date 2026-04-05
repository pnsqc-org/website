(() => {
  'use strict';

  const API_URL = 'https://api.meetinghand.com/api/events/pnsqc-2026';
  const PLACEHOLDER_TITLE = 'Unassigned Meeting';

  class Dom {
    static el(tagName, className, text) {
      const node = document.createElement(tagName);
      if (className) node.className = className;
      if (typeof text === 'string') node.textContent = text;
      return node;
    }
  }

  class TextUtils {
    static normalizeSpace(value) {
      if (!value || typeof value !== 'string') return '';
      return value.replace(/\s+/g, ' ').trim();
    }

    static normalizeCompareText(value) {
      return TextUtils.normalizeSpace(value).replace(/:\s*$/, '').toLowerCase();
    }
  }

  class TimeUtils {
    static parseTimeToMinutes(rawTime) {
      if (typeof rawTime !== 'string' || !rawTime.includes(':')) return null;
      const pieces = rawTime.split(':');
      const hour = Number(pieces[0]);
      const minute = Number(pieces[1]);
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
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
      if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }

    static getTimeZoneOffset(date, timeZone) {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = dtf.formatToParts(date);
      const values = {};
      parts.forEach((part) => {
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
      const year = dateOnly.getUTCFullYear();
      const month = dateOnly.getUTCMonth();
      const day = dateOnly.getUTCDate();
      const hour = Math.floor(minutesFromMidnight / 60);
      const minute = minutesFromMidnight % 60;
      const utcCandidate = new Date(Date.UTC(year, month, day, hour, minute, 0));
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
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: timeFormat !== 'h24',
        timeZone: displayTimeZone === 'event' ? eventTimeZone : undefined,
      });
      return formatter.format(new Date(utcMillis)).toLowerCase();
    }

    static formatSessionTimeRange(session, dayIso, timeFormat, displayTimeZone, eventTimeZone) {
      const startMinutes = TimeUtils.parseTimeToMinutes(session.start);
      const endMinutes = TimeUtils.parseTimeToMinutes(session.end);
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
      const withYear = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return `${withYear.format(startDate)} - ${withYear.format(endDate)}`;
    }

    static formatDayHeading(dateIso) {
      const dateOnly = TimeUtils.parseDateOnly(dateIso);
      if (!dateOnly) return 'Date TBA';
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
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

    static formatDayBadgeLabel(index) {
      const dayNumber = index + 1;
      const suffix = dayNumber === 3 ? 'Workshops' : 'Program';
      return `Day ${dayNumber} | ${suffix}`;
    }
  }

  class SubmissionFormatter {
    static sanitizeHtmlFragment(value) {
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
    }

    static formatSubmissionValue(value) {
      if (!value) return '';
      const raw = String(value)
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\\t/g, '\t');
      return SubmissionFormatter.sanitizeHtmlFragment(raw);
    }

    static buildSubmissionDescription(payload) {
      let fields = null;
      if (payload?.data && Array.isArray(payload.data.fields)) {
        fields = payload.data.fields;
      } else if (payload && Array.isArray(payload.fields)) {
        fields = payload.fields;
      }
      if (!fields) return null;

      const result = { abstract: '', objectives: '', bio: '' };
      fields.forEach((field) => {
        const fieldId = field?.event_submission_field_id || field?.id;
        if (!fieldId) return;
        const value = SubmissionFormatter.formatSubmissionValue(field.value);
        if (!value) return;
        if (String(fieldId) === '1469') result.abstract = value;
        else if (String(fieldId) === '1470') result.objectives = value;
        else if (String(fieldId) === '1471') result.bio = value;
      });

      if (!result.abstract && !result.objectives && !result.bio) return null;
      return result;
    }

    static extractAbstractMap(session) {
      const html = session?.description;
      const map = new Map();
      if (!html || typeof html !== 'string') return map;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const children = Array.from(doc.body.children);

      for (let i = 0; i < children.length; i += 1) {
        const node = children[i];
        const titleText = TextUtils.normalizeCompareText(node.textContent || '');
        if (!titleText) continue;

        let blockquote = null;
        for (let j = i + 1; j < children.length; j += 1) {
          const next = children[j];
          if (next.tagName && next.tagName.toLowerCase() === 'blockquote') {
            blockquote = next;
            break;
          }
          if (TextUtils.normalizeCompareText(next.textContent || '') !== '') break;
        }

        if (!blockquote) continue;

        const abstractHtml = SubmissionFormatter.sanitizeHtmlFragment(blockquote.innerHTML);
        if (abstractHtml) map.set(titleText, abstractHtml);
      }

      return map;
    }
  }

  class MeetinghandClient {
    constructor(apiUrl) {
      this.apiUrl = apiUrl;
      this.submissionRequests = new Map();
    }

    async fetchEvent() {
      const response = await fetch(this.apiUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Failed to fetch schedule: ${response.status}`);
      }
      const payload = await response.json();
      if (!payload || !payload.data) {
        throw new Error('Schedule payload is missing data.');
      }
      return payload.data;
    }

    async fetchSubmission(id) {
      const submissionId = String(id || '');
      if (!submissionId) return null;

      if (this.submissionRequests.has(submissionId)) {
        return this.submissionRequests.get(submissionId);
      }

      const request = fetch(`${this.apiUrl}/submissions/${submissionId}`, {
        headers: { Accept: 'application/json' },
      })
        .then((response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error(`Failed to fetch submission: ${response.status}`);
          return response.json();
        })
        .then((payload) => SubmissionFormatter.buildSubmissionDescription(payload))
        .catch((error) => {
          this.submissionRequests.delete(submissionId);
          throw error;
        });

      this.submissionRequests.set(submissionId, request);
      return request;
    }
  }

  class ModalTemplateManager {
    constructor(templateRoot) {
      this.templateRoot = templateRoot || document.body;
      this.counter = 0;
    }

    reset() {
      this.counter = 0;
      if (this.templateRoot) this.templateRoot.innerHTML = '';
    }

    nextId(prefix) {
      this.counter += 1;
      return `${prefix}-${this.counter}`;
    }

    createAbstractTemplate({ isSubmissionType, submissionDetail, abstractText, abstractHtml }) {
      const templateId = this.nextId('schedule-abstract');
      const template = document.createElement('template');
      template.id = templateId;
      const wrapper = Dom.el('div', 'space-y-6');

      if (isSubmissionType && submissionDetail) {
        if (submissionDetail.abstract) {
          const abstractSection = Dom.el('div', 'space-y-2');
          abstractSection.appendChild(
            Dom.el(
              'p',
              'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80',
              'Abstract',
            ),
          );
          const abstractBody = Dom.el(
            'div',
            'schedule-modal-content text-sm leading-7 text-pnsqc-slate space-y-3',
          );
          abstractBody.innerHTML = submissionDetail.abstract;
          abstractSection.appendChild(abstractBody);
          wrapper.appendChild(abstractSection);
        }

        if (submissionDetail.objectives) {
          const objectiveSection = Dom.el('div', 'space-y-2');
          objectiveSection.appendChild(
            Dom.el(
              'p',
              'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80',
              'Learning Objectives',
            ),
          );
          const objectivesBody = Dom.el(
            'div',
            'schedule-modal-content text-sm leading-7 text-pnsqc-slate space-y-3',
          );
          objectivesBody.innerHTML = submissionDetail.objectives;
          objectiveSection.appendChild(objectivesBody);
          wrapper.appendChild(objectiveSection);
        }
      } else if (abstractHtml) {
        const abstractBody = Dom.el(
          'div',
          'schedule-modal-content text-sm leading-7 text-pnsqc-slate space-y-3',
        );
        abstractBody.innerHTML = abstractHtml;
        wrapper.appendChild(abstractBody);
      } else {
        wrapper.appendChild(
          Dom.el('p', 'text-sm leading-7 text-pnsqc-slate whitespace-pre-line', abstractText),
        );
      }

      template.content.appendChild(wrapper);
      this.templateRoot.appendChild(template);
      return templateId;
    }

    createSpeakerTemplate({
      speakerObj,
      itemSpeaker,
      itemTitle,
      submissionBio,
      authorTitle,
      useSubmission,
    }) {
      const templateId = this.nextId('schedule-speaker');
      const template = document.createElement('template');
      template.id = templateId;

      const wrapper = Dom.el('div', 'space-y-6');
      const top = Dom.el('div', 'flex flex-col sm:flex-row items-start gap-5');
      const avatar = Dom.el('img', 'h-20 w-20 rounded-lg object-cover ring-2 ring-pnsqc-gold/30');
      avatar.src = speakerObj?.avatar || '/images/brand/pnsqc-logo.jpg';
      avatar.alt = itemSpeaker || 'Speaker';
      avatar.loading = 'lazy';
      top.appendChild(avatar);

      const topContent = Dom.el('div', 'space-y-2');
      topContent.appendChild(
        Dom.el('h4', 'text-lg font-semibold text-white', itemSpeaker || 'Speaker'),
      );
      const profession = speakerObj?.profession || authorTitle;
      if (profession) {
        topContent.appendChild(Dom.el('p', 'text-sm text-pnsqc-slate', String(profession)));
      }
      if (itemTitle) {
        topContent.appendChild(Dom.el('p', 'text-sm text-pnsqc-gold', itemTitle));
      }

      if (speakerObj && !useSubmission) {
        const iconRow = Dom.el('div', 'flex flex-wrap items-center gap-2');
        const addIcon = (opts) => {
          if (!opts.href) return;
          const link = Dom.el(
            'a',
            'inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors',
          );
          link.href = opts.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', opts.label);
          link.setAttribute('title', opts.label);
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'currentColor');
          svg.setAttribute('class', 'w-4 h-4 text-white/80');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', opts.svgPath);
          svg.appendChild(path);
          link.appendChild(svg);
          iconRow.appendChild(link);
        };

        addIcon({
          href: speakerObj.linkedin,
          label: 'LinkedIn profile',
          svgPath:
            'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
        });
        addIcon({
          href: speakerObj.homepage,
          label: 'Speaker homepage',
          svgPath: 'M12 3l9 8h-3v9a1 1 0 01-1 1h-4v-6H11v6H7a1 1 0 01-1-1v-9H3l9-8z',
        });
        addIcon({
          href: speakerObj.twitter,
          label: 'Twitter profile',
          svgPath:
            'M19.633 7.997c.013.18.013.36.013.541 0 5.507-4.193 11.859-11.859 11.859-2.356 0-4.547-.688-6.392-1.873.33.04.65.053.993.053a8.396 8.396 0 005.204-1.793 4.195 4.195 0 01-3.913-2.903c.256.04.512.066.781.066.372 0 .742-.053 1.088-.146a4.19 4.19 0 01-3.36-4.115v-.053c.556.305 1.192.49 1.87.517a4.186 4.186 0 01-1.87-3.487c0-.768.2-1.47.556-2.083a11.9 11.9 0 008.644 4.381 4.732 4.732 0 01-.107-.96 4.193 4.193 0 017.252-2.867 8.215 8.215 0 002.65-1.007 4.183 4.183 0 01-1.84 2.315 8.39 8.39 0 002.409-.636 9.043 9.043 0 01-2.097 2.169z',
        });

        if (iconRow.childElementCount > 0) topContent.appendChild(iconRow);
      }

      top.appendChild(topContent);
      wrapper.appendChild(top);

      const bioSection = Dom.el('div', 'space-y-2');
      bioSection.appendChild(
        Dom.el('p', 'text-xs font-semibold uppercase tracking-widest text-pnsqc-gold/80', 'Bio'),
      );

      if (useSubmission) {
        const submissionBioBody = Dom.el(
          'div',
          'schedule-modal-content text-sm leading-7 text-pnsqc-slate space-y-3',
        );
        submissionBioBody.innerHTML = submissionBio || 'Bio coming soon.';
        bioSection.appendChild(submissionBioBody);
      } else {
        bioSection.appendChild(
          Dom.el(
            'p',
            'text-sm leading-7 text-pnsqc-slate whitespace-pre-line',
            speakerObj?.short_bio || 'Bio coming soon.',
          ),
        );
      }

      wrapper.appendChild(bioSection);
      template.content.appendChild(wrapper);
      this.templateRoot.appendChild(template);

      return templateId;
    }
  }

  class ScheduleRenderer {
    constructor({
      root,
      dayNav,
      trackLegend,
      timezoneToggle,
      timezoneLabel,
      eventMeta,
      eventIntro,
      templateRoot,
    }) {
      this.root = root;
      this.dayNav = dayNav;
      this.trackLegend = trackLegend;
      this.timezoneToggle = timezoneToggle;
      this.timezoneLabel = timezoneLabel;
      this.eventMeta = eventMeta;
      this.eventIntro = eventIntro;
      this.templateRoot = templateRoot || document.body;
      this.submissionDetails = new Map();
      this.modalManager = new ModalTemplateManager(this.templateRoot);
      this.displayTimeZone = 'local';
      this.scheduleCache = null;
    }

    setDisplayTimeZone(mode) {
      this.displayTimeZone = mode;
      if (this.scheduleCache) {
        this.render(this.scheduleCache);
      }
    }

    setScheduleCache(data) {
      this.scheduleCache = data;
    }

    isKeynoteSession(session) {
      return !!(session?.title && /keynote/i.test(session.title));
    }

    isInvitedSpeakersSession(session) {
      return !!(session?.title && /invited\s+speakers?/i.test(session.title));
    }

    speakerFromItem(item) {
      const presentation = item?.presentation;
      if (!presentation) return '';
      const speakerCandidates = []
        .concat(Array.isArray(presentation.speakers) ? presentation.speakers : [])
        .concat(presentation.speaker ? [presentation.speaker] : []);

      if (speakerCandidates.length > 0) {
        const names = speakerCandidates
          .map((person) => `${person?.firstname || ''} ${person?.lastname || ''}`.trim())
          .filter(Boolean);
        if (names.length > 0) return names.join(', ');
      }

      if (Array.isArray(presentation.authors)) {
        const authorNames = presentation.authors
          .map((author) => `${author?.firstname || ''} ${author?.lastname || ''}`.trim())
          .filter(Boolean);
        if (authorNames.length > 0) return authorNames.join(', ');
      }

      const presenterAuthor = presentation.presenterAuthor || presentation.presenter_author;
      if (presenterAuthor) {
        const name = `${presenterAuthor.firstname || ''} ${presenterAuthor.lastname || ''}`.trim();
        if (name) return name;
      }

      if (presentation.participant) {
        const name =
          `${presentation.participant.firstname || ''} ${presentation.participant.lastname || ''}`.trim();
        if (name) return name;
      }

      return '';
    }

    speakerObjectFromItem(item) {
      const presentation = item?.presentation;
      if (!presentation) return null;
      const candidates = []
        .concat(presentation.speaker ? [presentation.speaker] : [])
        .concat(Array.isArray(presentation.speakers) ? presentation.speakers : []);
      return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
    }

    renderTrackLegend() {
      if (this.trackLegend) this.trackLegend.innerHTML = '';
    }

    renderTimezoneToggle() {
      if (!this.timezoneToggle) return;
      const options = this.timezoneToggle.querySelectorAll('[data-timezone-option]');
      options.forEach((option) => {
        const mode = option.getAttribute('data-timezone-option');
        const active = mode === this.displayTimeZone;
        option.className = active
          ? 'px-4 py-2 rounded-full border border-pnsqc-gold/40 text-pnsqc-gold text-xs font-semibold uppercase tracking-widest'
          : 'px-4 py-2 rounded-full border border-white/10 text-pnsqc-slate text-xs font-semibold uppercase tracking-widest hover:text-white hover:border-white/30 transition-colors';
      });

      if (this.timezoneLabel) {
        if (this.displayTimeZone === 'event') {
          this.timezoneLabel.textContent = 'Showing times in Pacific Time (event timezone).';
        } else {
          const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your timezone';
          this.timezoneLabel.textContent = `Showing times in your timezone: ${browserZone}.`;
        }
      }
    }

    renderEventHeader(data) {
      if (this.eventMeta) {
        const pieces = [];
        const dateRange = TimeUtils.formatEventDateRange(data.start_date, data.end_date);
        if (dateRange) pieces.push(dateRange);
        const locationParts = [];
        if (data?.event_location?.city) locationParts.push(data.event_location.city);
        if (data?.event_location?.state) locationParts.push(data.event_location.state);
        if (locationParts.length > 0) pieces.push(locationParts.join(', '));
        if (pieces.length > 0) this.eventMeta.textContent = pieces.join(' | ');
      }

      if (this.eventIntro && data?.long_name) {
        if (!this.eventIntro.textContent || !this.eventIntro.textContent.trim()) {
          this.eventIntro.textContent = `Live schedule for ${data.long_name}.`;
        }
      }
    }

    renderDayNavigation(days) {
      if (!this.dayNav) return;
      this.dayNav.innerHTML = '';
      if (!days.length) {
        this.dayNav.appendChild(
          Dom.el(
            'span',
            'inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/20 text-pnsqc-slate text-sm font-semibold',
            'No schedule days published yet',
          ),
        );
        return;
      }

      days.forEach((day, index) => {
        const link = Dom.el(
          'a',
          'day-nav-link inline-flex items-center gap-2 px-5 py-2 rounded-full border border-pnsqc-gold/30 text-pnsqc-gold text-sm font-semibold',
          TimeUtils.formatDayNavLabel(day.date, index),
        );
        link.href = `#day-${index + 1}`;
        this.dayNav.appendChild(link);
      });
    }

    buildSessionCard({ session, dayIso, timeFormat, eventTimeZone, displayTimeZone }) {
      const isBreak = !!session?.is_break;
      const isKeynote = this.isKeynoteSession(session);
      const cardClass = isBreak
        ? 'rounded-lg px-4 py-4 h-full flex flex-col bg-pnsqc-cyan/10 border border-pnsqc-cyan/20'
        : isKeynote
          ? 'session-card glow-gold relative rounded-xl px-4 py-4 h-full flex flex-col bg-gradient-to-br from-pnsqc-gold/10 via-pnsqc-cyan/10 to-pnsqc-blue/50 border border-pnsqc-gold/30'
          : 'session-card gold-readable-surface border border-white/10 rounded-lg px-4 py-4 h-full flex flex-col';

      const card = Dom.el('div', cardClass);
      const timeText = TimeUtils.formatSessionTimeRange(
        session,
        dayIso,
        timeFormat,
        displayTimeZone,
        eventTimeZone,
      );
      const timeClass = isKeynote
        ? 'text-sm sm:text-base uppercase tracking-widest text-pnsqc-gold font-semibold tabular-nums mb-2'
        : isBreak
          ? 'text-sm sm:text-base uppercase tracking-wide text-white font-semibold tabular-nums mb-2'
          : 'text-sm sm:text-base uppercase tracking-wide text-pnsqc-gold font-semibold tabular-nums mb-2';
      const wrapperClasses = 'flex items-center gap-2 ' + timeClass;
      const timeWrapper = Dom.el('div', wrapperClasses);
      const clockSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      clockSvg.setAttribute('class', 'w-4 h-4');
      clockSvg.setAttribute('fill', 'none');
      clockSvg.setAttribute('stroke', 'currentColor');
      clockSvg.setAttribute('stroke-width', '2');
      clockSvg.setAttribute('viewBox', '0 0 24 24');
      clockSvg.setAttribute('aria-hidden', 'true');
      clockSvg.innerHTML = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
      timeWrapper.appendChild(clockSvg);
      timeWrapper.appendChild(Dom.el('span', '', timeText));
      card.appendChild(timeWrapper);

      const titleRow = Dom.el('div', 'flex items-center gap-2');
      if (isBreak) {
        const icon = Dom.el('span', 'text-lg');
        icon.innerHTML = '&#127869;';
        titleRow.appendChild(icon);
      }
      const titleText = session?.title ? String(session.title) : PLACEHOLDER_TITLE;
      const titleClass = isKeynote
        ? 'text-white font-bold text-lg sm:text-xl leading-snug'
        : isBreak
          ? 'text-pnsqc-cyan font-semibold text-lg'
          : 'text-white font-semibold text-lg';
      titleRow.appendChild(Dom.el('p', titleClass, titleText));
      card.appendChild(titleRow);

      if (session?.location) {
        const locationWrapper = Dom.el(
          'div',
          'flex items-center gap-2 text-pnsqc-slate text-sm mt-1 mb-2',
        );
        const locationIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        locationIcon.setAttribute('class', 'w-4 h-4 shrink-0');
        locationIcon.setAttribute('fill', 'none');
        locationIcon.setAttribute('stroke', 'currentColor');
        locationIcon.setAttribute('stroke-width', '2');
        locationIcon.setAttribute('viewBox', '0 0 24 24');
        locationIcon.setAttribute('aria-hidden', 'true');
        locationIcon.innerHTML =
          '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>';
        locationWrapper.appendChild(locationIcon);
        locationWrapper.appendChild(Dom.el('span', '', String(session.location)));
        card.appendChild(locationWrapper);
      }

      const items = Array.isArray(session.items) ? session.items.filter(Boolean) : [];
      if (!isBreak && items.length > 0) {
        const list = Dom.el('div', 'mt-3 space-y-3');
        const baseStartMinutes = TimeUtils.parseTimeToMinutes(session.start);
        let lastEndMinutes = baseStartMinutes;
        const abstractMap = SubmissionFormatter.extractAbstractMap(session);
        const showPresentationTimes = !isKeynote && !session?.is_timeless_items;

        items
          .slice()
          .sort((a, b) => (Number(a?.order) || 9999) - (Number(b?.order) || 9999))
          .forEach((item, index) => {
            const duration = Number(item?.duration) || 0;
            const startMinutes =
              index === 0
                ? baseStartMinutes
                : typeof lastEndMinutes === 'number'
                  ? lastEndMinutes + 10
                  : null;
            const endMinutes =
              typeof startMinutes === 'number' ? startMinutes + duration - 10 : null;
            lastEndMinutes = endMinutes;

            const presentation = item?.presentation;
            const itemTitle = presentation?.title || PLACEHOLDER_TITLE;
            const itemSpeaker = this.speakerFromItem(item);
            const speakerObj = this.speakerObjectFromItem(item);
            const isSubmissionType = !!presentation?.presentation_type;
            const submissionId = item?.participant_submission_id
              ? String(item.participant_submission_id)
              : presentation?.id
                ? String(presentation.id)
                : '';
            const hasLoadedSubmissionDetail =
              !!(isSubmissionType && submissionId && this.submissionDetails.has(submissionId));
            const submissionDetail = hasLoadedSubmissionDetail
              ? this.submissionDetails.get(submissionId)
              : null;
            const fallbackAbstractHtml =
              abstractMap.get(TextUtils.normalizeCompareText(itemTitle)) || '';

            let abstractText = '';
            let abstractHtml = '';
            if (isSubmissionType && submissionDetail) {
              if (submissionDetail.abstract)
                abstractText += `Abstract\n\n${submissionDetail.abstract}`;
              if (submissionDetail.objectives) {
                abstractText += `${abstractText ? '\n\n' : ''}Learning Objectives\n\n${submissionDetail.objectives}`;
              }
            } else if (fallbackAbstractHtml) {
              abstractHtml = fallbackAbstractHtml;
            } else if (isSubmissionType && hasLoadedSubmissionDetail) {
              abstractText = 'Abstract details are coming soon.';
            }

            const timeLabel = showPresentationTimes
              ? typeof startMinutes === 'number' && typeof endMinutes === 'number'
                ? `${TimeUtils.formatMinutesForDisplay(dayIso, startMinutes, timeFormat, displayTimeZone, eventTimeZone)} - ${TimeUtils.formatMinutesForDisplay(dayIso, endMinutes, timeFormat, displayTimeZone, eventTimeZone)}`
                : 'Time TBA'
              : '';

            const row = showPresentationTimes
              ? Dom.el('div', 'grid gap-x-4 gap-y-1 sm:grid-cols-[140px,1fr]')
              : Dom.el('div');
            if (showPresentationTimes) {
              row.appendChild(
                Dom.el(
                  'span',
                  'text-xs uppercase tracking-widest text-pnsqc-gold font-semibold tabular-nums leading-6',
                  timeLabel,
                ),
              );
            }

            const detail = Dom.el('div', 'space-y-1');
            const titleRowInner = Dom.el('div', 'flex items-start gap-2');
            const titleContent = Dom.el('div', 'min-w-0 flex flex-1 flex-col gap-1');

            if (speakerObj?.avatar) {
              const avatar = Dom.el(
                'img',
                'h-6 w-6 rounded-full object-cover ring-1 ring-white/20',
              );
              avatar.src = speakerObj.avatar;
              avatar.alt = itemSpeaker || 'Speaker';
              avatar.loading = 'lazy';
              titleRowInner.appendChild(avatar);
            }

            if (abstractHtml || abstractText) {
              const templateId = this.modalManager.createAbstractTemplate({
                isSubmissionType,
                submissionDetail,
                abstractText,
                abstractHtml,
              });
              const titleButtonClass = isKeynote
                ? 'text-left text-white font-bold text-lg sm:text-xl hover:text-pnsqc-gold transition-colors'
                : 'text-left text-white font-medium hover:text-pnsqc-gold transition-colors';
              const titleButton = Dom.el('button', titleButtonClass, itemTitle);
              titleButton.type = 'button';
              titleButton.setAttribute('data-track-modal-open', templateId);
              titleButton.setAttribute('data-track-modal-title', itemTitle);
              titleButton.setAttribute('data-track-modal-label', 'Abstract');
              if (submissionId) {
                titleButton.setAttribute('data-schedule-abstract-trigger', 'true');
                titleButton.setAttribute('data-schedule-submission-id', submissionId);
              }
              titleContent.appendChild(titleButton);
            } else if (isSubmissionType && submissionId) {
              const titleButtonClass = isKeynote
                ? 'text-left text-white font-bold text-lg sm:text-xl hover:text-pnsqc-gold transition-colors'
                : 'text-left text-white font-medium hover:text-pnsqc-gold transition-colors';
              const titleButton = Dom.el('button', titleButtonClass, itemTitle);
              titleButton.type = 'button';
              titleButton.setAttribute('data-track-modal-title', itemTitle);
              titleButton.setAttribute('data-track-modal-label', 'Abstract');
              titleButton.setAttribute('data-schedule-abstract-trigger', 'true');
              titleButton.setAttribute('data-schedule-submission-id', submissionId);
              titleContent.appendChild(titleButton);
            } else {
              const itemTitleClass = isKeynote
                ? 'text-white font-bold text-lg sm:text-xl'
                : 'text-white font-medium';
              titleContent.appendChild(Dom.el('p', itemTitleClass, itemTitle));
            }

            if (itemSpeaker) {
              if (speakerObj && !isSubmissionType) {
                const speakerTemplateId = this.modalManager.createSpeakerTemplate({
                  speakerObj,
                  itemSpeaker,
                  itemTitle,
                  useSubmission: false,
                });
                const speakerButtonClass = isKeynote
                  ? 'text-pnsqc-gold-light text-sm font-medium hover:text-pnsqc-gold transition-colors text-left'
                  : 'text-pnsqc-slate text-sm hover:text-pnsqc-gold transition-colors text-left';
                const speakerButton = Dom.el('button', speakerButtonClass, itemSpeaker);
                speakerButton.type = 'button';
                speakerButton.setAttribute('data-track-modal-open', speakerTemplateId);
                speakerButton.setAttribute('data-track-modal-title', itemSpeaker);
                speakerButton.setAttribute('data-track-modal-label', 'Speaker');
                titleContent.appendChild(speakerButton);
              } else if (isSubmissionType) {
                const submissionBio = submissionDetail?.bio || 'Bio coming soon.';
                const authorTitle = presentation?.authors?.[0]?.title
                  ? String(presentation.authors[0].title)
                  : '';
                const submissionSpeakerTemplateId = this.modalManager.createSpeakerTemplate({
                  itemSpeaker,
                  itemTitle,
                  submissionBio,
                  authorTitle,
                  useSubmission: true,
                });
                const submissionSpeakerButtonClass = isKeynote
                  ? 'text-pnsqc-gold-light text-sm font-medium hover:text-pnsqc-gold transition-colors text-left'
                  : 'text-pnsqc-slate text-sm hover:text-pnsqc-gold transition-colors text-left';
                const submissionSpeakerButton = Dom.el(
                  'button',
                  submissionSpeakerButtonClass,
                  itemSpeaker,
                );
                submissionSpeakerButton.type = 'button';
                submissionSpeakerButton.setAttribute(
                  'data-track-modal-open',
                  submissionSpeakerTemplateId,
                );
                submissionSpeakerButton.setAttribute('data-track-modal-title', itemSpeaker);
                submissionSpeakerButton.setAttribute('data-track-modal-label', 'Speaker');
                titleContent.appendChild(submissionSpeakerButton);
              } else {
                const speakerLineClass = isKeynote
                  ? 'text-pnsqc-gold-light text-sm font-medium'
                  : 'text-pnsqc-slate text-sm';
                titleContent.appendChild(Dom.el('p', speakerLineClass, itemSpeaker));
              }
            }

            titleRowInner.appendChild(titleContent);
            detail.appendChild(titleRowInner);
            row.appendChild(detail);
            list.appendChild(row);
          });

        card.appendChild(list);
      }

      return card;
    }

    render(data) {
      if (!this.root) return;
      const days = Array.isArray(data?.schedule) ? data.schedule : [];
      const eventTimeZone = data?.timezone?.key || 'America/Los_Angeles';
      const timeFormat = data?.time_format === 'h24' ? 'h24' : 'h12';

      this.renderEventHeader(data);
      this.renderDayNavigation(days);
      this.renderTrackLegend();
      this.renderTimezoneToggle(eventTimeZone);

      this.root.innerHTML = '';
      this.modalManager.reset();
      if (days.length === 0) {
        const emptyCard = Dom.el(
          'div',
          'p-6 bg-pnsqc-blue/10 border border-pnsqc-gold/20 rounded-lg',
        );
        emptyCard.appendChild(
          Dom.el('p', 'text-pnsqc-slate text-lg', 'Schedule details are coming soon.'),
        );
        this.root.appendChild(emptyCard);
        return;
      }

      days.forEach((day, dayIndex) => {
        const daySection = Dom.el('div');
        daySection.id = `day-${dayIndex + 1}`;
        const dayHeader = Dom.el('div', 'flex items-center gap-4 mb-6');
        dayHeader.appendChild(
          Dom.el(
            'h2',
            'text-2xl sm:text-3xl font-bold text-white whitespace-nowrap',
            TimeUtils.formatDayHeading(day.date),
          ),
        );
        dayHeader.appendChild(Dom.el('div', 'hr-gradient flex-1 mt-1'));
        dayHeader.appendChild(
          Dom.el(
            'span',
            'text-xs uppercase tracking-widest text-pnsqc-gold font-semibold whitespace-nowrap gold-readable',
            TimeUtils.formatDayBadgeLabel(dayIndex),
          ),
        );
        daySection.appendChild(dayHeader);

        const timeline = Dom.el('div', 'space-y-6');
        const sessions = Array.isArray(day.sessions) ? day.sessions.slice() : [];
        sessions.sort((a, b) =>
          String(a?.start || '99:99').localeCompare(String(b?.start || '99:99')),
        );

        if (sessions.length === 0) {
          const noSessions = Dom.el(
            'div',
            'p-4 border border-white/10 rounded-lg text-pnsqc-slate',
          );
          noSessions.textContent = 'Sessions for this day are still being assigned.';
          timeline.appendChild(noSessions);
        } else {
          const grouped = [];
          const groupMap = new Map();
          sessions.forEach((session) => {
            const startKey = session?.start ? String(session.start) : '';
            const endKey = session?.end ? String(session.end) : '';
            const key = `${startKey}|${endKey}`;
            if (!groupMap.has(key)) {
              groupMap.set(key, []);
              grouped.push(groupMap.get(key));
            }
            groupMap.get(key).push(session);
          });

          grouped.forEach((group) => {
            group.sort((a, b) => {
              const aIsInvited = this.isInvitedSpeakersSession(a) ? 1 : 0;
              const bIsInvited = this.isInvitedSpeakersSession(b) ? 1 : 0;
              return bIsInvited - aIsInvited;
            });
            const hasKeynote = group.some((session) => this.isKeynoteSession(session));
            const hasNonBreak = group.some((session) => session && !session.is_break);
            const dotClass = hasKeynote
              ? 'timeline-dot timeline-dot--keynote'
              : hasNonBreak
                ? 'timeline-dot'
                : 'timeline-dot timeline-dot--social';

            if (group.length > 1) {
              const rowWrapper = Dom.el('div', 'timeline-block pb-6');
              rowWrapper.appendChild(Dom.el('div', dotClass));
              const row = Dom.el('div', 'grid gap-6 schedule-sessions-grid');
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
              rowWrapper.appendChild(row);
              timeline.appendChild(rowWrapper);
            } else {
              const singleWrapper = Dom.el('div', 'timeline-block pb-6');
              singleWrapper.appendChild(Dom.el('div', dotClass));
              singleWrapper.appendChild(
                this.buildSessionCard({
                  session: group[0],
                  dayIso: day.date,
                  timeFormat,
                  eventTimeZone,
                  displayTimeZone: this.displayTimeZone,
                }),
              );
              timeline.appendChild(singleWrapper);
            }
          });
        }

        daySection.appendChild(timeline);
        this.root.appendChild(daySection);
      });
    }
  }

  class AtAGlanceApp {
    constructor() {
      this.client = new MeetinghandClient(API_URL);
      this.renderer = new ScheduleRenderer({
        root: document.getElementById('schedule-root'),
        dayNav: document.getElementById('day-nav'),
        trackLegend: document.getElementById('track-legend'),
        timezoneToggle: document.getElementById('timezone-toggle'),
        timezoneLabel: document.getElementById('timezone-label'),
        eventMeta: document.getElementById('event-meta'),
        eventIntro: document.getElementById('event-intro'),
        templateRoot: document.getElementById('schedule-abstract-templates'),
      });

      const toggleRoot = document.getElementById('timezone-toggle');
      if (toggleRoot) {
        toggleRoot.addEventListener('click', (event) => {
          const target = event.target.closest('[data-timezone-option]');
          if (!target) return;
          const mode = target.getAttribute('data-timezone-option');
          if (!mode || mode === this.renderer.displayTimeZone) return;
          this.renderer.setDisplayTimeZone(mode);
        });
      }

      const scheduleRoot = document.getElementById('schedule-root');
      if (scheduleRoot) {
        scheduleRoot.addEventListener('click', (event) => {
          const trigger =
            event.target instanceof Element
              ? event.target.closest('[data-schedule-abstract-trigger="true"]')
              : null;
          if (!(trigger instanceof HTMLButtonElement)) return;
          if (trigger.hasAttribute('data-track-modal-open')) return;

          event.preventDefault();
          event.stopPropagation();
          this.loadSubmissionAbstract(trigger);
        });
      }
    }

    findSubmissionAbstractTrigger(submissionId) {
      if (!this.renderer.root) return null;
      const buttons = this.renderer.root.querySelectorAll('[data-schedule-abstract-trigger="true"]');
      return (
        Array.from(buttons).find(
          (button) => button.getAttribute('data-schedule-submission-id') === submissionId,
        ) || null
      );
    }

    openTemporaryAbstract(trigger, text) {
      const templateId = this.renderer.modalManager.createAbstractTemplate({
        isSubmissionType: false,
        abstractText: text,
      });
      const wasDisabled = trigger.disabled;
      if (wasDisabled) trigger.disabled = false;
      trigger.setAttribute('data-track-modal-open', templateId);
      trigger.click();
      window.setTimeout(() => {
        trigger.removeAttribute('data-track-modal-open');
        if (wasDisabled) trigger.disabled = true;
      }, 0);
    }

    async loadSubmissionAbstract(trigger) {
      const submissionId = trigger.getAttribute('data-schedule-submission-id');
      if (!submissionId || trigger.getAttribute('data-schedule-loading') === 'true') return;

      trigger.setAttribute('data-schedule-loading', 'true');
      trigger.setAttribute('aria-busy', 'true');
      trigger.disabled = true;

      try {
        const detail = await this.client.fetchSubmission(submissionId);
        this.renderer.submissionDetails.set(submissionId, detail || null);

        if (this.renderer.scheduleCache) {
          this.renderer.render(this.renderer.scheduleCache);
          const updatedTrigger = this.findSubmissionAbstractTrigger(submissionId);
          if (updatedTrigger instanceof HTMLButtonElement) {
            updatedTrigger.click();
            return;
          }
        }

        this.openTemporaryAbstract(trigger, 'Abstract details are coming soon.');
      } catch (error) {
        console.error(error);
        this.openTemporaryAbstract(
          trigger,
          'We could not load this abstract right now. Please try again.',
        );
      } finally {
        trigger.removeAttribute('data-schedule-loading');
        trigger.removeAttribute('aria-busy');
        trigger.disabled = false;
      }
    }

    async init() {
      try {
        const data = await this.client.fetchEvent();
        this.renderer.setScheduleCache(data);
        this.renderer.render(data);
      } catch (error) {
        console.error(error);
        this.renderError();
      }
    }

    renderError() {
      const nav = document.getElementById('day-nav');
      const legend = document.getElementById('track-legend');
      const root = document.getElementById('schedule-root');

      if (nav) {
        nav.innerHTML = '';
        nav.appendChild(
          Dom.el(
            'span',
            'inline-flex items-center gap-2 px-5 py-2 rounded-full border border-red-300/30 text-red-200 text-sm font-semibold',
            'Unable to load day navigation',
          ),
        );
      }

      if (legend) {
        legend.innerHTML = '';
      }

      if (root) {
        root.innerHTML = '';
        const card = Dom.el('div', 'p-6 bg-red-500/10 border border-red-300/30 rounded-lg');
        card.appendChild(
          Dom.el(
            'p',
            'text-red-100 text-lg',
            'The live schedule is temporarily unavailable. Please check back shortly.',
          ),
        );
        root.appendChild(card);
      }
    }
  }

  const app = new AtAGlanceApp();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init(), { once: true });
  } else {
    app.init();
  }
})();
