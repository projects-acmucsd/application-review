import {
  createSupabaseUnavailableError,
  getSupabaseAdmin,
  isSupabaseConnectionError,
  readFromSupabaseWithFallback,
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
  comment: string | null;
  rating: number | null;
  decision: ReviewDecision | null;
  updatedByEmail: string;
  updatedByName: string;
  updatedAt: string;
}

export interface ApplicationReviewInput {
  comment?: string;
  expectedUpdatedAt?: string | null;
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

function isReviewTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

export function assertReviewCommentInput(review: {
  comment?: unknown;
  expectedUpdatedAt?: unknown;
}) {
  if (
    review.comment !== undefined &&
    (typeof review.comment !== 'string' || review.comment.includes('\0'))
  ) {
    throw createHttpError(400, 'Comment must be text without null characters.');
  }

  if (review.comment !== undefined && review.expectedUpdatedAt === undefined) {
    throw createHttpError(400, 'Comment saves require expectedUpdatedAt.');
  }

  const version = review.expectedUpdatedAt;
  if (
    version !== undefined &&
    version !== null &&
    (typeof version !== 'string' || !isReviewTimestamp(version))
  ) {
    throw createHttpError(400, 'expectedUpdatedAt must be a valid timestamp or null.');
  }
}

function createReviewConflictError() {
  return createHttpError(
    409,
    'This review changed since you started editing. Reload the latest review before saving.',
  );
}

function toReview(row: ReviewRow): ApplicationReview {
  return {
    applicationId: row.application_id,
    comment: row.comment,
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

  return readFromSupabaseWithFallback([], async (supabase) => {
    const { data, error } = await supabase
      .from('application_reviews')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map(toReview);
  });
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
  assertReviewCommentInput(review);

  const values = {
    application_id: applicationId,
    rating: review.rating,
    decision: review.decision,
    updated_by_email: normalizeEmail(profile.email),
    updated_by_name: profile.name || profile.email,
    // Omitted comments from older or decision-only clients must stay unchanged.
    ...(review.comment !== undefined ? { comment: review.comment } : {}),
  };
  const table = getSupabaseAdmin().from('application_reviews');
  const { data, error } = await (
    review.expectedUpdatedAt === null
      ? table.insert(values).select().single()
      : review.expectedUpdatedAt !== undefined
        ? table
            .update(values)
            .eq('application_id', applicationId)
            .eq('updated_at', review.expectedUpdatedAt)
            .select()
            .maybeSingle()
        : table.upsert(values, { onConflict: 'application_id' }).select().single()
  );

  if (error) {
    if (review.expectedUpdatedAt === null && error.code === '23505') {
      throw createReviewConflictError();
    }

    if (isSupabaseConnectionError(error)) {
      throw createSupabaseUnavailableError();
    }

    throw error;
  }

  if (!data) {
    throw createReviewConflictError();
  }

  return toReview(data);
}

export async function getApplicationReviewStats(
  accessToken: string,
): Promise<ReviewStats> {
  await fetchGoogleProfile(accessToken);

  return readFromSupabaseWithFallback(EMPTY_REVIEW_STATS, async (supabase) => {
    const { data, error } = await supabase
      .from('application_reviews')
      .select('decision')
      .not('decision', 'is', null);

    if (error) {
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
  });
}
