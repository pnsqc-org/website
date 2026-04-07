import { marked } from 'marked';

export const EVENT_LIMIT = 5;
export const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

const SAFE_HREF_PATTERN = /^(https?:|mailto:)/i;
const ALLOWED_DESCRIPTION_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
]);
const MARKDOWN_DESCRIPTION_OPTIONS = Object.freeze({
  async: false,
  breaks: true,
  gfm: true,
});

const CALENDAR_ICON = `
  <svg
    class="w-4 h-4 mt-0.5 text-pnsqc-cyan"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
`;

const LOCATION_GLOBE_ICON = `
  <svg
    class="w-4 h-4 mt-0.5 text-pnsqc-cyan"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
    />
  </svg>
`;

const LOCATION_PIN_ICON = `
  <svg
    class="w-4 h-4 mt-0.5 text-pnsqc-cyan"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
`;

const RSVP_ICON = `
  <svg
    class="w-4 h-4 text-pnsqc-cyan"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
`;

const PAST_BADGE_ICON = `
  <svg
    class="w-3.5 h-3.5 text-pnsqc-gold"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
`;

const UPCOMING_BADGE_ICON = `
  <svg
    class="w-3.5 h-3.5 text-pnsqc-gold"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
`;

const MEETUP_EVENT_IMAGE_SIZE = '676x380.webp';
const STATUS_BADGE_BASE_CLASSES =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasMeaningfulHtml(value) {
  const plainText = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.length > 0;
}

function isSafeHref(value) {
  return SAFE_HREF_PATTERN.test(value);
}

function sanitizeExternalUrl(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed && isSafeHref(trimmed) ? trimmed : '';
}

