const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/spreadsheets openid profile email';
const GOOGLE_SESSION_STORAGE_KEY = 'google_session';
const GOOGLE_OAUTH_STATE_STORAGE_KEY = 'google_oauth_state';
const GOOGLE_OAUTH_START_PARAM = 'google_sign_in';
const DEVELOPMENT_ACCESS_TOKEN = 'development-access-token';
const GOOGLE_AUTH_TIMEOUT_MS = 10_000;
const GOOGLE_SESSION_REVALIDATE_MS = 5 * 60_000;
const ALLOWED_GOOGLE_EMAIL_DOMAIN = 'acmucsd.org';
const ALLOWED_GOOGLE_EMAIL_SUFFIX = `@${ALLOWED_GOOGLE_EMAIL_DOMAIN}`;
const DEFAULT_PRODUCTION_GOOGLE_REDIRECT_URI =
  'https://acm-projects-app-review.vercel.app';

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
}

export interface GoogleSession {
  accessToken: string;
  profile: GoogleProfile;
}

let googleRedirectCompletionPromise: Promise<GoogleSession | null> | null = null;
let currentSession: GoogleSession | null = null;
let lastSessionValidationAt = 0;

interface GoogleApiErrorPayload {
  error?: {
    message?: string;
  };
}

interface GoogleSheetsValuesResponse extends GoogleApiErrorPayload {
  values?: string[][];
}

export function isDevelopmentAuthEnabled(): boolean {
  return import.meta.env.DEV;
}

function isDevelopmentSession(session: GoogleSession | null): boolean {
  return session?.accessToken === DEVELOPMENT_ACCESS_TOKEN;
}

function isAllowedGoogleProfile(profile: GoogleProfile): boolean {
  return profile.email.toLowerCase().endsWith(ALLOWED_GOOGLE_EMAIL_SUFFIX);
}

function assertAllowedGoogleProfile(profile: GoogleProfile) {
  if (!isAllowedGoogleProfile(profile)) {
    throw new Error(
      `Access is restricted to ${ALLOWED_GOOGLE_EMAIL_SUFFIX} Google accounts.`,
    );
  }
}

function getGoogleClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID');
  }

  return clientId;
}

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  return window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : window.location.origin;
}

function getGoogleRedirectUri(): string {
  const configuredRedirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI?.trim();

  if (configuredRedirectUri) {
    return configuredRedirectUri;
  }

  return window.location.hostname === 'localhost'
    ? window.location.origin
    : DEFAULT_PRODUCTION_GOOGLE_REDIRECT_URI;
}

export function hasGoogleSignInStartRequest(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get(GOOGLE_OAUTH_START_PARAM) === '1';
}

function consumeGoogleSignInStartRequest(): boolean {
  if (!hasGoogleSignInStartRequest()) {
    return false;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete(GOOGLE_OAUTH_START_PARAM);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);

  return true;
}

function getCanonicalGoogleSignInStartUrl(): string {
  const url = new URL(getGoogleRedirectUri());
  url.pathname = window.location.pathname;
  url.hash = window.location.hash;
  url.searchParams.set(GOOGLE_OAUTH_START_PARAM, '1');
  return url.toString();
}

function setStoredSession(session: GoogleSession | null) {
  currentSession = session;
  lastSessionValidationAt = session ? Date.now() : 0;

  if (session) {
    localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
  }
}

function getStoredSession(): GoogleSession | null {
  if (currentSession) {
    return currentSession;
  }

  const rawSession = localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as GoogleSession;
    currentSession = parsedSession;
    return parsedSession;
  } catch {
    localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
    return null;
  }
}

export function hasStoredGoogleSession(): boolean {
  return Boolean(getStoredSession());
}

export function getStoredGoogleProfile(): GoogleProfile | null {
  return getStoredSession()?.profile ?? null;
}

export function getStoredGoogleAccessToken(): string | null {
  return getStoredSession()?.accessToken ?? null;
}

