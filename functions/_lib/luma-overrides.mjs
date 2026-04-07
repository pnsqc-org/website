function normalizeOverrideEntry(value) {
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

export function parseLumaOverrides(rawValue) {
  const normalized = String(rawValue ?? '').trim();
  if (!normalized) return {};

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Invalid MEETUP_LUMA_OVERRIDES_JSON value: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MEETUP_LUMA_OVERRIDES_JSON must be a JSON object keyed by Meetup event id');
  }

  const overrides = {};
  for (const [eventId, value] of Object.entries(parsed)) {
    const normalizedEntry = normalizeOverrideEntry(value);
    if (normalizedEntry) overrides[String(eventId)] = normalizedEntry;
  }

  return overrides;
}

export function getLumaOverrides(env) {
  return parseLumaOverrides(env?.MEETUP_LUMA_OVERRIDES_JSON);
}
