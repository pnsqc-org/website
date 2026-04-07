import { getLumaOverrides } from './_lib/luma-overrides.mjs';
import { fetchMeetupRecentEvents } from './_lib/meetup-api.mjs';
import {
  EVENT_LIMIT,
  normalizeMeetupEvent,
  renderErrorStateCard,
  renderRecentEventsMarkup,
  selectRecentEvents,
} from './_lib/recent-events.mjs';

const DEFAULT_CACHE_TTL_SECONDS = 120;
const TRACK_SELECTOR = '#recent-events [data-carousel-track]';

function isHtmlResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('text/html');
}

function getCacheTtlSeconds(env) {
  const value = Number.parseInt(String(env.RECENT_EVENTS_CACHE_TTL_SECONDS ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CACHE_TTL_SECONDS;
}

function buildCacheKey(requestUrl, groupUrlname) {
  const cacheUrl = new URL('/__recent-events-cache__', requestUrl);
  cacheUrl.searchParams.set('group', groupUrlname);
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

async function buildRecentEventsMarkup(env) {
  const payload = await fetchMeetupRecentEvents(env, fetch, EVENT_LIMIT);
  const lumaOverrides = getLumaOverrides(env);
  const selectedEvents = selectRecentEvents({
    upcomingEvents: payload.upcomingEvents,
    pastEvents: payload.pastEvents,
  });

  const normalizedEvents = selectedEvents.map((event) =>
    normalizeMeetupEvent(event, lumaOverrides[String(event?.id ?? '')]),
  );

  return renderRecentEventsMarkup(normalizedEvents, payload.groupUrlname);
}

async function getRecentEventsMarkup(context) {
  const groupUrlname = String(context.env.MEETUP_GROUP_URLNAME ?? '').trim();
  const cacheRequest = buildCacheKey(context.request.url, groupUrlname);
  const cachedResponse = await caches.default.match(cacheRequest);

  if (cachedResponse) {
    return cachedResponse.text();
  }

  const markup = await buildRecentEventsMarkup(context.env);
  const ttlSeconds = getCacheTtlSeconds(context.env);
  const cacheResponse = new Response(markup, {
    headers: {
      'Cache-Control': `public, max-age=${ttlSeconds}`,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });

  context.waitUntil(caches.default.put(cacheRequest, cacheResponse.clone()));

  return markup;
}

class RecentEventsTrackRewriter {
  constructor(markup) {
    this.markup = markup;
  }

  element(element) {
    element.setInnerContent(this.markup, { html: true });
    element.removeAttribute('data-recent-events-state');
    element.setAttribute('data-recent-events-state', 'ready');
  }
}

export async function onRequest(context) {
  const staticResponse = await context.next();
  if (!isHtmlResponse(staticResponse)) return staticResponse;

  let markup;
  try {
    markup = await getRecentEventsMarkup(context);
  } catch (error) {
    console.error('Failed to load recent Meetup events', error);
    markup = renderErrorStateCard(context.env.MEETUP_GROUP_URLNAME);
  }

  const rewrittenResponse = new HTMLRewriter()
    .on(TRACK_SELECTOR, new RecentEventsTrackRewriter(markup))
    .transform(staticResponse);

  rewrittenResponse.headers.set('Cache-Control', 'no-store');

  return rewrittenResponse;
}