function buildEventImageUrl(photoInfo) {
  const baseUrl = sanitizeExternalUrl(photoInfo?.baseUrl);
  const photoId = String(photoInfo?.id ?? '').trim();
  if (!baseUrl || !/^\d+$/.test(photoId)) return '';

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}${photoId}/${MEETUP_EVENT_IMAGE_SIZE}`;
}

function getEventImageAlt(title) {
  const safeTitle = String(title ?? '').trim() || 'PNSQC Meetup event';
  return `Meetup event photo for ${safeTitle}`;
}

function sanitizeHref(rawAttributes) {
  const hrefMatch = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
  const trimmed = href.trim();
  if (!trimmed || !isSafeHref(trimmed)) return null;
  return trimmed;
}

function sanitizeTag(rawTag) {
  const tagMatch = rawTag.match(/^<\s*(\/)?\s*([a-z0-9]+)([^>]*)>/i);
  if (!tagMatch) return '';

  const [, closingSlash, rawName, rawAttributes] = tagMatch;
  const name = rawName.toLowerCase();
  const isClosingTag = Boolean(closingSlash);

  if (!ALLOWED_DESCRIPTION_TAGS.has(name)) return '';
  if (name === 'br' || name === 'hr') return isClosingTag ? '' : `<${name} />`;
  if (isClosingTag) return `</${name}>`;

  if (name === 'a') {
    const href = sanitizeHref(rawAttributes);
    if (!href) return '';
    return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
  }

  return `<${name}>`;
}

function renderMarkdownDescription(value) {
  const markdown = String(value ?? '').trim();
  if (!markdown) return '';

  try {
    const rendered = marked.parse(markdown, MARKDOWN_DESCRIPTION_OPTIONS);
    return typeof rendered === 'string' ? rendered : '';
  } catch {
    return markdown;
  }
}

function finalizeDescriptionHtml(value) {
  const rendered = renderMarkdownDescription(value);
  const sanitized = sanitizeDescriptionHtml(rendered).trim();
  if (!hasMeaningfulHtml(sanitized)) return '';
  if (!/<[a-z][\s/>]/i.test(sanitized)) return `<p>${sanitized}</p>`;
  return sanitized;
}

function getDescriptionHtml(event) {
  const primary = finalizeDescriptionHtml(event?.description);
  if (primary) return primary;

  const fallback = finalizeDescriptionHtml(event?.shortDescription);
  if (fallback) return fallback;

  return '<p>No description available.</p>';
}

function getCityState(venue) {
  const city = String(venue?.city ?? '').trim();
  const state = String(venue?.state ?? '').trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || '';
}

function getEventType(event) {
  return String(event?.eventType ?? '')
    .trim()
    .toUpperCase();
}

function isOnlineVenue(venue) {
  return (
    String(venue?.venueType ?? '')
      .trim()
      .toLowerCase() === 'online'
  );
}

function getEventVenues(event) {
  const venues = Array.isArray(event?.venues) ? event.venues.filter(Boolean) : [];
  if (venues.length > 0) return venues;
  return event?.venue ? [event.venue] : [];
}

function buildInPersonVenueParts(venue) {
  if (!venue) return { cityState: '', heading: '' };
  const heading = [venue.name, venue.address]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const cityState = getCityState(venue);
  return { cityState, heading };
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

function getOnlinePlatformLabel(value) {
  if (!looksLikeUrl(value)) return '';

  let hostname = '';
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }

  if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) return 'Zoom';
  if (hostname === 'meet.google.com') return 'Google Meet';
  if (hostname === 'teams.microsoft.com') return 'Microsoft Teams';
  if (hostname.endsWith('.webex.com') || hostname === 'webex.com') return 'Webex';
  if (hostname.endsWith('.gotomeeting.com') || hostname === 'gotomeeting.com')
    return 'GoTo Meeting';

  return '';
}

function getHowToFindUsHint(event, venue) {
  return String(event?.howToFindUs ?? venue?.eventVenueOptions?.howToFindUs ?? '').trim();
}

function buildOnlineVenueLabel(event, venue) {
  const name = String(venue?.name ?? '').trim();
  if (name && !/^online\b/i.test(name)) return name;

  const hint = getHowToFindUsHint(event, venue);
  const platform = getOnlinePlatformLabel(hint);
  if (platform) return platform;

  if (hint && !looksLikeUrl(hint)) return hint;
  if (name) return name;

  return 'Online';
}

function renderLocationIcon(venueLine) {
  return /^Virtual event/i.test(venueLine) || /^Hybrid event/i.test(venueLine)
    ? LOCATION_GLOBE_ICON
    : LOCATION_PIN_ICON;
}

function renderRsvpLinks(event) {
  const links = [];

  if (event.meetupUrl) {
    links.push(`
      <a
        href="${escapeAttribute(event.meetupUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        aria-label="RSVP on Meetup"
        title="RSVP on Meetup"
      >
        <img
          src="/images/brand/meetup.svg"
          alt="Meetup Signup"
          aria-hidden="true"
          class="w-5 h-5"
          decoding="async"
        />
      </a>
    `);
  }

  if (event.lumaUrl) {
    links.push(`
      <a
        href="${escapeAttribute(event.lumaUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        aria-label="RSVP on Luma"
        title="RSVP on Luma"
      >
        <img
          src="/images/brand/luma.png"
          alt="Luma Signup"
          aria-hidden="true"
          class="w-5 h-5"
          decoding="async"
        />
      </a>
    `);
  }

  return links.join('');
}

function renderStaticStatusBadge(label, variant = 'neutral') {
  const variantClasses =
    variant === 'past'
      ? 'border-white/15 bg-black/25 text-white/90'
      : variant === 'upcoming'
        ? 'border-pnsqc-gold/35 bg-pnsqc-gold/10 text-pnsqc-gold-light'
        : 'border-white/10 bg-white/5 text-white/75';
  const icon = variant === 'past' ? PAST_BADGE_ICON : variant === 'upcoming' ? UPCOMING_BADGE_ICON : '';

  return `
    <span class="${STATUS_BADGE_BASE_CLASSES} ${variantClasses}">
      ${icon}
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderEventStateBadges() {
  return `
    <div class="mt-1 shrink-0">
      <span
        class="${STATUS_BADGE_BASE_CLASSES} border-pnsqc-gold/35 bg-pnsqc-gold/10 text-pnsqc-gold-light"
        data-event-upcoming-badge
      >
        ${UPCOMING_BADGE_ICON}
        <span>Upcoming Event</span>
      </span>
      <span
        class="${STATUS_BADGE_BASE_CLASSES} border-white/15 bg-black/25 text-white/90"
        hidden
        data-event-past-badge
      >
        ${PAST_BADGE_ICON}
        <span>Past Event</span>
      </span>
    </div>
  `;
}

