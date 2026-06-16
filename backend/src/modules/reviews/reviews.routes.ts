import { Router } from 'express';

import { createHttpError, readBearerToken } from '../auth/google-auth.js';
import {
  getApplicationReviewStats,
  listApplicationReviews,
  upsertApplicationReview,
  type ApplicationReviewInput,
} from './reviews.service.js';

interface ReviewBody {
  rating?: unknown;
  decision?: unknown;
}

type ReviewDecision = 'reject' | 'waitlist' | 'accept';

function isReviewDecision(
  decision: unknown,
): decision is ReviewDecision {
  return (
    decision === 'reject' ||
    decision === 'waitlist' ||
    decision === 'accept'
  );
}

export function parseReviewBody(body: ReviewBody): ApplicationReviewInput {
  if (
    body.rating !== undefined &&
    typeof body.rating !== 'number' &&
    body.rating !== null
  ) {
    throw createHttpError(400, 'Rating must be a number or null.');
  }

  if (
    body.decision !== undefined &&
    body.decision !== 'reject' &&
    body.decision !== 'waitlist' &&
    body.decision !== 'accept' &&
    body.decision !== null
  ) {
    throw createHttpError(400, 'Decision must be reject, waitlist, accept, or null.');
  }

  const rating: number | null =
    typeof body.rating === 'number' ? body.rating : null;
  const decision: ReviewDecision | null = isReviewDecision(body.decision)
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
  } catch (error) {
    next(error);
  }
});

reviewsRouter.get('/stats', async (req, res, next) => {
  try {
    const stats = await getApplicationReviewStats(readBearerToken(req));
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

reviewsRouter.put('/:applicationId', async (req, res, next) => {
  try {
    const review = await upsertApplicationReview({
      accessToken: readBearerToken(req),
      applicationId: req.params.applicationId,
      review: parseReviewBody(req.body as ReviewBody),
    });

    res.json({ data: review });
  } catch (error) {
    next(error);
  }
});
