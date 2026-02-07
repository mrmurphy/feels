/**
 * ittybittybackup API client
 * @see https://ittybittybackups.mrmurphy.dev/docs
 */

const BASE_URL =
  (import.meta as unknown as { env?: { VITE_ITTYBITTY_BASE_URL?: string } }).env
    ?.VITE_ITTYBITTY_BASE_URL ?? 'https://ittybittybackups.mrmurphy.dev';

const APP_NAME = 'feels';
const BACKUP_NAME = 'backup';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

function fetchApi(path: string, options: ApiOptions = {}): Promise<Response> {
  const { body, ...rest } = options;
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };
  let initBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    initBody = JSON.stringify(body);
  }
  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers,
    body: initBody,
  });
}

// --- Auth (Passkeys) ---

export async function getRegisterOptions(username: string): Promise<unknown> {
  const res = await fetchApi('/auth/register/options', {
    method: 'POST',
    body: { username },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Register options failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyRegistration(
  username: string,
  attestation: unknown
): Promise<void> {
  const res = await fetchApi('/auth/register/verify', {
    method: 'POST',
    body: { username, attestation },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Register verify failed: ${res.status}`);
  }
}

export async function getLoginOptions(username: string): Promise<unknown> {
  const res = await fetchApi('/auth/login/options', {
    method: 'POST',
    body: { username },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login options failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyLogin(
  username: string,
  assertion: unknown
): Promise<void> {
  const res = await fetchApi('/auth/login/verify', {
    method: 'POST',
    body: { username, assertion },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login verify failed: ${res.status}`);
  }
}

/** Check if we have a valid session (cookie). Returns true if GET backup succeeds. */
export async function checkSession(): Promise<boolean> {
  const res = await fetchApi(`/${APP_NAME}/${BACKUP_NAME}`, { method: 'GET' });
  return res.ok || res.status === 404; // 404 = no backup yet but we're authenticated
}

/** Log out and invalidate the server session (cookie). No-op if server has no logout endpoint. */
export async function logout(): Promise<void> {
  try {
    await fetchApi('/auth/logout', { method: 'POST' });
  } catch {
    // Server may not have logout; we still clear local state
  }
}

// --- Backups ---

export async function getBackup(): Promise<unknown | null> {
  const res = await fetchApi(`/${APP_NAME}/${BACKUP_NAME}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Get backup failed: ${res.status}`);
  return res.json();
}

export async function putBackup(data: unknown): Promise<void> {
  const res = await fetchApi(`/${APP_NAME}/${BACKUP_NAME}`, {
    method: 'PUT',
    body: data,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Put backup failed: ${res.status}`);
  }
}