export function getMeetupGroupUrl(groupUrlname) {
  const normalized = String(groupUrlname ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'https://www.meetup.com/';
  return `https://www.meetup.com/${encodeURIComponent(normalized)}/`;
}

export function selectRecentEvents({
  upcomingEvents = [],
  pastEvents = [],
  limit = EVENT_LIMIT,
} = {}) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : EVENT_LIMIT;

  const sortedUpcoming = [...upcomingEvents].sort((left, right) => {
    return (
      (parseDate(left?.dateTime)?.getTime() ?? Number.POSITIVE_INFINITY) -
      (parseDate(right?.dateTime)?.getTime() ?? Number.POSITIVE_INFINITY)
    );
  });

  const sortedPast = [...pastEvents].sort((left, right) => {
    return (
      (parseDate(right?.dateTime)?.getTime() ?? Number.NEGATIVE_INFINITY) -
      (parseDate(left?.dateTime)?.getTime() ?? Number.NEGATIVE_INFINITY)
    );
  });

  const selectedUpcoming = sortedUpcoming.slice(0, safeLimit);
  const remainingSlots = Math.max(0, safeLimit - selectedUpcoming.length);
  const selectedPast = sortedPast.slice(0, remainingSlots);

  return [...selectedUpcoming, ...selectedPast];
}

export function sanitizeDescriptionHtml(input) {
  const rawHtml = String(input ?? '').trim();
  if (!rawHtml) return '';

  const withoutComments = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
  const withoutDangerousBlocks = withoutComments.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );

  return withoutDangerousBlocks.replace(/<[^>]+>/g, sanitizeTag);
}

export function formatEventDateLine(startIso, endIso, timeZone = PACIFIC_TIME_ZONE) {
  const startDate = parseDate(startIso);
  const endDate = parseDate(endIso) ?? startDate;
  if (!startDate || !endDate) return 'Date to be announced';

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone,
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  const zoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  });

  const zoneName =
    zoneFormatter.formatToParts(endDate).find((part) => part.type === 'timeZoneName')?.value ?? '';

  return `${escapeHtml(dateFormatter.format(startDate))} &middot; ${escapeHtml(
    timeFormatter.format(startDate),
  )} to ${escapeHtml(timeFormatter.format(endDate))} ${escapeHtml(zoneName)}`.trim();
}

export function formatVenueLine(event) {
  const venues = getEventVenues(event);
  const eventType = getEventType(event);
  const onlineVenues = venues.filter(isOnlineVenue);
  const inPersonVenues = venues.filter((venue) => !isOnlineVenue(venue));

  const inPersonVenue = buildInPersonVenueParts(inPersonVenues[0]);
  const inPersonLabel =
    inPersonVenue.heading && inPersonVenue.cityState
      ? `${escapeHtml(inPersonVenue.heading)} &middot; ${escapeHtml(inPersonVenue.cityState)}`
      : escapeHtml(inPersonVenue.heading || inPersonVenue.cityState);
  const onlineLabel = buildOnlineVenueLabel(event, onlineVenues[0]);

  if (inPersonLabel && (onlineVenues.length > 0 || eventType === 'HYBRID')) {
    return `Hybrid event &middot; ${inPersonLabel} + online`;
  }

  if (onlineVenues.length > 0 || event?.isOnline || eventType === 'ONLINE') {
    return `Virtual event &middot; ${escapeHtml(onlineLabel)}`;
  }

  if (inPersonLabel) return inPersonLabel;

  return 'Location to be announced';
}

export function normalizeMeetupEvent(event, override = {}) {
  const title = String(event?.title ?? 'Untitled event').trim() || 'Untitled event';

  return {
    id: String(event?.id ?? '').trim(),
    title,
    startIso: String(event?.dateTime ?? '').trim(),
    endIso: String(event?.endTime ?? event?.dateTime ?? '').trim(),
    meetupUrl: sanitizeExternalUrl(event?.eventUrl),
    lumaUrl: sanitizeExternalUrl(override?.lumaUrl) || null,
    dateLine: formatEventDateLine(event?.dateTime, event?.endTime),
    venueLine: formatVenueLine(event),
    descriptionHtml: getDescriptionHtml(event),
    imageUrl: buildEventImageUrl(event?.featuredEventPhoto),
    imageAlt: getEventImageAlt(title),
  };
}

