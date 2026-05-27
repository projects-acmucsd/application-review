import { Router } from 'express';

import { readBearerToken } from '../auth/google-auth.js';
import { listAssignmentsForReviewer } from '../admin/admin.service.js';

export const assignmentsRouter = Router();

assignmentsRouter.get('/me', async (req, res, next) => {
  try {
    const assignments = await listAssignmentsForReviewer(readBearerToken(req));
    res.json({ data: assignments });
  } catch (error) {
    next(error);
  }
});