function setStoredState(state: string | null) {
  if (state) {
    sessionStorage.setItem(GOOGLE_OAUTH_STATE_STORAGE_KEY, state);
  } else {
    sessionStorage.removeItem(GOOGLE_OAUTH_STATE_STORAGE_KEY);
  }
}

function getStoredState(): string | null {
  return sessionStorage.getItem(GOOGLE_OAUTH_STATE_STORAGE_KEY);
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, GOOGLE_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Failed to load Google profile.');
    }

    const data = (await response.json()) as GoogleUserInfo;

    return {
      email: data.email ?? '',
      name: data.name ?? '',
      picture: data.picture ?? '',
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Google profile request timed out.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function createMockSheetRows(): string[][] {
  const headers = Array.from({ length: 60 }, (_, index) => `Question ${index + 1}`);
  headers[2] = 'Applicant Name';
  headers[13] = 'First Priority';
  headers[14] = 'Second Priority';
  headers[15] = 'Third Priority';
  headers[16] = 'Fourth Priority';
  headers[headers.length - 1] = 'Reviewer Comments';

  const row = Array.from({ length: 60 }, (_, index) => `Sample response ${index + 1}`);
  row[2] = 'Test Applicant';
  row[13] = 'AI';
  row[14] = 'Design';
  row[15] = 'Hack';
  row[16] = 'Game Dev';
  row[row.length - 1] = '';

  const secondRow = Array.from(
    { length: 60 },
    (_, index) => `Second fake application response ${index + 1}`,
  );
  secondRow[2] = 'Second Test Applicant';
  secondRow[13] = 'Design';
  secondRow[14] = 'Hack';
  secondRow[15] = 'AI';
  secondRow[16] = 'Game Dev';
  secondRow[secondRow.length - 1] = '';

  return [headers, row, secondRow];
}

let mockSheetRows: string[][] | null = null;

function getMockSheetRows(): string[][] {
  mockSheetRows ??= createMockSheetRows();
  return mockSheetRows;
}

function getMockColumnIndex(columnLetters: string): number {
  return columnLetters
    .toUpperCase()
    .split('')
    .reduce((current, character) => current * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function parseMockRange(range: string, rows: string[][]) {
  const rangePart = range.split('!').pop() ?? range;
  const singleCellMatch = /^([A-Z]+)(\d+)$/i.exec(rangePart);
  if (singleCellMatch) {
    const rowIndex = Number(singleCellMatch[2]) - 1;
    const columnIndex = getMockColumnIndex(singleCellMatch[1]);

    return {
      endColumnIndex: columnIndex + 1,
      endRowIndex: rowIndex + 1,
      startColumnIndex: columnIndex,
      startRowIndex: rowIndex,
    };
  }

  const rowRangeMatch = /^(\d+):(\d+)$/i.exec(rangePart);
  if (rowRangeMatch) {
    return {
      endColumnIndex: Math.max(...rows.map((row) => row.length)),
      endRowIndex: Number(rowRangeMatch[2]),
      startColumnIndex: 0,
      startRowIndex: Number(rowRangeMatch[1]) - 1,
    };
  }

  const columnRangeMatch = /^([A-Z]+)(\d+):([A-Z]+)(\d+)?$/i.exec(rangePart);
  if (columnRangeMatch) {
    const startRowIndex = Number(columnRangeMatch[2]) - 1;
    const endRowIndex = columnRangeMatch[4]
      ? Number(columnRangeMatch[4])
      : rows.length;

    return {
      endColumnIndex: getMockColumnIndex(columnRangeMatch[3]) + 1,
      endRowIndex,
      startColumnIndex: getMockColumnIndex(columnRangeMatch[1]),
      startRowIndex,
    };
  }

  return {
    endColumnIndex: Math.max(...rows.map((row) => row.length)),
    endRowIndex: rows.length,
    startColumnIndex: 0,
    startRowIndex: 0,
  };
}

function createMockGoogleApiClient(): GoogleApi {
  return {
    load: (_libraries, callback) => callback(),
    client: {
      init: async () => undefined,
      load: async () => undefined,
      setToken: () => undefined,
      sheets: {
        spreadsheets: {
          values: {
            get: async ({ range }) => {
              const rows = getMockSheetRows();
              const parsedRange = parseMockRange(range, rows);
              const values = rows
                .slice(parsedRange.startRowIndex, parsedRange.endRowIndex)
                .map((row) =>
                  row.slice(
                    parsedRange.startColumnIndex,
                    parsedRange.endColumnIndex,
                  ),
                );

              return {
                result: {
                  values,
                },
              };
            },
            update: async ({ range, resource }) => {
              const rows = getMockSheetRows();
              const parsedRange = parseMockRange(range, rows);

              resource.values.forEach((valueRow, rowOffset) => {
                const rowIndex = parsedRange.startRowIndex + rowOffset;
                rows[rowIndex] ??= [];

                valueRow.forEach((value, columnOffset) => {
                  rows[rowIndex][parsedRange.startColumnIndex + columnOffset] =
                    value;
                });
              });
            },
          },
        },
      },
    },
  };
}

async function readGoogleApiJson<T extends GoogleApiErrorPayload>(
  response: Response,
  fallbackErrorMessage: string,
): Promise<T> {
  const parsedData = (await response.json().catch(() => ({}))) as unknown;
  const data = (
    typeof parsedData === 'object' && parsedData !== null ? parsedData : {}
  ) as T;

  if (!response.ok) {
    throw new Error(data.error?.message ?? fallbackErrorMessage);
  }

  return data;
}

function buildSheetsValuesUrl(spreadsheetId: string, range: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values/${encodeURIComponent(range)}`;
}

function createSheetsRestApiClient(session: GoogleSession): GoogleApi {
  const authorizationHeaders = {
    Authorization: `Bearer ${session.accessToken}`,
  };

  return {
    load: (_libraries, callback) => callback(),
    client: {
      init: async () => undefined,
      load: async () => undefined,
      setToken: () => undefined,
      sheets: {
        spreadsheets: {
          values: {
            get: async ({ spreadsheetId, range }) => {
              const data = await readGoogleApiJson<GoogleSheetsValuesResponse>(
                await fetch(buildSheetsValuesUrl(spreadsheetId, range), {
                  headers: authorizationHeaders,
                }),
                'Failed to load Google Sheets data.',
              );

              return {
                result: {
                  values: data.values,
                },
              };
            },
            update: async ({
              spreadsheetId,
              range,
              valueInputOption,
              resource,
            }) => {
              const url = new URL(buildSheetsValuesUrl(spreadsheetId, range));
              url.searchParams.set('valueInputOption', valueInputOption);

              return readGoogleApiJson<GoogleApiErrorPayload>(
                await fetch(url.toString(), {
                  method: 'PUT',
                  headers: {
                    ...authorizationHeaders,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    values: resource.values,
                  }),
                }),
                'Failed to update Google Sheets data.',
              );
            },
          },
        },
      },
    },
  };
}

function clearGoogleAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('scope');
  url.searchParams.delete('authuser');
  url.searchParams.delete('prompt');
  url.searchParams.delete('error');
  url.searchParams.delete('iss');
  url.searchParams.delete('hd');
  url.searchParams.delete(GOOGLE_OAUTH_START_PARAM);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function buildGoogleAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'online',
    hd: ALLOWED_GOOGLE_EMAIL_DOMAIN,
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function redirectToGoogleSignIn(): Promise<void> {
  const redirectUri = getGoogleRedirectUri();
  if (new URL(redirectUri).origin !== window.location.origin) {
    window.location.assign(getCanonicalGoogleSignInStartUrl());
    return;
  }

  const state = crypto.randomUUID();
  setStoredState(state);
  window.location.assign(buildGoogleAuthorizationUrl(state));
}

async function completeGoogleSignInFromRedirectOnce(): Promise<GoogleSession | null> {
  const url = new URL(window.location.href);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error) {
    clearGoogleAuthParamsFromUrl();
    throw new Error(`Google sign-in failed: ${error}`);
  }

  if (!code) {
    if (consumeGoogleSignInStartRequest()) {
      await redirectToGoogleSignIn();
      return null;
    }

    if (url.searchParams.has('iss') || url.searchParams.has('hd')) {
      clearGoogleAuthParamsFromUrl();
    }
    return null;
  }

  const expectedState = getStoredState();
  setStoredState(null);

  if (!expectedState || !state || expectedState !== state) {
    clearGoogleAuthParamsFromUrl();
    throw new Error('Google sign-in state validation failed.');
  }

  const response = await fetch(`${getApiBaseUrl()}/api/auth/google/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      redirectUri: getGoogleRedirectUri(),
    }),
  });

  const data = (await response.json()) as
    | GoogleSession
    | { error?: string };

  if (!response.ok || !('accessToken' in data)) {
    clearGoogleAuthParamsFromUrl();
    const errorMessage =
      'error' in data ? data.error : 'Failed to complete Google sign-in.';
    throw new Error(errorMessage ?? 'Failed to complete Google sign-in.');
  }

  assertAllowedGoogleProfile(data.profile);
  setStoredSession(data);
  clearGoogleAuthParamsFromUrl();

  return data;
}

