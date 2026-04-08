function normalizeMapEntry(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { lumaUrl: trimmed } : null;
  }

  if (value && typeof value === 'object') {
    const trimmed = String(value.lumaUrl ?? '').trim();
    return trimmed ? { lumaUrl: trimmed } : null;
  }

  return null;
}

export function parseLumaMap(rawValue) {
  const normalized = String(rawValue ?? '').trim();
  if (!normalized) return {};

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Invalid MEETUP_LUMA_MAP_JSON value: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MEETUP_LUMA_MAP_JSON must be a JSON object keyed by Meetup event ID');
  }

  const map = {};
  for (const [eventId, value] of Object.entries(parsed)) {
    const normalizedEntry = normalizeMapEntry(value);
    if (normalizedEntry) map[String(eventId)] = normalizedEntry;
  }

  return map;
}

export function getLumaMap(env) {
  return parseLumaMap(env?.MEETUP_LUMA_MAP_JSON);
}
