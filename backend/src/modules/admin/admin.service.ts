import { env, type ReviewerOption } from '../../config/env.js';
import {
  createSupabaseUnavailableError,
  getSupabaseAdmin,
  isSupabaseConnectionError,
  readFromSupabaseWithFallback,
} from '../../lib/supabase.js';
import {
  createHttpError,
  fetchGoogleProfile,
  type GoogleProfile,
} from '../auth/google-auth.js';

type AssignmentRow =
  import('../../types/database.js').Database['public']['Tables']['application_assignments']['Row'];
type AssignmentInsert =
  import('../../types/database.js').Database['public']['Tables']['application_assignments']['Insert'];

export interface ApplicationAssignment {
  applicationId: string;
  assigneeEmail: string;
  assigneeName: string;
  assignedByEmail: string;
  assignedAt: string;
  updatedAt: string;
}

export interface AssignmentInput {
  assigneeEmail: string;
  assigneeName: string;
}

export interface BulkAssignmentInput extends AssignmentInput {
  applicationIds: string[];
}

export interface AdminStatus {
  isAdmin: boolean;
  profile: GoogleProfile;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertAcmEmail(email: string) {
  if (!normalizeEmail(email).endsWith('@acmucsd.org')) {
    throw createHttpError(400, 'Assignee must use an @acmucsd.org email.');
  }
}

function assertApplicationId(applicationId: string) {
  if (!applicationId.trim()) {
    throw createHttpError(400, 'Missing application id.');
  }
}

function normalizeApplicationIds(applicationIds: string[]): string[] {
  return Array.from(
    new Set(applicationIds.map((applicationId) => applicationId.trim())),
  ).filter(Boolean);
}

function assertReviewerAllowed(assigneeEmail: string) {
  if (
    env.reviewerList.length &&
    !env.reviewerList.some((reviewer) => reviewer.email === assigneeEmail)
  ) {
    throw createHttpError(400, 'Assignee is not in REVIEWER_LIST.');
  }
}

function toAssignment(row: AssignmentRow): ApplicationAssignment {
  return {
    applicationId: row.application_id,
    assigneeEmail: row.assignee_email,
    assigneeName: row.assignee_name,
    assignedByEmail: row.assigned_by_email,
    assignedAt: row.assigned_at,
    updatedAt: row.updated_at,
  };
}

function isAdminEmail(email: string): boolean {
  return env.adminEmails.includes(normalizeEmail(email));
}

async function getProfile(accessToken: string): Promise<GoogleProfile> {
  return fetchGoogleProfile(accessToken);
}

export async function getAdminStatus(
  accessToken: string,
): Promise<AdminStatus> {
  const profile = await getProfile(accessToken);

  return {
    isAdmin: isAdminEmail(profile.email),
    profile,
  };
}

export async function requireAdmin(accessToken: string): Promise<GoogleProfile> {
  const profile = await getProfile(accessToken);

  if (!isAdminEmail(profile.email)) {
    throw createHttpError(403, 'Admin access is required.');
  }

  return profile;
}

export async function listReviewerOptions(
  accessToken: string,
): Promise<ReviewerOption[]> {
  await requireAdmin(accessToken);
  return env.reviewerList;
}

export async function listAssignments(
  accessToken: string,
): Promise<ApplicationAssignment[]> {
  await requireAdmin(accessToken);

  return readFromSupabaseWithFallback([], async (supabase) => {
    const { data, error } = await supabase
      .from('application_assignments')
      .select('*')
      .order('assigned_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map(toAssignment);
  });
}

export async function listAssignmentsForReviewer(
  accessToken: string,
): Promise<ApplicationAssignment[]> {
  const profile = await getProfile(accessToken);

  return readFromSupabaseWithFallback([], async (supabase) => {
    const { data, error } = await supabase
      .from('application_assignments')
      .select('*')
      .eq('assignee_email', normalizeEmail(profile.email))
      .order('assigned_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map(toAssignment);
  });
}

export async function upsertAssignment({
  accessToken,
  applicationId,
  assignment,
}: {
  accessToken: string;
  applicationId: string;
  assignment: AssignmentInput;
}): Promise<ApplicationAssignment> {
  const adminProfile = await requireAdmin(accessToken);
  const assigneeEmail = normalizeEmail(assignment.assigneeEmail);
  const assigneeName = assignment.assigneeName.trim() || assigneeEmail;

  assertApplicationId(applicationId);
  assertAcmEmail(assigneeEmail);
  assertReviewerAllowed(assigneeEmail);

  const { data, error } = await getSupabaseAdmin()
    .from('application_assignments')
    .upsert(
      {
        application_id: applicationId,
        assignee_email: assigneeEmail,
        assignee_name: assigneeName,
        assigned_by_email: normalizeEmail(adminProfile.email),
      },
      { onConflict: 'application_id' },
    )
    .select()
    .single();

  if (error) {
    if (isSupabaseConnectionError(error)) {
      throw createSupabaseUnavailableError();
    }

    throw error;
  }

  return toAssignment(data);
}

export async function bulkAssignApplications({
  accessToken,
  assignment,
}: {
  accessToken: string;
  assignment: BulkAssignmentInput;
}): Promise<ApplicationAssignment[]> {
  const adminProfile = await requireAdmin(accessToken);
  const assigneeEmail = normalizeEmail(assignment.assigneeEmail);
  const assigneeName = assignment.assigneeName.trim() || assigneeEmail;
  const applicationIds = normalizeApplicationIds(assignment.applicationIds);

  assertAcmEmail(assigneeEmail);
  assertReviewerAllowed(assigneeEmail);

  if (!applicationIds.length) {
    throw createHttpError(400, 'No unassigned applications were selected.');
  }

  if (applicationIds.length > 250) {
    throw createHttpError(400, 'Bulk assignment is limited to 250 applications.');
  }

  const supabase = getSupabaseAdmin();
  const { data: existingRows, error: existingError } = await supabase
    .from('application_assignments')
    .select('application_id')
    .in('application_id', applicationIds);

  if (existingError) {
    if (isSupabaseConnectionError(existingError)) {
      throw createSupabaseUnavailableError();
    }

    throw existingError;
  }

  const alreadyAssigned = new Set(
    (existingRows ?? []).map((row) => row.application_id),
  );
  const insertRows: AssignmentInsert[] = applicationIds
    .filter((applicationId) => !alreadyAssigned.has(applicationId))
    .map((applicationId) => ({
      application_id: applicationId,
      assignee_email: assigneeEmail,
      assignee_name: assigneeName,
      assigned_by_email: normalizeEmail(adminProfile.email),
    }));

  if (!insertRows.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('application_assignments')
    .insert(insertRows)
    .select();

  if (error) {
    if (isSupabaseConnectionError(error)) {
      throw createSupabaseUnavailableError();
    }

    throw error;
  }

  return (data ?? []).map(toAssignment);
}

export async function bulkClearAssignments({
  accessToken,
  applicationIds,
}: {
  accessToken: string;
  applicationIds: string[];
}): Promise<string[]> {
  await requireAdmin(accessToken);
  const normalizedApplicationIds = normalizeApplicationIds(applicationIds);

  if (!normalizedApplicationIds.length) {
    throw createHttpError(400, 'No assigned applications were selected.');
  }

  if (normalizedApplicationIds.length > 250) {
    throw createHttpError(400, 'Bulk unassignment is limited to 250 applications.');
  }

  const { data, error } = await getSupabaseAdmin()
    .from('application_assignments')
    .delete()
    .in('application_id', normalizedApplicationIds)
    .select('application_id');

  if (error) {
    if (isSupabaseConnectionError(error)) {
      throw createSupabaseUnavailableError();
    }

    throw error;
  }

  return (data ?? []).map((row) => row.application_id);
}

export async function deleteAssignment({
  accessToken,
  applicationId,
}: {
  accessToken: string;
  applicationId: string;
}): Promise<void> {
  await requireAdmin(accessToken);
  assertApplicationId(applicationId);

  const { error } = await getSupabaseAdmin()
    .from('application_assignments')
    .delete()
    .eq('application_id', applicationId);

  if (error) {
    if (isSupabaseConnectionError(error)) {
      throw createSupabaseUnavailableError();
    }

    throw error;
  }
}
