import {
  createSupabaseUnavailableError,
  getSupabaseAdmin,
  isSupabaseConnectionError,
  shouldUseSupabaseReadFallback,
} from '../../lib/supabase.js';
import {
  createHttpError,
  fetchGoogleProfile,
} from '../auth/google-auth.js';

type ReviewDecision = 'reject' | 'waitlist' | 'accept';
type ReviewRow =
  import('../../types/database.js').Database['public']['Tables']['application_reviews']['Row'];

export interface ApplicationReview {
  applicationId: string;
  rating: number | null;
  decision: ReviewDecision | null;
  updatedByEmail: string;
  updatedByName: string;
  updatedAt: string;
}

export interface ApplicationReviewInput {
  rating: number | null;
  decision: ReviewDecision | null;
}

export interface ReviewStats {
  totalDecisions: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
}

const EMPTY_REVIEW_STATS: ReviewStats = {
  totalDecisions: 0,
  accepted: 0,
  waitlisted: 0,
  rejected: 0,
};

const REVIEW_DECISIONS = new Set<ReviewDecision>([
  'reject',
  'waitlist',
  'accept',
]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertApplicationId(applicationId: string) {
  if (!applicationId.trim()) {
    throw createHttpError(400, 'Missing application id.');
  }
}

function assertRating(rating: number | null) {
  if (rating === null) {
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw createHttpError(400, 'Rating must be a whole number from 1 to 10.');
  }
}

function assertDecision(decision: ReviewDecision | null) {
  if (decision !== null && !REVIEW_DECISIONS.has(decision)) {
    throw createHttpError(400, 'Decision must be reject, waitlist, or accept.');
  }
}

function toReview(row: ReviewRow): ApplicationReview {
  return {
    applicationId: row.application_id,
    rating: row.rating,
    decision: row.decision,
    updatedByEmail: row.updated_by_email,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

export async function listApplicationReviews(
  accessToken: string,
): Promise<ApplicationReview[]> {
  await fetchGoogleProfile(accessToken);

  const { data, error } = await getSupabaseAdmin()
    .from('application_reviews')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    if (shouldUseSupabaseReadFallback(error)) {
      return [];
    }

    throw error;
  }

  return (data ?? []).map(toReview);
}

export async function upsertApplicationReview({
  accessToken,
  applicationId,
  review,
}: {
  accessToken: string;
  applicationId: string;
  review: ApplicationReviewInput;
}): Promise<ApplicationReview> {
  const profile = await fetchGoogleProfile(accessToken);

  assertApplicationId(applicationId);
  assertRating(review.rating);
  assertDecision(review.decision);

  const { data, error } = await getSupabaseAdmin()
    .from('application_reviews')
    .upsert(
      {
        application_id: applicationId,
        rating: review.rating,
        decision: review.decision,
        updated_by_email: normalizeEmail(profile.email),
        updated_by_name: profile.name || profile.email,
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

  return toReview(data);
}

export async function getApplicationReviewStats(
  accessToken: string,
): Promise<ReviewStats> {
  await fetchGoogleProfile(accessToken);

  const { data, error } = await getSupabaseAdmin()
    .from('application_reviews')
    .select('decision')
    .not('decision', 'is', null);

  if (error) {
    if (shouldUseSupabaseReadFallback(error)) {
      return EMPTY_REVIEW_STATS;
    }

    throw error;
  }

  return (data ?? []).reduce<ReviewStats>(
    (stats, row) => {
      if (row.decision === 'accept') {
        stats.accepted += 1;
      } else if (row.decision === 'waitlist') {
        stats.waitlisted += 1;
      } else if (row.decision === 'reject') {
        stats.rejected += 1;
      }

      stats.totalDecisions += 1;
      return stats;
    },
    { ...EMPTY_REVIEW_STATS },
  );
}
