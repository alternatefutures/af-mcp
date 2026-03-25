import { CONFIG, requireToken } from './config.js';

// ---------------------------------------------------------------------------
// GraphQL client (talks to service-cloud-api)
// ---------------------------------------------------------------------------

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = requireToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (CONFIG.organizationId) {
    headers['X-Organization-Id'] = CONFIG.organizationId;
  }

  const res = await fetch(`${CONFIG.cloudApiUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(
      `GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`,
    );
  }

  if (!json.data) {
    throw new Error('GraphQL response missing data');
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// REST client (talks to service-auth)
// ---------------------------------------------------------------------------

export async function authFetch<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const token = requireToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (CONFIG.organizationId) {
    headers['X-Organization-Id'] = CONFIG.organizationId;
  }

  const res = await fetch(`${CONFIG.authApiUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers,
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Auth API ${path} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}
