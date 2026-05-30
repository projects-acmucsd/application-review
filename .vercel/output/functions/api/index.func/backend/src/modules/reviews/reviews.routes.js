import { Router } from 'express';
import { createHttpError, readBearerToken } from '../auth/google-auth.js';
import { getApplicationReviewStats, listApplicationReviews, upsertApplicationReview, } from './reviews.service.js';
function isReviewDecision(decision) {
    return (decision === 'reject' ||
        decision === 'waitlist' ||
        decision === 'accept');
}
function parseReviewBody(body) {
    if (body.rating !== undefined &&
        typeof body.rating !== 'number' &&
        body.rating !== null) {
        throw createHttpError(400, 'Rating must be a number or null.');
    }
    if (body.decision !== undefined &&
        body.decision !== 'reject' &&
        body.decision !== 'waitlist' &&
        body.decision !== 'accept' &&
        body.decision !== null) {
        throw createHttpError(400, 'Decision must be reject, waitlist, accept, or null.');
    }
    const rating = typeof body.rating === 'number' ? body.rating : null;
    const decision = isReviewDecision(body.decision)
        ? body.decision
        : null;
    return {
        rating,
        decision,
    };
}
export const reviewsRouter = Router();
reviewsRouter.get('/', async (req, res, next) => {
    try {
        const reviews = await listApplicationReviews(readBearerToken(req));
        res.json({ data: reviews });
    }
    catch (error) {
        next(error);
    }
});
reviewsRouter.get('/stats', async (req, res, next) => {
    try {
        const stats = await getApplicationReviewStats(readBearerToken(req));
        res.json({ data: stats });
    }
    catch (error) {
        next(error);
    }
});
reviewsRouter.put('/:applicationId', async (req, res, next) => {
    try {
        const review = await upsertApplicationReview({
            accessToken: readBearerToken(req),
            applicationId: req.params.applicationId,
            review: parseReviewBody(req.body),
        });
        res.json({ data: review });
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=reviews.routes.js.map