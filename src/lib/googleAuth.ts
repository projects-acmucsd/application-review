import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const GOOGLE_SCOPES =
  'openid profile email https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_SESSION_STORAGE_KEY = 'google_session';
const DEVELOPMENT_ACCESS_TOKEN = 'development-access-token';
const ALLOWED_GOOGLE_EMAIL_DOMAIN = 'acmucsd.org';
const ALLOWED_GOOGLE_EMAIL_SUFFIX = `@${ALLOWED_GOOGLE_EMAIL_DOMAIN}`;

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
}

export interface GoogleSession {
  accessToken: string;
  profile: GoogleProfile;
}

interface GoogleApiErrorPayload {
  error?: {
    message?: string;
  };
}

interface GoogleSheetsValuesResponse extends GoogleApiErrorPayload {
  values?: string[][];
}

type SupabaseSessionWithProviderToken = Session & {
  provider_token?: string | null;
};

let currentSession: GoogleSession | null = null;
let supabaseClient: SupabaseClient | null = null;

function isLocalSupabaseHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

function createGoogleSignInConfigError(detail: string): Error {
  return new Error(`Google sign-in is misconfigured: ${detail}`);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

function isHtmlJsonParseError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    message.includes("Unexpected token '<'") ||
    message.includes('<!DOCTYPE') ||
    normalizedMessage.includes('not valid json')
  );
}

export function getGoogleAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const message = readErrorMessage(error);

  if (isHtmlJsonParseError(message)) {
    return createGoogleSignInConfigError(
      'Supabase Auth returned the app HTML instead of JSON. Set VITE_SUPABASE_URL to your Supabase project URL, for example https://your-project-ref.supabase.co.',
    ).message;
  }

  return message || fallbackMessage;
}

function createGoogleSignInError(error: unknown, fallbackMessage: string): Error {
  return new Error(getGoogleAuthErrorMessage(error, fallbackMessage));
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

function getSupabaseUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    throw createGoogleSignInConfigError(
      'missing VITE_SUPABASE_URL. Set it to your Supabase project URL, for example https://your-project-ref.supabase.co.',
    );
  }

  if (supabaseUrl.includes('your-project-ref')) {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_URL is still the example placeholder.',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_URL must be an absolute URL.',
    );
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_URL must start with http:// or https://.',
    );
  }

  if (parsedUrl.protocol === 'http:' && !isLocalSupabaseHost(parsedUrl.hostname)) {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_URL must use https outside local development.',
    );
  }

  if (parsedUrl.origin === window.location.origin) {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_URL points to this app instead of Supabase. Use your Supabase project URL, for example https://your-project-ref.supabase.co.',
    );
  }

  return parsedUrl.origin;
}

function getSupabaseAnonKey(): string {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!supabaseAnonKey) {
    throw createGoogleSignInConfigError('missing VITE_SUPABASE_ANON_KEY.');
  }

  if (supabaseAnonKey === 'your_supabase_anon_key') {
    throw createGoogleSignInConfigError(
      'VITE_SUPABASE_ANON_KEY is still the example placeholder.',
    );
  }

  return supabaseAnonKey;
}

function getSupabaseClient(): SupabaseClient {
  supabaseClient ??= createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
    },
  });

  return supabaseClient;
}

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  return window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : window.location.origin;
}

