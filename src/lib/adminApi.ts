import {
  getApiBaseUrl,
  getStoredGoogleAccessToken,
  getStoredGoogleProfile,
  isDemoGoogleSession,
} from './googleAuth';

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
let demoAssignments: ApplicationAssignment[] = [];

const DEMO_REVIEWERS: ReviewerOption[] = [
  { email: 'demo-admin@acmucsd.org', name: 'Demo Admin' },
  { email: 'demo-reviewer@acmucsd.org', name: 'Demo Reviewer' },
  { email: 'demo-lead@acmucsd.org', name: 'Demo Lead' },
];

function getAuthorizationHeaders() {
  const accessToken = getStoredGoogleAccessToken();

  if (!accessToken) {
    throw new Error('Missing authentication token.');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function getDemoProfile() {
  return (
    getStoredGoogleProfile() ?? {
      email: 'demo-admin@acmucsd.org',
      name: 'Demo Admin',
      picture: '',
    }
  );
}

function createDemoAssignment(
  applicationId: string,
  assignee: ReviewerOption,
): ApplicationAssignment {
  const profile = getDemoProfile();
  const now = new Date().toISOString();

  return {
    applicationId,
    assigneeEmail: assignee.email,
    assigneeName: assignee.name,
    assignedByEmail: profile.email,
    assignedAt: now,
    updatedAt: now,
  };
}

function saveDemoAssignment(
  applicationId: string,
  assignee: ReviewerOption,
): ApplicationAssignment {
  const assignment = createDemoAssignment(applicationId, assignee);
  demoAssignments = [
    assignment,
    ...demoAssignments.filter((item) => item.applicationId !== applicationId),
  ];
  return assignment;
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
  demoAssignments = [];
}

export function clearAssignmentCaches() {
  adminAssignmentsCache = null;
  myAssignmentsCache = null;
}

export async function getAdminStatus(): Promise<AdminStatus> {
  if (isDemoGoogleSession()) {
    const profile = getDemoProfile();
    const status = {
      isAdmin: true,
      profile,
    };

    localStorage.setItem(ADMIN_ACCESS_STORAGE_KEY, 'true');
    return status;
  }

  const status = await readCached(
    adminStatusCache,
    async () =>
      readApiJson<AdminStatus>(
        await fetch(`${getApiBaseUrl()}/api/admin/me`, {
          headers: getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    return DEMO_REVIEWERS;
  }

  const response = await readCached(
    adminReviewersCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ReviewerOption[]>>(
        await fetch(`${getApiBaseUrl()}/api/admin/reviewers`, {
          headers: getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    return demoAssignments;
  }

  const response = await readCached(
    adminAssignmentsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
        await fetch(`${getApiBaseUrl()}/api/admin/assignments`, {
          headers: getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    const profile = getDemoProfile();
    return demoAssignments.filter(
      (assignment) => assignment.assigneeEmail === profile.email,
    );
  }

  const response = await readCached(
    myAssignmentsCache,
    async () => {
      const result = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
        await fetch(`${getApiBaseUrl()}/api/assignments/me`, {
          headers: getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    return saveDemoAssignment(applicationId, assignee);
  }

  const response = await readApiJson<ApiDataResponse<ApplicationAssignment>>(
    await fetch(
      `${getApiBaseUrl()}/api/admin/assignments/${encodeURIComponent(applicationId)}`,
      {
        method: 'PUT',
        headers: {
          ...getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    return applicationIds.map((applicationId) =>
      saveDemoAssignment(applicationId, assignee),
    );
  }

  const response = await readApiJson<ApiDataResponse<ApplicationAssignment[]>>(
    await fetch(`${getApiBaseUrl()}/api/admin/assignments/bulk`, {
      method: 'POST',
      headers: {
        ...getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    const applicationIdSet = new Set(applicationIds);
    demoAssignments = demoAssignments.filter(
      (assignment) => !applicationIdSet.has(assignment.applicationId),
    );
    return applicationIds;
  }

  const response = await readApiJson<ApiDataResponse<string[]>>(
    await fetch(`${getApiBaseUrl()}/api/admin/assignments/bulk-clear`, {
      method: 'POST',
      headers: {
        ...getAuthorizationHeaders(),
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
  if (isDemoGoogleSession()) {
    demoAssignments = demoAssignments.filter(
      (assignment) => assignment.applicationId !== applicationId,
    );
    return;
  }

  await fetch(
    `${getApiBaseUrl()}/api/admin/assignments/${encodeURIComponent(applicationId)}`,
    {
      method: 'DELETE',
      headers: getAuthorizationHeaders(),
    },
  ).then(async (response) => {
    if (!response.ok) {
      await readApiJson<unknown>(response);
    }
  });
  adminAssignmentsCache = null;
  myAssignmentsCache = null;
}
