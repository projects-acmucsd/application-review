import { getApiBaseUrl, getFreshGoogleAccessToken } from './googleAuth';

const ADMIN_ACCESS_STORAGE_KEY = 'acm_projects_admin_access';
const API_CACHE_TTL_MS = 5 * 60_000;

export interface ReviewerOption {
  email: string;
  name: string;
}

export interface ApplicationAssignment {
  applicationId: string;
  assigneeEmail: string;
  assigneeName: string;
  assignedByEmail: string;
  assignedAt: string;
  updatedAt: string;
}

export interface AdminStatus {
  isAdmin: boolean;
  profile: {
    email: string;
    name: string;
    picture: string;
  };
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

let adminStatusCache: CacheEntry<AdminStatus> | null = null;
let adminAssignmentsCache: CacheEntry<ApplicationAssignment[]> | null = null;
let myAssignmentsCache: CacheEntry<ApplicationAssignment[]> | null = null;
let adminReviewersCache: CacheEntry<ReviewerOption[]> | null = null;

async function getAuthorizationHeaders() {
  return {
    Authorization: `Bearer ${await getFreshGoogleAccessToken()}`,
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

function parseReviewerEntry(entry: string): ReviewerOption | null {
  const trimmedEntry = entry.trim();
  if (!trimmedEntry) {
    return null;
  }

  const angleMatch = /^(.*?)\s*<([^>]+)>$/.exec(trimmedEntry);
  if (angleMatch) {
    const name = angleMatch[1]?.trim() || angleMatch[2]?.trim() || '';
    const email = angleMatch[2]?.trim().toLowerCase() || '';
    return email ? { email, name } : null;
  }

  const [email, name] = trimmedEntry.split('|').map((part) => part.trim());
  if (!email) {
    return null;
  }

  return {
    email: email.toLowerCase(),
    name: name || email,
  };
}

export function getReviewerOptionsFromEnv(): ReviewerOption[] {
  return (import.meta.env.VITE_REVIEWER_LIST ?? '')
    .split(',')
    .map(parseReviewerEntry)
    .filter((entry): entry is ReviewerOption => Boolean(entry));
}

export function hasCachedAdminAccess(): boolean {
  return localStorage.getItem(ADMIN_ACCESS_STORAGE_KEY) === 'true';
}

export function clearCachedAdminAccess() {
  localStorage.removeItem(ADMIN_ACCESS_STORAGE_KEY);
  adminStatusCache = null;
  clearAssignmentCaches();
  adminReviewersCache = null;
}

export function clearAssignmentCaches() {
  adminAssignmentsCache = null;
  myAssignmentsCache = null;
}

export async function getAdminStatus(): Promise<AdminStatus> {
  const status = await readCached(
    adminStatusCache,
    async () =>
      readApiJson<AdminStatus>(
        await fetch(`${getApiBaseUrl()}/api/admin/me`, {
          headers: await getAuthorizationHeaders(),
        }),
      ),
    (entry) => {
      adminStatusCache = entry;
    },
  );

  localStorage.setItem(
    ADMIN_ACCESS_STORAGE_KEY,
    status.isAdmin ? 'true' : 'false',
  );

  return status;
}

export async function listAdminReviewers(): Promise<ReviewerOption[]> {
  const response = await readCached(
    adminReviewersCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ReviewerOption[]>>(
        await fetch(`${getApiBaseUrl()}/api/admin/reviewers`, {
          headers: await getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      adminReviewersCache = entry;
    },
  );

  return response;
}

export async function listAdminAssignments(): Promise<ApplicationAssignment[]> {
  const response = await readCached(
    adminAssignmentsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
        await fetch(`${getApiBaseUrl()}/api/admin/assignments`, {
          headers: await getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      adminAssignmentsCache = entry;
    },
  );

  return response;
}

export async function listMyAssignments(): Promise<ApplicationAssignment[]> {
  const response = await readCached(
    myAssignmentsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
        await fetch(`${getApiBaseUrl()}/api/assignments/me`, {
          headers: await getAuthorizationHeaders(),
        }),
      );
      return result.data;
    },
    (entry) => {
      myAssignmentsCache = entry;
    },
  );

  return response;
}

export async function assignApplication({
  applicationId,
  assignee,
}: {
  applicationId: string;
  assignee: ReviewerOption;
}): Promise<ApplicationAssignment> {
  const response = await readApiJson<ApiDataResponse<ApplicationAssignment>>(
    await fetch(
      `${getApiBaseUrl()}/api/admin/assignments/${encodeURIComponent(applicationId)}`,
      {
        method: 'PUT',
        headers: {
          ...(await getAuthorizationHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigneeEmail: assignee.email,
          assigneeName: assignee.name,
        }),
      },
    ),
  );

  adminAssignmentsCache = null;
  myAssignmentsCache = null;
  return response.data;
}

export async function bulkAssignApplications({
  applicationIds,
  assignee,
}: {
  applicationIds: string[];
  assignee: ReviewerOption;
}): Promise<ApplicationAssignment[]> {
  const response = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
    await fetch(`${getApiBaseUrl()}/api/admin/assignments/bulk`, {
      method: 'POST',
      headers: {
        ...(await getAuthorizationHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationIds,
        assigneeEmail: assignee.email,
        assigneeName: assignee.name,
      }),
    }),
  );

  adminAssignmentsCache = null;
  myAssignmentsCache = null;
  return response.data;
}

export async function bulkClearAssignments({
  applicationIds,
}: {
  applicationIds: string[];
}): Promise<string[]> {
  const response = await readApiJson<ApiDataResponse<string[]>>(
    await fetch(`${getApiBaseUrl()}/api/admin/assignments/bulk-clear`, {
      method: 'POST',
      headers: {
        ...(await getAuthorizationHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationIds,
      }),
    }),
  );

  adminAssignmentsCache = null;
  myAssignmentsCache = null;
  return response.data;
}

export async function clearApplicationAssignment(
  applicationId: string,
): Promise<void> {
  await fetch(
    `${getApiBaseUrl()}/api/admin/assignments/${encodeURIComponent(applicationId)}`,
    {
      method: 'DELETE',
      headers: await getAuthorizationHeaders(),
    },
  ).then(async (response) => {
    if (!response.ok) {
      await readApiJson<unknown>(response);
    }
  });
  adminAssignmentsCache = null;
  myAssignmentsCache = null;
}
