const MEETUP_OAUTH_ENDPOINT = 'https://secure.meetup.com/oauth2/access';
const MEETUP_GRAPHQL_ENDPOINT = 'https://api.meetup.com/gql-ext';
const PKCS8_PEM_HEADER = '-----BEGIN PRIVATE KEY-----';
const PKCS8_PEM_FOOTER = '-----END PRIVATE KEY-----';
const PKCS1_PEM_HEADER = '-----BEGIN RSA PRIVATE KEY-----';
const PKCS1_PEM_FOOTER = '-----END RSA PRIVATE KEY-----';
const RSA_ALGORITHM_IDENTIFIER = new Uint8Array([
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
]);

const RECENT_EVENT_FIELDS = `
  id
  title
  eventUrl
  description
  dateTime
  endTime
  eventType
  howToFindUs
  featuredEventPhoto {
    id
    baseUrl
  }
  venue {
    name
    address
    city
    state
    venueType
  }
  venues {
    name
    address
    city
    state
    venueType
  }
`;

const RECENT_EVENTS_QUERY = `
  query HomeRecentEvents($urlname: String!, $limit: Int!) {
    groupByUrlname(urlname: $urlname) {
      upcomingEvents: events(first: $limit, sort: ASC, filter: { status: [ACTIVE] }) {
        edges {
          node {
            ${RECENT_EVENT_FIELDS}
          }
        }
      }
      pastEvents: events(first: $limit, sort: DESC, filter: { status: [PAST] }) {
        edges {
          node {
            ${RECENT_EVENT_FIELDS}
          }
        }
      }
    }
  }
`;

function ensureEnv(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`Missing required Meetup configuration: ${name}`);
  }
  return normalized;
}

function toBase64Url(input) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizePem(privateKeyPem) {
  return privateKeyPem.replace(/\\n/g, '\n').trim();
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function base64ToBytes(base64) {
  const normalizedBase64 = String(base64 ?? '').replace(/\s+/g, '');
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeDerLength(length) {
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`Invalid DER length: ${length}`);
  }

  if (length < 0x80) {
    return Uint8Array.of(length);
  }

  const octets = [];
  let remaining = length;

  while (remaining > 0) {
    octets.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 0x100);
  }

  return Uint8Array.from([0x80 | octets.length, ...octets]);
}

function concatBytes(...chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function encodeDer(tag, valueBytes) {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(valueBytes.length), valueBytes);
}

function wrapPkcs1InPkcs8(pkcs1Bytes) {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const privateKeyOctetString = encodeDer(0x04, pkcs1Bytes);

  return encodeDer(
    0x30,
    concatBytes(version, RSA_ALGORITHM_IDENTIFIER, privateKeyOctetString),
  );
}

function extractPemBody(normalizedPem, header, footer) {
  return normalizedPem.replace(header, '').replace(footer, '').replace(/\s+/g, '');
}

function pemToArrayBuffer(privateKeyPem) {
  const normalizedPem = normalizePem(privateKeyPem);

  if (normalizedPem.includes(PKCS8_PEM_HEADER) && normalizedPem.includes(PKCS8_PEM_FOOTER)) {
    return toArrayBuffer(
      base64ToBytes(extractPemBody(normalizedPem, PKCS8_PEM_HEADER, PKCS8_PEM_FOOTER)),
    );
  }

  if (normalizedPem.includes(PKCS1_PEM_HEADER) && normalizedPem.includes(PKCS1_PEM_FOOTER)) {
    return toArrayBuffer(
      wrapPkcs1InPkcs8(
        base64ToBytes(extractPemBody(normalizedPem, PKCS1_PEM_HEADER, PKCS1_PEM_FOOTER)),
      ),
    );
  }

  throw new Error(
    'Unsupported Meetup signing key format. Use a PEM-encoded PRIVATE KEY or RSA PRIVATE KEY.',
  );
}

async function importPrivateKey(privateKeyPem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
}

export async function buildMeetupJwt({
  clientId,
  memberId,
  signingKeyId,
  privateKeyPem,
  now = Date.now(),
}) {
  const header = {
    alg: 'RS256',
    kid: signingKeyId,
    typ: 'JWT',
  };

  const issuedAt = Math.floor(now / 1000);
  const payload = {
    aud: 'api.meetup.com',
    exp: issuedAt + 120,
    iat: issuedAt,
    iss: clientId,
    sub: memberId,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

export async function fetchMeetupAccessToken(env, fetchImpl = fetch) {
  const clientId = ensureEnv('MEETUP_CLIENT_ID', env.MEETUP_CLIENT_ID);
  const memberId = ensureEnv('MEETUP_MEMBER_ID', env.MEETUP_MEMBER_ID);
  const signingKeyId = ensureEnv('MEETUP_SIGNING_KEY_ID', env.MEETUP_SIGNING_KEY_ID);
  const privateKeyPem = ensureEnv('MEETUP_SIGNING_KEY_PEM', env.MEETUP_SIGNING_KEY_PEM);

  const assertion = await buildMeetupJwt({
    clientId,
    memberId,
    signingKeyId,
    privateKeyPem,
  });

  const tokenResponse = await fetchImpl(MEETUP_OAUTH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Meetup OAuth token request failed with ${tokenResponse.status}: ${await tokenResponse.text()}`,
    );
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = String(tokenPayload?.access_token ?? '').trim();

  if (!accessToken) {
    throw new Error('Meetup OAuth response did not include an access token');
  }

  return accessToken;
}

function edgesToNodes(connection) {
  return Array.isArray(connection?.edges)
    ? connection.edges.map((edge) => edge?.node).filter(Boolean)
    : [];
}

export async function fetchMeetupRecentEvents(env, fetchImpl = fetch, limit = 5) {
  const accessToken = await fetchMeetupAccessToken(env, fetchImpl);
  const groupUrlname = ensureEnv('MEETUP_GROUP_URLNAME', env.MEETUP_GROUP_URLNAME);

  const graphqlResponse = await fetchImpl(MEETUP_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: RECENT_EVENTS_QUERY,
      variables: {
        limit,
        urlname: groupUrlname,
      },
    }),
  });

  if (!graphqlResponse.ok) {
    throw new Error(
      `Meetup GraphQL request failed with ${graphqlResponse.status}: ${await graphqlResponse.text()}`,
    );
  }

  const graphqlPayload = await graphqlResponse.json();
  if (Array.isArray(graphqlPayload?.errors) && graphqlPayload.errors.length > 0) {
    const messages = graphqlPayload.errors
      .map((error) => String(error?.message ?? '').trim())
      .filter(Boolean)
      .join('; ');
    throw new Error(`Meetup GraphQL returned errors: ${messages || 'Unknown error'}`);
  }

  const group = graphqlPayload?.data?.groupByUrlname;
  if (!group) {
    throw new Error(`Meetup group "${groupUrlname}" was not found`);
  }

  return {
    groupUrlname,
    pastEvents: edgesToNodes(group.pastEvents),
    upcomingEvents: edgesToNodes(group.upcomingEvents),
  };
}