export function completeGoogleSignInFromRedirect(): Promise<GoogleSession | null> {
  if (!googleRedirectCompletionPromise) {
    googleRedirectCompletionPromise = completeGoogleSignInFromRedirectOnce().finally(
      () => {
        googleRedirectCompletionPromise = null;
      },
    );
  }

  return googleRedirectCompletionPromise;
}

export async function restoreGoogleSession(): Promise<GoogleSession | null> {
  const session = getStoredSession();
  if (!session) {
    return null;
  }

  if (
    currentSession &&
    lastSessionValidationAt &&
    Date.now() - lastSessionValidationAt < GOOGLE_SESSION_REVALIDATE_MS
  ) {
    assertAllowedGoogleProfile(currentSession.profile);
    return currentSession;
  }

  if (isDevelopmentSession(session) && isDevelopmentAuthEnabled()) {
    if (isAllowedGoogleProfile(session.profile)) {
      return session;
    }

    setStoredSession(null);
    return null;
  }

  try {
    const profile = await fetchGoogleProfile(session.accessToken);
    assertAllowedGoogleProfile(profile);
    const nextSession = {
      accessToken: session.accessToken,
      profile,
    };

    setStoredSession(nextSession);
    return nextSession;
  } catch {
    setStoredSession(null);
    return null;
  }
}

export function signInWithDevelopmentUser(): GoogleSession {
  if (!isDevelopmentAuthEnabled()) {
    throw new Error('Development sign-in is only available while running Vite locally.');
  }

  const session = {
    accessToken: DEVELOPMENT_ACCESS_TOKEN,
    profile: {
      email: 'test-reviewer@acmucsd.org',
      name: 'Test Reviewer',
      picture: '',
    },
  };

  setStoredSession(session);
  return session;
}

export async function signOutFromGoogle(): Promise<void> {
  const session = getStoredSession();

  setStoredSession(null);

  if (!session) {
    return;
  }

  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token: session.accessToken,
    }),
  }).catch(() => undefined);
}

export async function getGoogleApiClient(): Promise<GoogleApi> {
  const session = getStoredSession();
  if (!session) {
    throw new Error('Missing Google access token.');
  }

  if (isDevelopmentSession(session) && isDevelopmentAuthEnabled()) {
    return createMockGoogleApiClient();
  }

  assertAllowedGoogleProfile(session.profile);
  return createSheetsRestApiClient(session);
}