export function renderRecentEventCard(event) {
  return `
    <article
      class="recent-event-card snap-start shrink-0 w-full rounded-xl bg-pnsqc-navy/90 border border-pnsqc-gold/30 p-6 hover:border-pnsqc-gold/50 transition-colors glow-gold"
      data-carousel-slide
      data-event-start="${escapeAttribute(event.startIso)}"
      data-event-end="${escapeAttribute(event.endIso)}"
      data-event-image-url="${escapeAttribute(event.imageUrl)}"
      data-event-image-alt="${escapeAttribute(event.imageAlt)}"
    >
      <div class="flex items-start justify-between mb-4 gap-4">
        <h3 class="text-lg font-bold text-white leading-snug" data-event-title>
          ${escapeHtml(event.title)}
        </h3>
        ${renderEventStateBadges()}
      </div>

      <div class="space-y-2 text-sm text-pnsqc-slate" data-event-modal-meta>
        <div class="flex items-start gap-2">
          ${CALENDAR_ICON}
          <p>${event.dateLine}</p>
        </div>
        <div class="flex items-start gap-2">
          ${renderLocationIcon(event.venueLine)}
          <p>${event.venueLine}</p>
        </div>
        <div class="flex items-center gap-2">
          ${RSVP_ICON}
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/70 font-medium">RSVP:</span>
            ${renderRsvpLinks(event)}
          </div>
        </div>
      </div>

      <div class="recent-event-description-panel mt-5 rounded-lg bg-white/5 border border-white/10 p-4">
        <div class="mb-3 flex items-start justify-between gap-3">
          <p class="text-xs text-white/80 font-semibold uppercase tracking-wider">Event Description</p>
          <button
            type="button"
            class="recent-event-description-open inline-flex items-center justify-center rounded-full border border-pnsqc-gold/35 bg-white/5 px-3 py-1.5 text-xs font-semibold text-pnsqc-gold transition-colors hover:border-pnsqc-gold/60 hover:bg-white/10 hover:text-pnsqc-gold-light focus:outline-none focus:ring-2 focus:ring-pnsqc-gold/30"
            aria-controls="recent-events-description-modal"
            aria-haspopup="dialog"
            data-event-description-open
          >
            Show Details
          </button>
        </div>
        <div class="recent-event-description-viewport" data-event-description-preview>
          <div
            class="recent-event-description recent-event-description--preview text-sm leading-6 text-pnsqc-slate"
            data-event-description-preview-content
          ></div>
        </div>
        <div class="recent-event-description hidden" hidden data-event-description-content>${event.descriptionHtml}</div>
      </div>
    </article>
  `.trim();
}

export function renderEmptyStateCard(groupUrlname) {
  const groupUrl = getMeetupGroupUrl(groupUrlname);

  return `
    <article
      class="recent-event-card snap-start shrink-0 w-full rounded-xl bg-pnsqc-navy/90 border border-pnsqc-gold/30 p-6 transition-colors glow-gold"
      data-carousel-slide
    >
      <div class="flex items-start justify-between mb-4 gap-4">
        <h3 class="text-lg font-bold text-white leading-snug">No recent Meetup events found</h3>
        ${renderStaticStatusBadge('No Recent Events')}
      </div>

      <div class="space-y-3 text-sm text-pnsqc-slate">
        <p>We could not find any recent or upcoming Meetup events to show right now.</p>
        <p>
          Visit our
          <a href="${escapeAttribute(groupUrl)}" target="_blank" rel="noopener noreferrer" class="inline-text-link">Meetup group</a>
          directly for the latest event details.
        </p>
      </div>
    </article>
  `.trim();
}

export function renderErrorStateCard(groupUrlname) {
  const groupUrl = getMeetupGroupUrl(groupUrlname);

  return `
    <article
      class="recent-event-card snap-start shrink-0 w-full rounded-xl bg-pnsqc-navy/90 border border-pnsqc-gold/30 p-6 transition-colors glow-gold"
      data-carousel-slide
    >
      <div class="flex items-start justify-between mb-4 gap-4">
        <h3 class="text-lg font-bold text-white leading-snug">
          Recent events are temporarily unavailable
        </h3>
        ${renderStaticStatusBadge('Events Unavailable')}
      </div>

      <div class="space-y-3 text-sm text-pnsqc-slate">
        <p>We ran into a problem loading the latest Meetup events.</p>
        <p>
          Please check our
          <a href="${escapeAttribute(groupUrl)}" target="_blank" rel="noopener noreferrer" class="inline-text-link">Meetup group</a>
          directly for the latest event details.
        </p>
      </div>
    </article>
  `.trim();
}

export function renderRecentEventsMarkup(events, groupUrlname) {
  if (!Array.isArray(events) || events.length === 0) {
    return renderEmptyStateCard(groupUrlname);
  }

  return events.map((event) => renderRecentEventCard(event)).join('\n');
}
