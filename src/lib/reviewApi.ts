import { getApiBaseUrl, getStoredGoogleAccessToken } from './googleAuth';

const API_CACHE_TTL_MS = 5 * 60_000;

export type ReviewDecision = 'reject' | 'waitlist' | 'accept';

export interface ApplicationReview {
  applicationId: string;
  rating: number | null;
  decision: ReviewDecision | null;
  updatedByEmail: string;
  updatedByName: string;
  updatedAt: string;
}

export interface ReviewStats {
  totalDecisions: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
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

let applicationReviewsCache: CacheEntry<ApplicationReview[]> | null = null;
let reviewStatsCache: CacheEntry<ReviewStats> | null = null;

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

export function clearReviewCaches() {
  applicationReviewsCache = null;
  reviewStatsCache = null;
}

export async function listApplicationReviews(): Promise<ApplicationReview[]> {
  const response = await readCached(
    applicationReviewsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ApplicationReview[]>>(
        await fetch(`${getApiBaseUrl()}/api/reviews`, {
          headers: getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      applicationReviewsCache = entry;
    },
  );

  return response;
}

export async function saveApplicationReview({
  applicationId,
  rating,
  decision,
}: {
  applicationId: string;
  rating: number | null;
  decision: ReviewDecision | null;
}): Promise<ApplicationReview> {
  const response = await readApiJson<ApiDataResponse<ApplicationReview>>(
    await fetch(`${getApiBaseUrl()}/api/reviews/${encodeURIComponent(applicationId)}`, {
      method: 'PUT',
      headers: {
        ...getAuthorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rating,
        decision,
      }),
    }),
  );

  applicationReviewsCache = {
    expiresAt: Date.now() + API_CACHE_TTL_MS,
    promise: (applicationReviewsCache?.promise ?? Promise.resolve([])).then(
      (reviews) => {
        const nextReviews = reviews.filter(
          (review) => review.applicationId !== response.data.applicationId,
        );
        return [response.data, ...nextReviews];
      },
    ),
  };
  reviewStatsCache = null;

  return response.data;
}

export async function getReviewStats(): Promise<ReviewStats> {
  const response = await readCached(
    reviewStatsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ReviewStats>>(
        await fetch(`${getApiBaseUrl()}/api/reviews/stats`, {
          headers: getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      reviewStatsCache = entry;
    },
  );

  return response;
}