export function hasGoogleSignInStartRequest(): boolean {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return (
    params.has('code') ||
    params.has('error') ||
    hashParams.has('access_token') ||
    hashParams.has('error')
  );
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

function setStoredSession(session: GoogleSession | null) {
  currentSession = session;

  if (session) {
    localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
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

function readMetadataString(
  metadata: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
}

function getGoogleProviderToken(session: Session): string | null {
  return (session as SupabaseSessionWithProviderToken).provider_token ?? null;
}

function toGoogleProfile(session: Session): GoogleProfile {
  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = session.user.email ?? readMetadataString(metadata, ['email']);

  return {
    email,
    name:
      readMetadataString(metadata, ['full_name', 'name']) || email || 'Reviewer',
    picture: readMetadataString(metadata, ['avatar_url', 'picture']),
  };
}

function toGoogleSession(session: Session): GoogleSession {
  const profile = toGoogleProfile(session);
  assertAllowedGoogleProfile(profile);

  const providerToken = getGoogleProviderToken(session);
  if (providerToken) {
    return {
      accessToken: providerToken,
      profile,
    };
  }

  const storedSession = getStoredSession();
  if (storedSession?.profile.email.toLowerCase() === profile.email.toLowerCase()) {
    return storedSession;
  }

  throw new Error(
    'Missing Google provider token. Sign out and sign in again to grant Google Sheets access.',
  );
}

function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  [
    'code',
    'state',
    'scope',
    'authuser',
    'prompt',
    'error',
    'error_code',
    'error_description',
    'iss',
    'hd',
  ].forEach((key) => url.searchParams.delete(key));

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    [
      'access_token',
      'expires_at',
      'expires_in',
      'provider_token',
      'refresh_token',
      'token_type',
      'type',
      'error',
      'error_code',
      'error_description',
    ].forEach((key) => hashParams.delete(key));
    url.hash = hashParams.toString();
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function getAuthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    params.get('error_description') ||
    params.get('error') ||
    hashParams.get('error_description') ||
    hashParams.get('error')
  );
}

function getCurrentAppRedirectUrl(): string {
  const url = new URL(window.location.href);
  clearAuthParams(url.searchParams);
  url.hash = '';

  if (url.pathname === '/' && !url.search) {
    return url.origin;
  }

  return url.toString();
}

function clearAuthParams(params: URLSearchParams) {
  [
    'code',
    'state',
    'scope',
    'authuser',
    'prompt',
    'error',
    'error_code',
    'error_description',
    'iss',
    'hd',
  ].forEach((key) => params.delete(key));
}

export async function redirectToGoogleSignIn(): Promise<void> {
  try {
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          access_type: 'offline',
          hd: ALLOWED_GOOGLE_EMAIL_DOMAIN,
          prompt: 'consent',
        },
        redirectTo: getCurrentAppRedirectUrl(),
        scopes: GOOGLE_SCOPES,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    throw createGoogleSignInError(error, 'Failed to start Google sign-in.');
  }
}

async function completeGoogleSignInFromRedirectOnce(): Promise<GoogleSession | null> {
  const authError = getAuthErrorFromUrl();
  if (authError) {
    clearAuthParamsFromUrl();
    throw new Error(`Google sign-in failed: ${authError}`);
  }

  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) {
    return restoreGoogleSession();
  }

  const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code)
    .catch((exchangeError: unknown) => {
      throw createGoogleSignInError(
        exchangeError,
        'Failed to complete Google sign-in.',
      );
    });

  clearAuthParamsFromUrl();

  if (error) {
    throw createGoogleSignInError(error, 'Failed to complete Google sign-in.');
  }

  if (!data.session) {
    setStoredSession(null);
    return null;
  }

  const googleSession = toGoogleSession(data.session);
  setStoredSession(googleSession);
  return googleSession;
}

let googleRedirectCompletionPromise: Promise<GoogleSession | null> | null = null;

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
  const storedSession = getStoredSession();
  if (isDevelopmentAuthEnabled() && isDevelopmentSession(storedSession)) {
    return storedSession;
  }

  const { data, error } = await getSupabaseClient().auth.getSession()
    .catch((sessionError: unknown) => {
      throw createGoogleSignInError(
        sessionError,
        'Failed to restore Google sign-in.',
      );
    });

  if (error) {
    setStoredSession(null);
    throw createGoogleSignInError(error, 'Failed to restore Google sign-in.');
  }

  if (!data.session) {
    setStoredSession(null);
    return null;
  }

  const googleSession = toGoogleSession(data.session);
  setStoredSession(googleSession);
  return googleSession;
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
  setStoredSession(null);
  const { error } = await getSupabaseClient().auth.signOut().catch(
    (signOutError: unknown) => {
      throw createGoogleSignInError(signOutError, 'Failed to sign out from Google.');
    },
  );

  if (error) {
    throw createGoogleSignInError(error, 'Failed to sign out from Google.');
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
