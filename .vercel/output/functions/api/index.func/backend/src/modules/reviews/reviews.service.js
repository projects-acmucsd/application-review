import { createSupabaseUnavailableError, getSupabaseAdmin, isSupabaseConnectionError, shouldUseSupabaseReadFallback, } from '../../lib/supabase.js';
import { createHttpError, fetchGoogleProfile, } from '../auth/google-auth.js';
const EMPTY_REVIEW_STATS = {
    totalDecisions: 0,
    accepted: 0,
    waitlisted: 0,
    rejected: 0,
};
const REVIEW_DECISIONS = new Set([
    'reject',
    'waitlist',
    'accept',
]);
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function assertApplicationId(applicationId) {
    if (!applicationId.trim()) {
        throw createHttpError(400, 'Missing application id.');
    }
}
function assertRating(rating) {
    if (rating === null) {
        return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        throw createHttpError(400, 'Rating must be a whole number from 1 to 10.');
    }
}
function assertDecision(decision) {
    if (decision !== null && !REVIEW_DECISIONS.has(decision)) {
        throw createHttpError(400, 'Decision must be reject, waitlist, or accept.');
    }
}
function toReview(row) {
    return {
        applicationId: row.application_id,
        rating: row.rating,
        decision: row.decision,
        updatedByEmail: row.updated_by_email,
        updatedByName: row.updated_by_name,
        updatedAt: row.updated_at,
    };
}
export async function listApplicationReviews(accessToken) {
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
export async function upsertApplicationReview({ accessToken, applicationId, review, }) {
    const profile = await fetchGoogleProfile(accessToken);
    assertApplicationId(applicationId);
    assertRating(review.rating);
    assertDecision(review.decision);
    const { data, error } = await getSupabaseAdmin()
        .from('application_reviews')
        .upsert({
        application_id: applicationId,
        rating: review.rating,
        decision: review.decision,
        updated_by_email: normalizeEmail(profile.email),
        updated_by_name: profile.name || profile.email,
    }, { onConflict: 'application_id' })
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
export async function getApplicationReviewStats(accessToken) {
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
    return (data ?? []).reduce((stats, row) => {
        if (row.decision === 'accept') {
            stats.accepted += 1;
        }
        else if (row.decision === 'waitlist') {
            stats.waitlisted += 1;
        }
        else if (row.decision === 'reject') {
            stats.rejected += 1;
        }
        stats.totalDecisions += 1;
        return stats;
    }, { ...EMPTY_REVIEW_STATS });
}
//# sourceMappingURL=reviews.service.js.map