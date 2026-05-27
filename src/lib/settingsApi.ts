import { getApiBaseUrl, getStoredGoogleAccessToken } from './googleAuth';

const API_CACHE_TTL_MS = 5 * 60_000;

export interface ReviewSettings {
  dueDate: string;
  updatedByEmail: string;
  updatedAt: string;
}

export interface ApplicationSourceSettings {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  sheetRange: string;
  updatedByEmail: string;
  updatedAt: string;
}

interface UpdateApplicationSourceInput {
  spreadsheetUrl: string;
  sheetName: string;
  clearCurrentData: boolean;
}

interface ApiDataResponse<T> {
  data: T;
}

interface ApiErrorResponse {
  error?: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

let reviewSettingsCache: CacheEntry<ReviewSettings> | null = null;
let applicationSourceSettingsCache: CacheEntry<ApplicationSourceSettings> | null =
  null;

function getAuthorizationHeaders() {
  const accessToken = getStoredGoogleAccessToken();

  if (!accessToken) {
    throw new Error('Missing authentication token.');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function readApiJson<T>(response: Response): Promise<T> {
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  const data = (
    typeof parsed === 'object' && parsed !== null ? parsed : {}
  ) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed.');
  }

  return data;
}

function readCached<T>(
  cache: CacheEntry<T> | null,
  loader: () => Promise<T>,
  setCache: (entry: CacheEntry<T> | null) => void,
): Promise<T> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.promise;
  }

  const entry = {
    expiresAt: Date.now() + API_CACHE_TTL_MS,
    promise: loader(),
  };
  setCache(entry);

  return entry.promise.catch((error: unknown) => {
    setCache(null);
    throw error;
  });
}

export async function getReviewSettings(): Promise<ReviewSettings> {
  const response = await readCached(
    reviewSettingsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ReviewSettings>>(
        await fetch(`${getApiBaseUrl()}/api/settings/review`, {
          headers: getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      reviewSettingsCache = entry;
    },
  );

  return response;
}

export async function getApplicationSourceSettings(): Promise<ApplicationSourceSettings> {
  const response = await readCached(
    applicationSourceSettingsCache,
    async () => {
      const result =
        await readApiJson<ApiDataResponse<ApplicationSourceSettings>>(
          await fetch(`${getApiBaseUrl()}/api/settings/application-source`, {
            headers: getAuthorizationHeaders(),
          }),
        );
      return result.data;
    },
    (entry) => {
      applicationSourceSettingsCache = entry;
    },
  );

  return response;
}

export async function updateReviewDueDate(
  dueDate: string,
): Promise<ReviewSettings> {
  const response = await readApiJson<ApiDataResponse<ReviewSettings>>(
    await fetch(`${getApiBaseUrl()}/api/admin/settings/review`, {
      method: 'PUT',
      headers: {
        ...getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dueDate }),
    }),
  );

  reviewSettingsCache = {
    expiresAt: Date.now() + API_CACHE_TTL_MS,
    promise: Promise.resolve(response.data),
  };
  return response.data;
}

export async function updateApplicationSourceSettings(
  input: UpdateApplicationSourceInput,
): Promise<ApplicationSourceSettings> {
  const response = await readApiJson<ApiDataResponse<ApplicationSourceSettings>>(
    await fetch(`${getApiBaseUrl()}/api/admin/settings/application-source`, {
      method: 'PUT',
      headers: {
        ...getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }),
  );

  applicationSourceSettingsCache = {
    expiresAt: Date.now() + API_CACHE_TTL_MS,
    promise: Promise.resolve(response.data),
  };
  return response.data;
}
